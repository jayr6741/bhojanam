import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET','POST','PUT'];
export default async function(req,res){
 try{
  if(req.method==='GET'){
   const user=await requirePermission(req,res,'manage_shifts');if(!user)return;
   const r=await db.query("SELECT s.*,u.full_name AS cashier_name FROM pos_shifts s JOIN pos_users u ON u.id=s.cashier_user_id WHERE ($1::boolean OR s.cashier_user_id=$2) ORDER BY s.opened_at DESC LIMIT 200",[user.permissions.includes('view_finance'),user.id]);
   return res.json({shifts:r.rows});
  }
  const user=await requirePermission(req,res,'manage_shifts');if(!user)return;
  const b=req.body||{};
  if(req.method==='POST'&&b.action==='open'){
   const opening=Number(b.openingCash)||0;if(!Number.isFinite(opening)||opening<0)return res.status(400).json({error:'Opening cash must be zero or greater.'});
   const existing=await db.query("SELECT id FROM pos_shifts WHERE cashier_user_id=$1 AND status='open' LIMIT 1",[user.id]);if(existing.rows.length)return res.status(409).json({error:'You already have an open shift.'});
   const id='SHIFT-'+crypto.randomUUID();
   const r=await db.query("INSERT INTO pos_shifts(id,cashier_user_id,opening_cash,notes) VALUES($1,$2,$3,$4) RETURNING *",[id,user.id,opening,String(b.notes||'').slice(0,300)]);
   await db.query("INSERT INTO pos_cash_drawer_entries(id,shift_id,entry_type,amount,reason,performed_by,idempotency_key) VALUES($1,$2,'opening_float',$3,'Opening cash',$4,$5)",['CASH-'+crypto.randomUUID(),id,opening,user.id,id+':opening']);
   await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'shift.open','shift',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,id,JSON.stringify({openingCash:opening})]);
   return res.status(201).json({ok:true,shift:r.rows[0]});
  }
  if(req.method==='POST'&&b.action==='cashMovement'){
   const shiftId=String(b.shiftId||'').trim(),type=b.entryType,amount=Number(b.amount),reason=String(b.reason||'').trim().slice(0,300),key=String(b.idempotencyKey||'').trim().slice(0,180);
   if(!shiftId||!['cash_in','cash_out'].includes(type)||!Number.isFinite(amount)||amount<=0||!reason||!key)return res.status(400).json({error:'Shift, movement type, positive amount, reason and idempotency key are required.'});
   const shift=await db.query("SELECT * FROM pos_shifts WHERE id=$1 AND status='open' AND ($2::boolean OR cashier_user_id=$3)",[shiftId,user.permissions.includes('view_finance'),user.id]);if(!shift.rows.length)return res.status(404).json({error:'Open shift not found.'});
   const prior=await db.query('SELECT * FROM pos_cash_drawer_entries WHERE idempotency_key=$1',[key]);if(prior.rows.length)return res.json({ok:true,entry:prior.rows[0],duplicate:true});
   const r=await db.query('INSERT INTO pos_cash_drawer_entries(id,shift_id,entry_type,amount,reason,performed_by,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',['CASH-'+crypto.randomUUID(),shiftId,type,Number(amount.toFixed(2)),reason,user.id,key]);
   return res.status(201).json({ok:true,entry:r.rows[0]});
  }
  if(req.method==='PUT'&&b.action==='close'){
   const shiftId=String(b.shiftId||'').trim(),counted=Number(b.countedCash),notes=String(b.notes||'').slice(0,300);
   if(!shiftId||!Number.isFinite(counted)||counted<0)return res.status(400).json({error:'Shift and valid counted cash are required.'});
   const shift=await db.query("SELECT * FROM pos_shifts WHERE id=$1 AND status='open' AND ($2::boolean OR cashier_user_id=$3)",[shiftId,user.permissions.includes('view_finance'),user.id]);if(!shift.rows.length)return res.status(404).json({error:'Open shift not found.'});
   const entries=await db.query("SELECT COALESCE(SUM(CASE WHEN entry_type IN ('opening_float','cash_in','cash_sale') THEN amount WHEN entry_type IN ('cash_out','cash_refund') THEN -amount ELSE 0 END),0)::numeric AS expected FROM pos_cash_drawer_entries WHERE shift_id=$1",[shiftId]);
   const expected=Number(entries.rows[0]?.expected)||0;
   const r=await db.query("UPDATE pos_shifts SET status='closed',expected_cash=$2,counted_cash=$3,cash_difference=$3-$2,closed_at=now(),notes=$4 WHERE id=$1 RETURNING *",[shiftId,expected,counted,notes]);
   await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'shift.close','shift',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,shiftId,JSON.stringify({expectedCash:expected,countedCash:counted,difference:counted-expected})]);
   return res.json({ok:true,shift:r.rows[0]});
  }
  return res.status(400).json({error:'Unsupported shift action.'});
 }catch(e){console.error('Shift API failed',e.message);return res.status(500).json({error:'Could not process the shift request.'});}
}
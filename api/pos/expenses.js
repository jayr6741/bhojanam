import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET','POST'];
export default async function(req,res){
 try{
  if(req.method==='GET'){
   const user=await requirePermission(req,res,'view_finance');if(!user)return;
   const from=String(req.query?.from||'').slice(0,10),to=String(req.query?.to||'').slice(0,10);
   const r=await db.query("SELECT * FROM pos_expenses WHERE ($1='' OR expense_date >= $1::date) AND ($2='' OR expense_date <= $2::date) ORDER BY expense_date DESC,created_at DESC LIMIT 1000",[from,to]);
   return res.json({expenses:r.rows,total:r.rows.reduce((s,x)=>s+Number(x.amount||0),0)});
  }
  const user=await requirePermission(req,res,'manage_expenses');if(!user)return;
  const b=req.body||{},category=String(b.category||'').trim().slice(0,80),description=String(b.description||'').trim().slice(0,500),amount=Number(b.amount),method=['Cash','UPI','Card','Online','Other'].includes(b.paymentMethod)?b.paymentMethod:'Cash';
  if(!category||!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:'A category and positive expense amount are required.'});
  const id='EXP-'+crypto.randomUUID();
  const r=await db.query('INSERT INTO pos_expenses(id,category,description,amount,payment_method,expense_date,receipt_reference,created_by,metadata) VALUES($1,$2,$3,$4,$5,COALESCE(NULLIF($6,\'\')::date,CURRENT_DATE),$7,$8,$9::jsonb) RETURNING *',[id,category,description,Number(amount.toFixed(2)),method,String(b.expenseDate||'').slice(0,10),String(b.receiptReference||'').slice(0,120),user.id,JSON.stringify({source:'POS'})]);
  await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'expense.create','expense',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,id,JSON.stringify(r.rows[0])]);
  return res.status(201).json({ok:true,expense:r.rows[0]});
 }catch(e){console.error('Expense API failed',e.message);return res.status(500).json({error:'Could not process the expense request.'});}
}
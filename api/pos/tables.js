import { db } from 'hatchable';
import { randomBytes } from 'node:crypto';
import { requirePermission } from '../../lib/pos-auth.js';
export const access = 'public';
export const methods = ['GET','PUT','POST','DELETE'];
export default async function(req,res){
 try {
  const user=await requirePermission(req,res,req.method==='GET'?'view_tables':'manage_tables');if(!user)return;
  if(req.method==='GET'){const r=await db.query('SELECT number,seats,status,updated_at FROM restaurant_tables ORDER BY number');for(const t of r.rows){let tokenRow=await db.query('SELECT token FROM restaurant_table_qr_tokens WHERE table_number=$1',[t.number]);if(!tokenRow.rows.length){const token=randomBytes(24).toString('base64url');await db.query('INSERT INTO restaurant_table_qr_tokens(table_number,token) VALUES($1,$2) ON CONFLICT(table_number) DO NOTHING',[t.number,token]);tokenRow=await db.query('SELECT token FROM restaurant_table_qr_tokens WHERE table_number=$1',[t.number]);}t.qrToken=tokenRow.rows[0]?.token||null;const m=await db.query('SELECT primary_table_number FROM restaurant_table_merges WHERE table_number=$1',[t.number]);const children=await db.query('SELECT table_number FROM restaurant_table_merges WHERE primary_table_number=$1 ORDER BY table_number',[t.number]);t.mergedInto=m.rows[0]?.primary_table_number||null;t.mergedTables=children.rows.map(x=>x.table_number);}return res.json({tables:r.rows});}
  const b=req.body||{};
  if(req.method==='PUT' && b.action==='merge'){
   const nums=[...new Set((Array.isArray(b.numbers)?b.numbers:[]).map(n=>Math.floor(Number(n))).filter(n=>n>0))];
   if(nums.length<2)return res.status(400).json({error:'Select at least two tables to merge.'});
   const primary=Math.floor(Number(b.primary)||nums[0]);if(!nums.includes(primary))return res.status(400).json({error:'Primary table must be one of the selected tables.'});
   const existing=await db.query('SELECT number,status FROM restaurant_tables WHERE number=ANY($1::int[])', [nums]);if(existing.rows.length!==nums.length)return res.status(404).json({error:'One or more selected tables do not exist.'});
   await db.query('BEGIN');
   try{await db.query('DELETE FROM restaurant_table_merges WHERE table_number=ANY($1::int[]) OR primary_table_number=ANY($1::int[])',[nums]);for(const n of nums){if(n!==primary)await db.query('INSERT INTO restaurant_table_merges(table_number,primary_table_number) VALUES($1,$2) ON CONFLICT(table_number) DO UPDATE SET primary_table_number=EXCLUDED.primary_table_number,merged_at=now()',[n,primary]);}
    await db.query("UPDATE restaurant_tables SET status='Occupied',updated_at=now() WHERE number=ANY($1::int[])",[nums]);await db.query('COMMIT');return res.json({ok:true,primary,numbers:nums,message:'Tables merged. Their unpaid orders will be settled together.'});
   }catch(err){await db.query('ROLLBACK');throw err;}
  }
  if(req.method==='PUT' && b.action==='unmerge'){
   const primary=Math.floor(Number(b.primary));if(!primary)return res.status(400).json({error:'Primary table number is required.'});
   const r=await db.query('DELETE FROM restaurant_table_merges WHERE primary_table_number=$1 RETURNING table_number',[primary]);
   const nums=[primary,...r.rows.map(x=>x.table_number)];
   for(const n of nums){const pending=await db.query("SELECT 1 FROM restaurant_orders WHERE status NOT IN ('Paid','Verified','Cancelled') AND COALESCE((payload->>'tableNumber')::int,0)=$1 LIMIT 1",[n]);if(!pending.rows.length)await db.query("UPDATE restaurant_tables SET status='Available',updated_at=now() WHERE number=$1",[n]);}
   return res.json({ok:true,primary,numbers:nums});
  }
  if(req.method==='DELETE'){
   const number=Math.floor(Number(b.number));if(!number)return res.status(400).json({error:'Valid table number is required.'});
   const found=await db.query('SELECT number,status FROM restaurant_tables WHERE number=$1',[number]);if(!found.rows.length)return res.status(404).json({error:'Table not found.'});
   if(found.rows[0].status!=='Available')return res.status(409).json({error:'Only Available tables can be deleted. Change the table status to Available first.'});
   const pending=await db.query("SELECT id FROM restaurant_orders WHERE status NOT IN ('Paid','Verified','Cancelled') AND COALESCE((payload->>'tableNumber')::int,0)=$1 LIMIT 1",[number]);
   if(pending.rows.length)return res.status(409).json({error:'This table has a pending order and cannot be deleted.'});
   await db.query('DELETE FROM restaurant_tables WHERE number=$1',[number]);return res.json({ok:true,number});
  }
  if(req.method==='POST'){const max=await db.query('SELECT COALESCE(max(number),0)::int AS n FROM restaurant_tables');const number=Math.max(0,max.rows[0].n)+1;const seats=Math.max(1,Math.min(20,Math.floor(Number(b.seats)||4)));const r=await db.query('INSERT INTO restaurant_tables(number,seats,status) VALUES($1,$2,\'Available\') RETURNING number,seats,status,updated_at',[number,seats]);return res.status(201).json({ok:true,table:r.rows[0]});}
  const number=Math.floor(Number(b.number));const status=['Available','Occupied','Reserved','Cleaning'].includes(b.status)?b.status:null;if(!number||!status)return res.status(400).json({error:'Table number and valid status are required.'});const r=await db.query('UPDATE restaurant_tables SET status=$2,updated_at=now() WHERE number=$1 RETURNING number,seats,status,updated_at',[number,status]);if(!r.rows.length)return res.status(404).json({error:'Table not found.'});return res.json({ok:true,table:r.rows[0]});
 }catch(e){console.error('Table operation failed',e.message);return res.status(500).json({error:'Could not update tables.'});}
}
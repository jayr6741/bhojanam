import { db } from 'hatchable';
import { randomBytes } from 'node:crypto';
import { requirePermission } from '../../lib/pos-auth.js';
export const access = 'public';
export const methods = ['GET','PUT','POST','DELETE'];
export default async function(req,res){
 try {
  const user=await requirePermission(req,res,req.method==='GET'?'view_tables':'manage_tables');if(!user)return;
  if(req.method==='GET'){const r=await db.query('SELECT number,seats,status,updated_at FROM restaurant_tables ORDER BY number');for(const t of r.rows){let tokenRow=await db.query('SELECT token FROM restaurant_table_qr_tokens WHERE table_number=$1',[t.number]);if(!tokenRow.rows.length){const token=randomBytes(24).toString('base64url');await db.query('INSERT INTO restaurant_table_qr_tokens(table_number,token) VALUES($1,$2) ON CONFLICT(table_number) DO NOTHING',[t.number,token]);tokenRow=await db.query('SELECT token FROM restaurant_table_qr_tokens WHERE table_number=$1',[t.number]);}t.qrToken=tokenRow.rows[0]?.token||null;}return res.json({tables:r.rows});}
  const b=req.body||{};
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
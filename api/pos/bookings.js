import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET','POST','PUT'];
export default async function(req,res){
 try{
  if(req.method==='GET'){
   const user=await requirePermission(req,res,'view_tables');if(!user)return;
   const r=await db.query('SELECT id,payload,status,created_at,updated_at FROM restaurant_bookings ORDER BY created_at DESC LIMIT 500');
   return res.json({bookings:r.rows.map(x=>({...x.payload,id:x.id,status:x.status,createdAt:x.created_at,updatedAt:x.updated_at}))});
  }
  if(req.method==='POST'){
   const user=await requirePermission(req,res,'manage_reservations');if(!user)return;
   const b=req.body||{},name=String(b.customer||'').trim().slice(0,120),phone=String(b.phone||'').replace(/[^0-9+]/g,'').slice(0,16),reservationAt=String(b.reservationAt||'').trim(),partySize=Math.floor(Number(b.partySize));
   const tableNumber=b.tableNumber?Number(b.tableNumber):null,notes=String(b.notes||'').slice(0,500);
   const time=Date.parse(reservationAt);
   if(!name||!Number.isFinite(time)||time<Date.now()-5*60*1000||!Number.isInteger(partySize)||partySize<1||partySize>100)return res.status(400).json({error:'Enter a customer name, future reservation time and valid party size.'});
   if(tableNumber!==null){const t=await db.query('SELECT number,seats,status FROM restaurant_tables WHERE number=$1',[tableNumber]);if(!t.rows.length)return res.status(400).json({error:'Selected table does not exist.'});if(Number(t.rows[0].seats)<partySize)return res.status(400).json({error:'The selected table does not have enough seats.'});}
   const existing=await db.query("SELECT id,payload,status FROM restaurant_bookings WHERE status IN ('Booked','Confirmed') AND COALESCE((payload->>'tableNumber')::int,0)=COALESCE($1::int,0)",[tableNumber]);
   const conflict=existing.rows.some(x=>{const at=Date.parse(x.payload?.reservationAt||'');return Number.isFinite(at)&&Math.abs(at-time)<120*60*1000;});
   if(tableNumber!==null&&conflict)return res.status(409).json({error:'This table already has a reservation within two hours of that time.'});
   const id='BOOK-'+crypto.randomUUID(),payload={customer:name,phone, reservationAt:new Date(time).toISOString(),partySize,tableNumber,notes};
   const r=await db.query("INSERT INTO restaurant_bookings(id,payload,status) VALUES($1,$2::jsonb,'Booked') RETURNING id,payload,status,created_at,updated_at",[id,JSON.stringify(payload)]);
   await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'reservation.create','booking',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,id,JSON.stringify(payload)]);
   return res.status(201).json({ok:true,booking:{...r.rows[0].payload,id:r.rows[0].id,status:r.rows[0].status,createdAt:r.rows[0].created_at}});
  }
  const user=await requirePermission(req,res,'manage_reservations');if(!user)return;
  const b=req.body||{},id=String(b.id||'').trim(),status=String(b.status||'');
  if(!id||!['Booked','Confirmed','Seated','Completed','Cancelled','No-show'].includes(status))return res.status(400).json({error:'Reservation ID and valid status are required.'});
  const r=await db.query('UPDATE restaurant_bookings SET status=$2,updated_at=now() WHERE id=$1 RETURNING id,payload,status,created_at,updated_at',[id,status]);
  if(!r.rows.length)return res.status(404).json({error:'Reservation not found.'});
  await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'reservation.status','booking',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,id,JSON.stringify({status})]);
  return res.json({ok:true,booking:{...r.rows[0].payload,id:r.rows[0].id,status:r.rows[0].status,createdAt:r.rows[0].created_at}});
 }catch(e){console.error('Reservation API failed',e.message);return res.status(500).json({error:'Could not process the reservation.'});}
}
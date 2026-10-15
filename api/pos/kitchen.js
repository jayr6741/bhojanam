import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET','POST','PUT'];
export default async function(req,res){
 try{
  if(req.method==='GET'){
   const user=await requirePermission(req,res,'view_orders');if(!user)return;
   const stations=await db.query('SELECT * FROM pos_kitchen_stations ORDER BY name');
   const tickets=await db.query("SELECT t.*,o.payload AS order_payload,s.name AS station_name FROM pos_kitchen_tickets t JOIN restaurant_orders o ON o.id=t.order_id LEFT JOIN pos_kitchen_stations s ON s.id=t.station_id WHERE t.status<>'served' AND t.status<>'cancelled' ORDER BY t.created_at ASC LIMIT 300");
   const ids=tickets.rows.map(x=>x.id);
   const items=ids.length?await db.query('SELECT * FROM pos_kitchen_ticket_items WHERE ticket_id=ANY($1::text[]) ORDER BY created_at',[ids]):{rows:[]};
   return res.json({stations:stations.rows,tickets:tickets.rows.map(t=>({...t,items:items.rows.filter(i=>i.ticket_id===t.id)}))});
  }
  const b=req.body||{};
  if(req.method==='POST'){
   const user=await requirePermission(req,res,'manage_kitchen');if(!user)return;
   if(b.action==='createStation'){
    const name=String(b.name||'').trim().slice(0,100);if(!name)return res.status(400).json({error:'Station name is required.'});
    const id='KST-'+crypto.randomUUID();
    const r=await db.query('INSERT INTO pos_kitchen_stations(id,name,routing) VALUES($1,$2,$3::jsonb) RETURNING *',[id,name,JSON.stringify(b.routing||{})]);
    await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'kitchen.station.create','kitchen_station',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,id,JSON.stringify(r.rows[0])]);
    return res.status(201).json({ok:true,station:r.rows[0]});
   }
   if(b.action==='createTicket'){
    const orderId=String(b.orderId||'').trim(),stationId=String(b.stationId||'').trim()||null,key=String(b.idempotencyKey||'').trim().slice(0,180);
    if(!orderId||!key)return res.status(400).json({error:'Order and idempotency key are required.'});
    const prior=await db.query('SELECT response FROM pos_request_idempotency WHERE idempotency_key=$1 AND scope=$2',[key,'kitchen-ticket']);
    if(prior.rows.length&&prior.rows[0].response)return res.json({...prior.rows[0].response,duplicate:true});
    const order=await db.query('SELECT id,payload,status FROM restaurant_orders WHERE id=$1',[orderId]);if(!order.rows.length)return res.status(404).json({error:'Order not found.'});
    if(['Cancelled','Refunded'].includes(order.rows[0].status))return res.status(409).json({error:'Cancelled or refunded orders cannot be sent to the kitchen.'});
    const payload=order.rows[0].payload||{},items=Array.isArray(payload.items)?payload.items:[];
    if(!items.length)return res.status(400).json({error:'Order has no items to send to the kitchen.'});
    const id='KOT-'+crypto.randomUUID();
    const ticket=await db.query("INSERT INTO pos_kitchen_tickets(id,order_id,station_id,status,instructions,created_by) VALUES($1,$2,$3,'pending',$4,$5) RETURNING *",[id,orderId,stationId,String(payload.specialInstructions||payload.notes||'').slice(0,1000),user.id]);
    const created=[];
    for(const item of items){const r=await db.query("INSERT INTO pos_kitchen_ticket_items(id,ticket_id,menu_item_id,item_name,quantity,instructions) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",['KOTI-'+crypto.randomUUID(),id,String(item.id||''),String(item.name||'Item').slice(0,120),Math.max(1,Number(item.qty)||1),String(item.instructions||payload.specialInstructions||'').slice(0,500)]);created.push(r.rows[0]);}
    const response={ok:true,ticket:{...ticket.rows[0],items:created}};
    await db.query("INSERT INTO pos_request_idempotency(idempotency_key,scope,request_hash,response) VALUES($1,'kitchen-ticket',$2,$3::jsonb) ON CONFLICT(idempotency_key) DO NOTHING",[key,orderId,JSON.stringify(response)]);
    await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'kitchen.ticket.create','kitchen_ticket',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,id,JSON.stringify({orderId,stationId,items:created.length})]);
    return res.status(201).json(response);
   }
   return res.status(400).json({error:'Unsupported kitchen action.'});
  }
  const user=await requirePermission(req,res,'update_order_status');if(!user)return;
  const ticketId=String(b.ticketId||'').trim(),status=String(b.status||'');
  if(!ticketId||!['pending','preparing','ready','served','cancelled'].includes(status))return res.status(400).json({error:'Ticket and valid status are required.'});
  const old=await db.query('SELECT * FROM pos_kitchen_tickets WHERE id=$1',[ticketId]);if(!old.rows.length)return res.status(404).json({error:'Kitchen ticket not found.'});
  if(['served','cancelled'].includes(old.rows[0].status)&&old.rows[0].status!==status)return res.status(409).json({error:'Served or cancelled kitchen tickets cannot be reopened.'});
  const updated=await db.query('UPDATE pos_kitchen_tickets SET status=$2,updated_at=now() WHERE id=$1 RETURNING *',[ticketId,status]);
  await db.query('UPDATE pos_kitchen_ticket_items SET status=$2 WHERE ticket_id=$1 AND status<>\'cancelled\'',[ticketId,status]);
  if(b.action==='reprint')await db.query('UPDATE pos_kitchen_tickets SET reprint_count=reprint_count+1,updated_at=now() WHERE id=$1',[ticketId]);
  await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,$4,'kitchen_ticket',$5,$6::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,b.action==='reprint'?'kitchen.ticket.reprint':'kitchen.ticket.status',ticketId,JSON.stringify({status,previousStatus:old.rows[0].status})]);
  return res.json({ok:true,ticket:updated.rows[0]});
 }catch(e){console.error('Kitchen API failed',e.message);return res.status(500).json({error:'Could not process the kitchen request.'});}
}
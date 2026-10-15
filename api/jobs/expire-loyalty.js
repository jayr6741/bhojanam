import { db } from 'hatchable';
export const access='scheduler';
export const methods=['POST'];
export default async function(req,res){
 try{
  const expired=await db.query("SELECT e.* FROM pos_loyalty_ledger e WHERE e.entry_type='earned' AND e.expires_at IS NOT NULL AND e.expires_at<=now() AND NOT EXISTS (SELECT 1 FROM pos_loyalty_ledger x WHERE x.idempotency_key='expire:'||e.id) AND NOT EXISTS (SELECT 1 FROM pos_loyalty_ledger x WHERE x.entry_type='reversed' AND x.metadata->>'originalLedgerId'=e.id) ORDER BY e.expires_at ASC LIMIT 500");
  let processed=0,pointsExpired=0;
  for(const entry of expired.rows){
   const amount=Math.max(0,Number(entry.points)||0);if(!amount)continue;
   const ledger=await db.query("INSERT INTO pos_loyalty_ledger(id,customer_phone,order_id,entry_type,points,reason,idempotency_key,metadata) VALUES($1,$2,$3,'expired',$4,'Loyalty points expired','expire:'||$5,$6::jsonb) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id",['LOY-'+crypto.randomUUID(),entry.customer_phone,entry.order_id,-amount,entry.id,JSON.stringify({originalLedgerId:entry.id,expiredAt:new Date().toISOString()})]);
   if(!ledger.rows.length)continue;
   await db.query('UPDATE restaurant_customers SET points=GREATEST(0,points-$2),updated_at=now() WHERE phone=$1',[entry.customer_phone,amount]);
   await db.query("INSERT INTO pos_audit_logs(id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,'System','loyalty.expire','customer',$2,$3::jsonb)",['AUD-'+crypto.randomUUID(),entry.customer_phone,JSON.stringify({points:amount,ledgerId:entry.id})]);
   processed++;pointsExpired+=amount;
  }
  return res.json({ok:true,processed,pointsExpired});
 }catch(e){console.error('Loyalty expiry job failed',e.message);return res.status(500).json({error:'Could not expire loyalty points.'});}
}
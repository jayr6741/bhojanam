import { db, events } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';

export const access = 'public';
export const methods = ['GET','POST'];

export default async function(req,res){
  try{
    if(req.method==='GET'){
      const user=await requirePermission(req,res,'view_orders'); if(!user)return;
      const orderId=String(req.query?.orderId||'').trim();
      const result=orderId
        ? await db.query('SELECT * FROM pos_payments WHERE order_id=$1 ORDER BY created_at DESC LIMIT 200',[orderId])
        : await db.query('SELECT * FROM pos_payments ORDER BY created_at DESC LIMIT 300');
      return res.json({payments:result.rows});
    }
    const user=await requirePermission(req,res,'refund_orders'); if(!user)return;
    const b=req.body||{};
    const paymentId=String(b.paymentId||'').trim();
    const key=String(b.idempotencyKey||'').trim().slice(0,180);
    const reason=String(b.reason||'').trim().slice(0,500);
    const amount=Number(b.amount);
    if(!paymentId||!key||!reason||!Number.isFinite(amount)||amount<=0)
      return res.status(400).json({error:'Payment, idempotency key, reason and a positive refund amount are required.'});
    const prior=await db.query('SELECT * FROM pos_payments WHERE idempotency_key=$1',[key]);
    if(prior.rows.length)return res.json({ok:true,refund:prior.rows[0],duplicate:true});
    const originalResult=await db.query("SELECT * FROM pos_payments WHERE id=$1 AND entry_type='payment' AND status IN ('successful','partially_refunded')",[paymentId]);
    if(!originalResult.rows.length)return res.status(404).json({error:'Successful payment not found.'});
    const original=originalResult.rows[0];
    const existing=await db.query("SELECT COALESCE(SUM(amount),0)::numeric AS refunded FROM pos_payments WHERE parent_payment_id=$1 AND entry_type='refund' AND status='successful'",[paymentId]);
    const refunded=Number(existing.rows[0]?.refunded)||0;
    const remaining=Math.round((Number(original.amount)-refunded)*100)/100;
    if(amount>remaining+0.001)return res.status(400).json({error:'Refund amount exceeds the remaining refundable balance.'});
    const refundId='REF-'+crypto.randomUUID();
    const insert=await db.query("INSERT INTO pos_payments(id,order_id,entry_type,payment_method,amount,status,parent_payment_id,idempotency_key,cashier_user_id,metadata) VALUES($1,$2,'refund',$3,$4,'successful',$5,$6,$7,$8::jsonb) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *",[refundId,original.order_id,original.payment_method,Number(amount.toFixed(2)),paymentId,key,user.id,JSON.stringify({reason,originalPaymentId:paymentId})]);
    if(!insert.rows.length){
      const duplicate=await db.query('SELECT * FROM pos_payments WHERE idempotency_key=$1',[key]);
      return res.json({ok:true,refund:duplicate.rows[0],duplicate:true});
    }
    const newRefunded=refunded+amount;
    const fullyRefunded=newRefunded>=Number(original.amount)-0.001;
    await db.query("UPDATE pos_payments SET status=$2,updated_at=now() WHERE id=$1",[paymentId,fullyRefunded?'refunded':'partially_refunded']);
    const orderTotals=await db.query("SELECT COALESCE(SUM(amount) FILTER (WHERE entry_type='payment' AND status IN ('successful','partially_refunded','refunded')),0)::numeric AS collected,COALESCE(SUM(amount) FILTER (WHERE entry_type='refund' AND status='successful'),0)::numeric AS refunded FROM pos_payments WHERE order_id=$1",[original.order_id]);
    const orderFullyRefunded=Number(orderTotals.rows[0]?.collected||0)>0&&Number(orderTotals.rows[0]?.refunded||0)>=Number(orderTotals.rows[0]?.collected||0)-0.001;
    const groupOrderIds=Array.isArray(original.metadata?.groupOrderIds)?original.metadata.groupOrderIds.map(String):[original.order_id];const orderResult=await db.query('SELECT id,payload,status FROM restaurant_orders WHERE id=ANY($1::text[])',[groupOrderIds]);
    const refundedTotal=Number(orderTotals.rows[0]?.refunded)||0;
    for(const row of orderResult.rows){const old=row.payload||{};await db.query("UPDATE restaurant_orders SET status=CASE WHEN $2 THEN 'Refunded' ELSE status END,payload=$3::jsonb,updated_at=now() WHERE id=$1",[row.id,orderFullyRefunded,JSON.stringify({...old,refundStatus:orderFullyRefunded?'refunded':'partially_refunded',refundedAmount:refundedTotal,lastRefundAt:new Date().toISOString()})]);}
    if(orderFullyRefunded){const loyalty=await db.query("SELECT * FROM pos_loyalty_ledger WHERE order_id=$1 AND entry_type IN ('earned','redeemed')",[original.order_id]);for(const entry of loyalty.rows){const reversal=await db.query("INSERT INTO pos_loyalty_ledger(id,customer_phone,order_id,entry_type,points,reason,idempotency_key,performed_by,metadata) VALUES($1,$2,$3,'reversed',$4,'Full bill refund',$5,$6,$7::jsonb) ON CONFLICT(idempotency_key) DO NOTHING RETURNING points",['LOY-'+crypto.randomUUID(),entry.customer_phone,original.order_id,-Number(entry.points),original.order_id+':refund:loyalty:'+entry.id,user.id,JSON.stringify({originalLedgerId:entry.id,refundId})]);if(reversal.rows.length)await db.query('UPDATE restaurant_customers SET points=GREATEST(0,points+$2),updated_at=now() WHERE phone=$1',[entry.customer_phone,-Number(entry.points)]);}const soldStock=await db.query("SELECT * FROM pos_inventory_movements WHERE reference_type='order' AND reference_id=$1 AND movement_type='sale'",[original.order_id]);for(const move of soldStock.rows){const stockKey=original.order_id+':refund:inventory:'+move.id;const reversal=await db.query("INSERT INTO pos_inventory_movements(id,inventory_item_id,movement_type,quantity_delta,unit_cost,reference_type,reference_id,reason,performed_by,idempotency_key) VALUES($1,$2,'reversal',$3,$4,'refund',$5,'Stock restored after full refund',$6,$7) ON CONFLICT(idempotency_key) DO NOTHING RETURNING quantity_delta",['MOV-'+crypto.randomUUID(),move.inventory_item_id,-Number(move.quantity_delta),move.unit_cost,original.order_id,user.id,stockKey]);if(reversal.rows.length)await db.query('UPDATE pos_inventory_items SET current_stock=current_stock+$2,updated_at=now() WHERE id=$1',[move.inventory_item_id,Number(reversal.rows[0].quantity_delta)]);}}
    await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data,request_id) VALUES($1,$2,$3,'payment.refund','payment',$4,$5::jsonb,$6)",['AUD-'+crypto.randomUUID(),user.id,user.name,paymentId,JSON.stringify({refundId,orderId:original.order_id,amount,reason,paymentFullyRefunded:fullyRefunded,orderFullyRefunded}),String(req.headers?.['x-request-id']||'').slice(0,120)||null]);
    try{await events.publish('pos-orders','changed',{orderId:original.order_id,status:orderFullyRefunded?'Refunded':'Paid'});await events.publish('pos-kitchen','changed',{orderId:original.order_id});}catch(eventError){console.error('Realtime publish failed after refund',eventError.message);}
    return res.status(201).json({ok:true,refund:insert.rows[0],remaining:Math.max(0,Number(original.amount)-newRefunded),paymentFullyRefunded:fullyRefunded,orderFullyRefunded});
  }catch(e){
    console.error('Payment API failed',e.message);
    return res.status(500).json({error:'Could not process the payment request.'});
  }
}
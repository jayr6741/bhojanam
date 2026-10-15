import { db } from 'hatchable';
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
    const orderResult=await db.query('SELECT payload,status FROM restaurant_orders WHERE id=$1',[original.order_id]);
    if(orderResult.rows.length){
      const old=orderResult.rows[0].payload||{};
      const refundTotalResult=await db.query("SELECT COALESCE(SUM(amount),0)::numeric AS total FROM pos_payments WHERE order_id=$1 AND entry_type='refund' AND status='successful'",[original.order_id]);
      const refundedTotal=Number(refundTotalResult.rows[0]?.total)||0;
      await db.query("UPDATE restaurant_orders SET status=CASE WHEN $2 THEN 'Refunded' ELSE status END,payload=$3::jsonb,updated_at=now() WHERE id=$1",[original.order_id,fullyRefunded,JSON.stringify({...old,refundStatus:fullyRefunded?'refunded':'partially_refunded',refundedAmount:refundedTotal,lastRefundAt:new Date().toISOString()})]);
    }
    await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data,request_id) VALUES($1,$2,$3,'payment.refund','payment',$4,$5::jsonb,$6)",['AUD-'+crypto.randomUUID(),user.id,user.name,paymentId,JSON.stringify({refundId,orderId:original.order_id,amount,reason,fullyRefunded}),String(req.headers?.['x-request-id']||'').slice(0,120)||null]);
    return res.status(201).json({ok:true,refund:insert.rows[0],remaining:Math.max(0,Number(original.amount)-newRefunded),fullyRefunded});
  }catch(e){
    console.error('Payment API failed',e.message);
    return res.status(500).json({error:'Could not process the payment request.'});
  }
}
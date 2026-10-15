import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access = 'public';
export const methods = ['GET','POST','PUT'];
export default async function (req, res) {
  try {
    const user = await requirePermission(req,res,req.method==='GET'?'view_orders':req.method==='POST'?'create_bill':'update_order_status'); if(!user)return;
    if (req.method === 'GET') {
      const r = await db.query('SELECT id, payload, status, verified, created_at FROM restaurant_orders ORDER BY created_at DESC LIMIT 300');
      return res.json({ orders: r.rows.map(x => ({ ...x.payload, id:x.id, status:x.status, verified:x.verified, createdAt:x.created_at })) });
    }
    const b = req.body || {};
    if (req.method === 'PUT') {
      const id = String(b.id || '').trim();
      if (b.action === 'hold' || b.action === 'resume') {
        if (!id) return res.status(400).json({error:'Order ID is required.'});
        const nextStatus=b.action==='hold'?'Held':'Pending';
        const r=await db.query('UPDATE restaurant_orders SET status=$2,payload=jsonb_set(payload,\'{status}\',to_jsonb($2::text),true),updated_at=now() WHERE id=$1 AND status NOT IN (\'Paid\',\'Verified\',\'Cancelled\') RETURNING id,payload,status,verified,created_at',[id,nextStatus]);
        if(!r.rows.length)return res.status(404).json({error:'Open order not found or already settled.'});
        return res.json({ok:true,order:{...r.rows[0].payload,id:r.rows[0].id,status:r.rows[0].status,verified:r.rows[0].verified,createdAt:r.rows[0].created_at}});
      }
      if (b.action === 'settle') {
        if (!id) return res.status(400).json({error:'Order ID is required.'});
        const ids=[...new Set((Array.isArray(b.ids)?b.ids:[id]).map(x=>String(x||'').trim()).filter(Boolean))];
        if(!ids.length)return res.status(400).json({error:'Order ID is required.'});
        const found=await db.query('SELECT id,payload,status,verified FROM restaurant_orders WHERE id=ANY($1::text[]) ORDER BY created_at',[ids]);
        if(found.rows.length!==ids.length)return res.status(404).json({error:'One or more orders were not found.'});
        if(found.rows.some(x=>x.payload?.paidAt||['Paid','Verified','Cancelled'].includes(x.status)))return res.status(409).json({error:'One of these orders is already settled or cancelled.'});
        const primaryRow=found.rows.find(x=>x.id===id)||found.rows[0];
        const current=ids.length===1?(primaryRow.payload||{}):{...(primaryRow.payload||{}),items:found.rows.flatMap(x=>(x.payload?.items||[])),subtotal:found.rows.reduce((sum,x)=>sum+(Number(x.payload?.subtotal)|| (x.payload?.items||[]).reduce((s,it)=>s+(Number(it.price)||0)*(Number(it.qty)||1),0)),0),tableNumber:primaryRow.payload?.tableNumber||null,mergedOrderIds:ids};
        const phone = String(b.phone || current.phone || '').replace(/[^0-9+]/g,'').slice(0,16);
        const customerName = String(b.customer || current.customer || 'Walk-in customer').trim().slice(0,120);
        const subtotal = Number(current.subtotal) || (Array.isArray(current.items)?current.items.reduce((s,x)=>s+(Number(x.price)||0)*(Number(x.qty)||1),0):0);
        const manualDiscount=Math.min(subtotal,Math.max(0,Number(b.discountAmount)||Number(current.manualDiscount)||0));
        const cfgResult = await db.query("SELECT value FROM restaurant_config WHERE key='loyalty'");
        const cfg = cfgResult.rows[0]?.value || {earning:10,spend:100,redeemPoints:100,redeemValue:50};
        let pointsBefore=0, pointsRedeemed=Math.max(0,Math.floor(Number(b.redeemPoints)||0)), discount=0, pointsEarned=0, customerRow=null;
        if(phone){
          const cr=await db.query('SELECT phone,name,points,visits FROM restaurant_customers WHERE phone=$1',[phone]);
          customerRow=cr.rows[0]||null;
          if(!customerRow){const nr=await db.query("INSERT INTO restaurant_customers(phone,name,points,visits,status) VALUES($1,$2,0,0,'New') ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name RETURNING phone,name,points,visits",[phone,customerName]);customerRow=nr.rows[0];}
          pointsBefore=Number(customerRow.points)||0;
          if(pointsRedeemed>pointsBefore)return res.status(400).json({error:'Customer does not have enough loyalty points.'});
          if(pointsRedeemed>0){const unit=Math.max(1,Number(cfg.redeemPoints)||100),reward=Math.max(0,Number(cfg.redeemValue)||0);discount=Math.min(subtotal,Math.floor(pointsRedeemed/unit)*reward);if(discount<=0)return res.status(400).json({error:'Not enough points for a reward.'});pointsRedeemed=Math.floor(discount/(reward||1))*unit;}
          pointsEarned=Math.floor(Math.max(0,subtotal-discount-manualDiscount)/Math.max(1,Number(cfg.spend)||100))*Math.max(0,Number(cfg.earning)||0);
        } else if(pointsRedeemed>0)return res.status(400).json({error:'Enter customer mobile number to redeem points.'});
        const totalDiscount=Math.min(subtotal,discount+manualDiscount),taxable=Math.max(0,subtotal-totalDiscount),taxRate=Math.max(0,Math.min(28,Number(current.taxRate)||5)),tax=Math.round(taxable*taxRate)/100,total=Math.round(taxable+tax);
        const updated={...current,customer:customerName,phone,subtotal,discount:totalDiscount,loyaltyDiscount:discount,manualDiscount,notes:String(b.notes||current.notes||'').slice(0,500),redeemPoints:pointsRedeemed,pointsEarned,tax,taxRate,total,paymentMethod:['Cash','UPI','Card','Split','Points','Other'].includes(b.paymentMethod)?b.paymentMethod:'Cash',status:'Paid',paidAt:new Date().toISOString()};
        for(const orderId of ids){const row=found.rows.find(x=>x.id===orderId);const paidPayload={...(row?.payload||{}),status:'Paid',paidAt:updated.paidAt,paymentMethod:updated.paymentMethod,customer:updated.customer,phone:updated.phone,groupBillId:id,groupTotal:total,groupSubtotal:subtotal,groupDiscount:discount,groupTax:tax,groupTaxRate:taxRate,groupPointsEarned:pointsEarned,groupRedeemPoints:pointsRedeemed,groupBillItems:updated.items};await db.query("UPDATE restaurant_orders SET status='Paid',payload=$2::jsonb,verified=true,updated_at=now() WHERE id=$1",[orderId,JSON.stringify(paidPayload)]);}
        if(customerRow){const balance=Math.max(0,pointsBefore-pointsRedeemed)+pointsEarned;await db.query("UPDATE restaurant_customers SET name=$2,points=$3,visits=visits+1,status=CASE WHEN $3>=300 THEN 'VIP' ELSE 'Active' END,updated_at=now() WHERE phone=$1",[phone,customerName,balance]);}
        if(updated.tableNumber){const merged=await db.query('SELECT table_number FROM restaurant_table_merges WHERE primary_table_number=$1',[updated.tableNumber]);const tableNumbers=[updated.tableNumber,...merged.rows.map(x=>x.table_number)];await db.query('DELETE FROM restaurant_table_merges WHERE primary_table_number=$1 OR table_number=ANY($2::int[])',[updated.tableNumber,tableNumbers]);for(const tableNo of tableNumbers){const pending=await db.query("SELECT 1 FROM restaurant_orders WHERE status NOT IN ('Paid','Verified','Cancelled') AND COALESCE((payload->>'tableNumber')::int,0)=$1 LIMIT 1",[tableNo]);if(!pending.rows.length)await db.query("UPDATE restaurant_tables SET status='Available',updated_at=now() WHERE number=$1",[tableNo]);}}
        return res.json({ok:true,order:updated,loyalty:customerRow?{pointsBefore,pointsRedeemed,pointsEarned,pointsBalance:Math.max(0,pointsBefore-pointsRedeemed)+pointsEarned}:null});
      }
      const status = ['Pending','Held','Preparing','Ready','Served','Verified','Cancelled'].includes(b.status) ? b.status : null;
      if (!id || !status) return res.status(400).json({ error:'Order ID and valid status are required.' });
      const r = await db.query("UPDATE restaurant_orders SET status=$2, payload=jsonb_set(payload, '{status}', to_jsonb($2::text), true), verified=CASE WHEN $2='Verified' THEN true ELSE verified END, updated_at=now() WHERE id=$1 RETURNING id,payload,status,verified,created_at",[id,status]);
      if (!r.rows.length) return res.status(404).json({error:'Order not found.'});
      return res.json({ok:true,order:{...r.rows[0].payload,id:r.rows[0].id,status:r.rows[0].status,verified:r.rows[0].verified,createdAt:r.rows[0].created_at}});
    }
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return res.status(400).json({error:'Add at least one menu item.'});
    const cleanItems = items.map(x=>({id:String(x.id||''),name:String(x.name||'Item').slice(0,120),price:Math.max(0,Number(x.price)||0),qty:Math.max(1,Math.min(99,Math.floor(Number(x.qty)||1)))}));
    const subtotal = cleanItems.reduce((s,x)=>s+x.price*x.qty,0);
    const taxRate = Math.max(0,Math.min(28,Number(b.taxRate)||0));
    const manualDiscount=Math.min(subtotal,Math.max(0,Number(b.discountAmount)||0));
    const phone = String(b.phone||'').replace(/[^0-9+]/g,'').slice(0,16);
    const customerName = String(b.customer||'Walk-in customer').trim().slice(0,120)||'Walk-in customer';
    const loyaltyCfg = await db.query("SELECT value FROM restaurant_config WHERE key='loyalty'");
    const cfg = loyaltyCfg.rows[0]?.value || {earning:10,spend:100,redeemPoints:100,redeemValue:50};
    let customerRow = null, pointsBefore = 0, pointsRedeemed = 0, discount = 0, pointsEarned = 0;
    if (phone) {
      const cr = await db.query('SELECT phone,name,points,visits FROM restaurant_customers WHERE phone=$1',[phone]);
      customerRow = cr.rows[0] || null;
      if (!customerRow) {
        const created = await db.query("INSERT INTO restaurant_customers(phone,name,points,visits,status) VALUES($1,$2,0,0,'New') ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name RETURNING phone,name,points,visits",[phone,customerName]);
        customerRow = created.rows[0];
      }
      pointsBefore = Number(customerRow.points)||0;
      pointsRedeemed = Math.max(0,Math.floor(Number(b.redeemPoints)||0));
      if (pointsRedeemed > pointsBefore) return res.status(400).json({error:'Customer does not have enough loyalty points.'});
      if (pointsRedeemed > 0) {
        const redeemUnit = Math.max(1,Number(cfg.redeemPoints)||100);
        const reward = Math.max(0,Number(cfg.redeemValue)||0);
        discount = Math.min(subtotal,Math.floor(pointsRedeemed/redeemUnit)*reward);
        if (discount<=0) return res.status(400).json({error:'Not enough points for a reward.'});
        pointsRedeemed = Math.floor(discount/(reward||1))*redeemUnit;
      }
      const eligibleSpend = Math.max(0,subtotal-discount);
      pointsEarned = Math.floor(eligibleSpend/Math.max(1,Number(cfg.spend)||100))*Math.max(0,Number(cfg.earning)||0);
    } else if (Number(b.redeemPoints)>0) return res.status(400).json({error:'Enter customer mobile number to redeem points.'});
    const totalDiscount=Math.min(subtotal,discount+manualDiscount);
    pointsEarned=Math.floor(Math.max(0,subtotal-totalDiscount)/Math.max(1,Number(cfg.spend)||100))*Math.max(0,Number(cfg.earning)||0);
    const taxable = Math.max(0,subtotal-totalDiscount);
    const tax = Math.round(taxable*taxRate)/100;
    const total = Math.round(taxable+tax);
    const id = 'POS-'+Date.now().toString(36).toUpperCase();
    const orderStatus=b.status==='Held'?'Held':'Pending';
    const order = {id,source:b.source==='QR'?'QR':'POS',tableNumber:b.tableNumber?Number(b.tableNumber):null,customer:customerName,phone,items:cleanItems,subtotal,discount:totalDiscount,manualDiscount,redeemPoints:pointsRedeemed,pointsEarned,tax,taxRate,total,paymentMethod:['Cash','UPI','Card','Split','Points','Other'].includes(b.paymentMethod)?b.paymentMethod:'Cash',notes:String(b.notes||'').slice(0,500),status:orderStatus,createdAt:new Date().toISOString()};
    await db.query('INSERT INTO restaurant_orders (id,payload,status) VALUES ($1,$2::jsonb,$3)',[id,JSON.stringify(order),orderStatus]);
    if (customerRow) {
      const updatedPoints = Math.max(0,pointsBefore-pointsRedeemed)+pointsEarned;
      await db.query("UPDATE restaurant_customers SET name=$2,points=$3,visits=visits+1,status=CASE WHEN $3>=300 THEN 'VIP' ELSE 'Active' END,updated_at=now() WHERE phone=$1",[phone,customerName,updatedPoints]);
    }
    if (order.tableNumber) await db.query("UPDATE restaurant_tables SET status='Occupied',updated_at=now() WHERE number=$1",[order.tableNumber]);
    return res.status(201).json({ok:true,order,loyalty:customerRow?{pointsBefore,pointsRedeemed,pointsEarned,pointsBalance:Math.max(0,pointsBefore-pointsRedeemed)+pointsEarned}:null});
  } catch(e) { console.error('Order operation failed',e.message); return res.status(500).json({error:'Could not save the order.'}); }
}
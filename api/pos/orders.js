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
      const status = ['Pending','Preparing','Ready','Served','Verified','Cancelled'].includes(b.status) ? b.status : null;
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
    const taxable = Math.max(0,subtotal-discount);
    const tax = Math.round(taxable*taxRate)/100;
    const total = Math.round(taxable+tax);
    const id = 'POS-'+Date.now().toString(36).toUpperCase();
    const order = {id,source:b.source==='QR'?'QR':'POS',tableNumber:b.tableNumber?Number(b.tableNumber):null,customer:customerName,phone,items:cleanItems,subtotal,discount,redeemPoints:pointsRedeemed,pointsEarned,tax,taxRate,total,paymentMethod:['Cash','UPI','Card'].includes(b.paymentMethod)?b.paymentMethod:'Cash',status:'Pending',createdAt:new Date().toISOString()};
    await db.query('INSERT INTO restaurant_orders (id,payload,status) VALUES ($1,$2::jsonb,$3)',[id,JSON.stringify(order),'Pending']);
    if (customerRow) {
      const updatedPoints = Math.max(0,pointsBefore-pointsRedeemed)+pointsEarned;
      await db.query("UPDATE restaurant_customers SET name=$2,points=$3,visits=visits+1,status=CASE WHEN $3>=300 THEN 'VIP' ELSE 'Active' END,updated_at=now() WHERE phone=$1",[phone,customerName,updatedPoints]);
    }
    if (order.tableNumber) await db.query("UPDATE restaurant_tables SET status='Occupied',updated_at=now() WHERE number=$1",[order.tableNumber]);
    return res.status(201).json({ok:true,order,loyalty:customerRow?{pointsBefore,pointsRedeemed,pointsEarned,pointsBalance:Math.max(0,pointsBefore-pointsRedeemed)+pointsEarned}:null});
  } catch(e) { console.error('Order operation failed',e.message); return res.status(500).json({error:'Could not save the order.'}); }
}
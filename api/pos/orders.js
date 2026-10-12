import { db } from 'hatchable';
export const access = 'admin';
export const methods = ['GET','POST','PUT'];
export default async function (req, res) {
  try {
    if (req.method === 'GET') {
      const r = await db.query('SELECT id, payload, status, verified, created_at FROM restaurant_orders ORDER BY created_at DESC LIMIT 300');
      return res.json({ orders: r.rows.map(x => ({ ...x.payload, id:x.id, status:x.status, verified:x.verified, createdAt:x.created_at })) });
    }
    const b = req.body || {};
    if (req.method === 'PUT') {
      const id = String(b.id || '').trim();
      const status = ['Pending','Preparing','Ready','Served','Verified','Cancelled'].includes(b.status) ? b.status : null;
      if (!id || !status) return res.status(400).json({ error:'Order ID and valid status are required.' });
      const r = await db.query('UPDATE restaurant_orders SET status=$2, payload=jsonb_set(payload, \'{status}\', to_jsonb($2::text), true), verified=CASE WHEN $2=\'Verified\' THEN true ELSE verified END, updated_at=now() WHERE id=$1 RETURNING id,payload,status,verified,created_at',[id,status]);
      if (!r.rows.length) return res.status(404).json({error:'Order not found.'});
      return res.json({ok:true,order:{...r.rows[0].payload,id:r.rows[0].id,status:r.rows[0].status,verified:r.rows[0].verified,createdAt:r.rows[0].created_at}});
    }
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return res.status(400).json({error:'Add at least one menu item.'});
    const cleanItems = items.map(x=>({id:String(x.id||''),name:String(x.name||'Item').slice(0,120),price:Math.max(0,Number(x.price)||0),qty:Math.max(1,Math.min(99,Math.floor(Number(x.qty)||1)))}));
    const subtotal = cleanItems.reduce((s,x)=>s+x.price*x.qty,0);
    const taxRate = Math.max(0,Math.min(28,Number(b.taxRate)||0));
    const tax = Math.round(subtotal*taxRate)/100;
    const total = Math.round(subtotal+tax);
    const id = 'POS-'+Date.now().toString(36).toUpperCase();
    const order = {id,source:b.source==='QR'?'QR':'POS',tableNumber:b.tableNumber?Number(b.tableNumber):null,customer:String(b.customer||'Walk-in customer').slice(0,120),phone:String(b.phone||'').replace(/[^0-9+]/g,'').slice(0,16),items:cleanItems,subtotal,tax,taxRate,total,paymentMethod:['Cash','UPI','Card'].includes(b.paymentMethod)?b.paymentMethod:'Cash',status:'Pending',createdAt:new Date().toISOString()};
    await db.query('INSERT INTO restaurant_orders (id,payload,status) VALUES ($1,$2::jsonb,$3)',[id,JSON.stringify(order),'Pending']);
    if (order.tableNumber) await db.query("UPDATE restaurant_tables SET status='Occupied',updated_at=now() WHERE number=$1",[order.tableNumber]);
    return res.status(201).json({ok:true,order});
  } catch(e) { console.error('Order operation failed',e.message); return res.status(500).json({error:'Could not save the order.'}); }
}
import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET'];
const paid=o=>!!(o?.paidAt||o?.status==='Paid'||o?.status==='Verified');
export default async function(req,res){
 try{
  const user=await requirePermission(req,res,'view_dashboard');if(!user)return;
  const q=req.query||{},from=String(q.from||'').slice(0,10),to=String(q.to||'').slice(0,10);
  const method=String(q.method||'all'),status=String(q.status||'paid'),source=String(q.source||'all'),search=String(q.search||'').trim().toLowerCase();
  const min=q.min!==undefined&&q.min!==''&&Number.isFinite(Number(q.min))?Number(q.min):null,max=q.max!==undefined&&q.max!==''&&Number.isFinite(Number(q.max))?Number(q.max):null;
  const r=await db.query('SELECT id,payload,status,created_at,updated_at FROM restaurant_orders ORDER BY created_at DESC LIMIT 5000');
  const all=r.rows.map(x=>({...x.payload,id:x.id,status:x.status,createdAt:x.created_at,updatedAt:x.updated_at,paidAt:x.payload?.paidAt||null}));
  const unique=[],seen=new Set();for(const o of all){const key=String(o.groupBillId||o.id);if(seen.has(key))continue;seen.add(key);unique.push(o);}
  const filtered=unique.filter(o=>{
   const isPaid=paid(o),d=String(o.paidAt||o.createdAt||'').slice(0,10),m=String(o.paymentMethod||'Cash');
   if(status==='paid'&&!isPaid)return false;if(status==='pending'&&(isPaid||o.status==='Cancelled'))return false;if(status==='cancelled'&&o.status!=='Cancelled')return false;
   if(from&&d<from)return false;if(to&&d>to)return false;
   if(method==='online'&&!['UPI','Card'].includes(m)&&!(m==='Split'&&Number(o.paymentBreakdown?.onlineAmount)>0))return false;
   if(method==='cash'&&m!=='Cash'&&!(m==='Split'&&Number(o.paymentBreakdown?.cashAmount)>0))return false;
   if(method!=='all'&&!['online','cash'].includes(method)&&m!==method)return false;
   if(source!=='all'&&String(o.source||'POS')!==source)return false;
   if(search&&!String([o.id,o.customer,o.phone,o.tableNumber,o.source].join(' ')).toLowerCase().includes(search))return false;
   const total=Number(o.total??o.groupTotal)||0;if(min!==null&&total<min)return false;if(max!==null&&total>max)return false;return true;
  });
  const completed=filtered.filter(paid);let cash=0,online=0,card=0,upi=0,other=0;
  for(const o of completed){const amount=Number(o.total??o.groupTotal)||0,m=String(o.paymentMethod||'Cash'),b=o.paymentBreakdown||{};if(m==='Split'){online+=Number(b.onlineAmount)||0;cash+=Number(b.cashAmount)||0;}else if(m==='Cash')cash+=amount;else if(m==='UPI'){upi+=amount;online+=amount;}else if(m==='Card'){card+=amount;online+=amount;}else other+=amount;}
  return res.json({orders:filtered,summary:{matchedOrders:filtered.length,paidOrders:completed.length,pendingOrders:filtered.filter(o=>!paid(o)&&o.status!=='Cancelled').length,cancelledOrders:filtered.filter(o=>o.status==='Cancelled').length,totalRevenue:completed.reduce((n,o)=>n+(Number(o.total??o.groupTotal)||0),0),cashRevenue:cash,onlineRevenue:online,upiRevenue:upi,cardRevenue:card,otherRevenue:other},limit:5000});
 }catch(e){console.error('Revenue report failed',e.message);return res.status(500).json({error:'Could not load revenue report.'});}
}
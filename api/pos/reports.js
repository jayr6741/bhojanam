import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET'];
export default async function(req,res){
 try{
  const user=await requirePermission(req,res,'view_reports');if(!user)return;
  const from=String(req.query?.from||'').slice(0,10),to=String(req.query?.to||'').slice(0,10);
  const orders=await db.query("SELECT id,payload,status,created_at FROM restaurant_orders WHERE status IN ('Paid','Verified','Refunded') AND ($1='' OR created_at >= $1::date) AND ($2='' OR created_at < ($2::date + interval '1 day')) ORDER BY created_at DESC LIMIT 5000",[from,to]);
  const payments=await db.query("SELECT payment_method,entry_type,status,amount,order_id FROM pos_payments WHERE status IN ('successful','partially_refunded','refunded') AND ($1='' OR created_at >= $1::date) AND ($2='' OR created_at < ($2::date + interval '1 day')) ORDER BY created_at DESC LIMIT 10000",[from,to]);
  const expenses=await db.query("SELECT category,amount FROM pos_expenses WHERE ($1='' OR expense_date >= $1::date) AND ($2='' OR expense_date <= $2::date)",[from,to]);
  const rows=orders.rows.map(r=>({...r.payload,id:r.id,status:r.status,createdAt:r.created_at}));
  const grossSales=rows.reduce((s,o)=>s+Math.max(0,Number(o.subtotal??o.groupSubtotal)||0),0);
  const discounts=rows.reduce((s,o)=>s+Math.max(0,Number(o.discount??o.groupDiscount)||0),0);
  const taxes=rows.reduce((s,o)=>s+Math.max(0,Number(o.tax??o.groupTax)||0),0);
  const refunds=payments.rows.filter(p=>p.entry_type==='refund').reduce((s,p)=>s+Number(p.amount||0),0);
  const collections=payments.rows.filter(p=>p.entry_type==='payment').reduce((s,p)=>s+Number(p.amount||0),0);
  const expenseTotal=expenses.rows.reduce((s,x)=>s+Number(x.amount||0),0);
  const paymentMethods={};
  for(const p of payments.rows){const method=p.payment_method||'Other';paymentMethods[method]??={collected:0,refunded:0};if(p.entry_type==='refund')paymentMethods[method].refunded+=Number(p.amount||0);else if(p.entry_type==='payment')paymentMethods[method].collected+=Number(p.amount||0);}
  const items={},categories={},customers={};
  for(const o of rows){for(const item of (Array.isArray(o.items)?o.items:[])){const name=String(item.name||'Item'),qty=Number(item.qty)||1,amount=(Number(item.price)||0)*qty;items[name]??={name,quantity:0,sales:0};items[name].quantity+=qty;items[name].sales+=amount;const category=String(item.category||'Uncategorized');categories[category]??={category,quantity:0,sales:0};categories[category].quantity+=qty;categories[category].sales+=amount;}const customer=String(o.customer||'Walk-in customer');customers[customer]??={customer,orders:0,sales:0};customers[customer].orders++;customers[customer].sales+=Number(o.total??o.groupTotal)||0;}
  const costCheck=await db.query('SELECT COUNT(*)::int AS count FROM pos_recipe_items');
  const costAvailable=Number(costCheck.rows[0]?.count)>0;
  const expenseCategories={};for(const x of expenses.rows)expenseCategories[x.category]=(expenseCategories[x.category]||0)+Number(x.amount||0);
  return res.json({period:{from,to},summary:{grossSales:Number(grossSales.toFixed(2)),discounts:Number(discounts.toFixed(2)),taxes:Number(taxes.toFixed(2)),refunds:Number(refunds.toFixed(2)),collections:Number(collections.toFixed(2)),netSales:Number((grossSales-discounts-refunds).toFixed(2)),expenses:Number(expenseTotal.toFixed(2)),profit:null,profitStatus:costAvailable?'Costed recipes exist; full cost-of-goods calculation is not yet verified.':'Unavailable until recipe costs are configured.'},paymentMethods:Object.entries(paymentMethods).map(([method,v])=>({method,collected:Number(v.collected.toFixed(2)),refunded:Number(v.refunded.toFixed(2)),net:Number((v.collected-v.refunded).toFixed(2))})),topItems:Object.values(items).sort((a,b)=>b.sales-a.sales).slice(0,100),categories:Object.values(categories).sort((a,b)=>b.sales-a.sales),customers:Object.values(customers).sort((a,b)=>b.sales-a.sales).slice(0,200),orders:rows,expenseCategories});
 }catch(e){console.error('Reports API failed',e.message);return res.status(500).json({error:'Could not generate the report.'});}
}
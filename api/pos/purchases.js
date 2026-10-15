import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET','POST','PUT'];
export default async function(req,res){
 try{
  if(req.method==='GET'){
   const user=await requirePermission(req,res,'view_inventory');if(!user)return;
   const orders=await db.query("SELECT p.*,s.name AS supplier_name FROM pos_purchase_orders p LEFT JOIN pos_suppliers s ON s.id=p.supplier_id ORDER BY p.created_at DESC LIMIT 300");
   const items=await db.query("SELECT i.*,po.status AS purchase_status FROM pos_purchase_order_items i JOIN pos_purchase_orders po ON po.id=i.purchase_order_id ORDER BY i.created_at");
   return res.json({purchases:orders.rows,items:items.rows});
  }
  const user=await requirePermission(req,res,'manage_purchases');if(!user)return;
  const b=req.body||{};
  if(req.method==='POST'&&b.action==='createSupplier'){
   const name=String(b.name||'').trim().slice(0,120);if(!name)return res.status(400).json({error:'Supplier name is required.'});
   const id='SUP-'+crypto.randomUUID();
   const r=await db.query("INSERT INTO pos_suppliers(id,name,phone,email,address,tax_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[id,name,String(b.phone||'').slice(0,40),String(b.email||'').slice(0,160),String(b.address||'').slice(0,500),String(b.taxId||'').slice(0,80)]);
   await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'supplier.create','supplier',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,id,JSON.stringify(r.rows[0])]);
   return res.status(201).json({ok:true,supplier:r.rows[0]});
  }
  if(req.method==='POST'&&b.action==='createPurchase'){
   const supplierId=String(b.supplierId||'').trim(),items=Array.isArray(b.items)?b.items:[],notes=String(b.notes||'').slice(0,500);
   if(!items.length||items.length>100)return res.status(400).json({error:'Add between 1 and 100 purchase items.'});
   const clean=[];
   for(const raw of items){
    const itemId=String(raw.inventoryItemId||'').trim(),quantity=Number(raw.quantity),cost=Number(raw.unitCost),taxRate=Number(raw.taxRate)||0;
    if(!itemId||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(cost)||cost<0||!Number.isFinite(taxRate)||taxRate<0||taxRate>28)return res.status(400).json({error:'Each purchase item must have a valid item, quantity, unit cost and tax rate.'});
    const found=await db.query('SELECT id FROM pos_inventory_items WHERE id=$1 AND active=true',[itemId]);if(!found.rows.length)return res.status(400).json({error:'A selected inventory item was not found.'});
    clean.push({inventoryItemId:itemId,quantity,unitCost:cost,taxRate});
   }
   const subtotal=clean.reduce((s,x)=>s+x.quantity*x.unitCost,0),tax=clean.reduce((s,x)=>s+x.quantity*x.unitCost*x.taxRate/100,0),total=Number((subtotal+tax).toFixed(2)),id='PO-'+crypto.randomUUID();
   const po=await db.query("INSERT INTO pos_purchase_orders(id,supplier_id,status,subtotal,tax,total,notes,created_by) VALUES($1,NULLIF($2,''),'ordered',$3,$4,$5,$6,$7) RETURNING *",[id,supplierId,Number(subtotal.toFixed(2)),Number(tax.toFixed(2)),total,notes,user.id]);
   const created=[];
   for(const item of clean){const r=await db.query("INSERT INTO pos_purchase_order_items(id,purchase_order_id,inventory_item_id,quantity,unit_cost,tax_rate) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",['POI-'+crypto.randomUUID(),id,item.inventoryItemId,item.quantity,item.unitCost,item.taxRate]);created.push(r.rows[0]);}
   await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'purchase.create','purchase_order',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,id,JSON.stringify({purchase:po.rows[0],items:created})]);
   return res.status(201).json({ok:true,purchase:po.rows[0],items:created});
  }
  if(req.method==='PUT'&&b.action==='receive'){
   const purchaseId=String(b.purchaseId||'').trim(),receipts=Array.isArray(b.items)?b.items:[],key=String(b.idempotencyKey||'').trim().slice(0,160);
   if(!purchaseId||!receipts.length||!key)return res.status(400).json({error:'Purchase, received quantities and idempotency key are required.'});
   const prior=await db.query('SELECT id FROM pos_inventory_movements WHERE idempotency_key LIKE $1 LIMIT 1',[key+':%']);if(prior.rows.length)return res.json({ok:true,duplicate:true});
   const po=await db.query("SELECT * FROM pos_purchase_orders WHERE id=$1 AND status IN ('ordered','partially_received')",[purchaseId]);if(!po.rows.length)return res.status(404).json({error:'Open purchase order not found.'});
   for(const receipt of receipts){
    const itemId=String(receipt.purchaseItemId||'').trim(),qty=Number(receipt.quantityReceived);
    if(!itemId||!Number.isFinite(qty)||qty<=0)return res.status(400).json({error:'Each received quantity must be positive.'});
    const line=await db.query('SELECT * FROM pos_purchase_order_items WHERE id=$1 AND purchase_order_id=$2',[itemId,purchaseId]);if(!line.rows.length)return res.status(400).json({error:'Purchase item does not belong to this purchase order.'});
    const row=line.rows[0],remaining=Number(row.quantity)-Number(row.received_quantity);
    if(qty>remaining+0.0001)return res.status(400).json({error:'Received quantity exceeds the remaining ordered quantity.'});
    const stock=await db.query('UPDATE pos_inventory_items SET current_stock=current_stock+$2,unit_cost=$3,updated_at=now() WHERE id=$1 AND active=true RETURNING *',[row.inventory_item_id,qty,row.unit_cost]);if(!stock.rows.length)return res.status(404).json({error:'Inventory item not found.'});
    await db.query('UPDATE pos_purchase_order_items SET received_quantity=received_quantity+$2 WHERE id=$1',[itemId,qty]);
    await db.query("INSERT INTO pos_inventory_movements(id,inventory_item_id,movement_type,quantity_delta,unit_cost,reference_type,reference_id,reason,performed_by,idempotency_key) VALUES($1,$2,'purchase',$3,$4,'purchase_order',$5,'Purchase received',$6,$7)",['MOV-'+crypto.randomUUID(),row.inventory_item_id,qty,row.unit_cost,purchaseId,user.id,key+':'+itemId]);
   }
   const state=await db.query("SELECT COUNT(*) FILTER(WHERE received_quantity<quantity)::int AS remaining FROM pos_purchase_order_items WHERE purchase_order_id=$1",[purchaseId]);
   const status=Number(state.rows[0]?.remaining)===0?'received':'partially_received';
   const updated=await db.query("UPDATE pos_purchase_orders SET status=$2,received_at=CASE WHEN $2='received' THEN now() ELSE received_at END,updated_at=now() WHERE id=$1 RETURNING *",[purchaseId,status]);
   await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'purchase.receive','purchase_order',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,purchaseId,JSON.stringify({status,receipts})]);
   return res.json({ok:true,purchase:updated.rows[0]});
  }
  return res.status(400).json({error:'Unsupported purchase action.'});
 }catch(e){console.error('Purchases API failed',e.message);return res.status(500).json({error:'Could not process the purchase request.'});}
}
import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET','POST','PUT'];
export default async function(req,res){
 try{
  if(req.method==='GET'){
   const user=await requirePermission(req,res,'view_inventory');if(!user)return;
   const items=await db.query('SELECT * FROM pos_inventory_items ORDER BY name LIMIT 1000');
   const movements=await db.query('SELECT m.*,i.name AS item_name FROM pos_inventory_movements m JOIN pos_inventory_items i ON i.id=m.inventory_item_id ORDER BY m.created_at DESC LIMIT 100');
   const suppliers=await db.query('SELECT * FROM pos_suppliers WHERE active=true ORDER BY name');
   return res.json({items:items.rows.map(x=>({...x,lowStock:Number(x.current_stock)<=Number(x.reorder_level)})),movements:movements.rows,suppliers:suppliers.rows});
  }
  const user=await requirePermission(req,res,'manage_inventory');if(!user)return;
  const b=req.body||{};
  if(req.method==='POST'&&b.action==='create'){
   const name=String(b.name||'').trim().slice(0,120),unit=String(b.unit||'unit').trim().slice(0,24),sku=String(b.sku||'').trim().slice(0,80)||null;
   const stock=Number(b.currentStock)||0,reorder=Number(b.reorderLevel)||0,cost=Number(b.unitCost)||0;
   if(!name||stock<0||reorder<0||cost<0||![stock,reorder,cost].every(Number.isFinite))return res.status(400).json({error:'Enter a valid item name, stock, reorder level and unit cost.'});
   const id='INV-'+crypto.randomUUID();
   const r=await db.query('INSERT INTO pos_inventory_items(id,name,sku,unit,current_stock,reorder_level,unit_cost,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *',[id,name,sku,unit,stock,reorder,cost,JSON.stringify({category:String(b.category||'').slice(0,80)})]);
   if(stock>0)await db.query("INSERT INTO pos_inventory_movements(id,inventory_item_id,movement_type,quantity_delta,unit_cost,reason,performed_by,idempotency_key) VALUES($1,$2,'adjustment',$3,$4,'Opening stock',$5,$6) ON CONFLICT(idempotency_key) DO NOTHING",['MOV-'+crypto.randomUUID(),id,stock,cost,user.id,id+':opening-stock']);
   await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'inventory.create','inventory_item',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,id,JSON.stringify(r.rows[0])]);
   return res.status(201).json({ok:true,item:r.rows[0]});
  }
  if(req.method==='PUT'&&b.action==='adjust'){
   const itemId=String(b.itemId||'').trim(),delta=Number(b.quantityDelta),reason=String(b.reason||'').trim().slice(0,300),key=String(b.idempotencyKey||'').trim().slice(0,180);
   if(!itemId||!Number.isFinite(delta)||delta===0||!reason||!key)return res.status(400).json({error:'Item, non-zero quantity change, reason and idempotency key are required.'});
   const prior=await db.query('SELECT * FROM pos_inventory_movements WHERE idempotency_key=$1',[key]);if(prior.rows.length)return res.json({ok:true,movement:prior.rows[0],duplicate:true});
   const update=await db.query('UPDATE pos_inventory_items SET current_stock=current_stock+$2,updated_at=now() WHERE id=$1 AND active=true AND current_stock+$2>=0 RETURNING *',[itemId,delta]);
   if(!update.rows.length)return res.status(400).json({error:'Item not found or adjustment would make stock negative.'});
   const item=update.rows[0];
   const movement=await db.query("INSERT INTO pos_inventory_movements(id,inventory_item_id,movement_type,quantity_delta,unit_cost,reason,performed_by,idempotency_key) VALUES($1,$2,'adjustment',$3,$4,$5,$6,$7) RETURNING *",['MOV-'+crypto.randomUUID(),itemId,delta,Number(item.unit_cost)||0,reason,user.id,key]);
   await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'inventory.adjust','inventory_item',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,itemId,JSON.stringify({quantityDelta:delta,reason,currentStock:item.current_stock})]);
   return res.json({ok:true,item,movement:movement.rows[0]});
  }
  return res.status(400).json({error:'Unsupported inventory action.'});
 }catch(e){console.error('Inventory API failed',e.message);return res.status(500).json({error:'Could not process the inventory request.'});}
}
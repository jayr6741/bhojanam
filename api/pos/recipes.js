import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET','POST'];
export default async function(req,res){
 try{
  if(req.method==='GET'){
   const user=await requirePermission(req,res,'view_inventory');if(!user)return;
   const recipes=await db.query('SELECT * FROM pos_recipes ORDER BY name');
   const ids=recipes.rows.map(r=>r.id);
   const lines=ids.length?await db.query('SELECT ri.*,i.name AS ingredient_name,i.unit,i.current_stock FROM pos_recipe_items ri JOIN pos_inventory_items i ON i.id=ri.inventory_item_id WHERE ri.recipe_id=ANY($1::text[]) ORDER BY i.name',[ids]):{rows:[]};
   return res.json({recipes:recipes.rows.map(r=>({...r,items:lines.rows.filter(i=>i.recipe_id===r.id)}))});
  }
  const user=await requirePermission(req,res,'manage_inventory');if(!user)return;
  const b=req.body||{},menuItemId=String(b.menuItemId||'').trim(),name=String(b.name||'').trim().slice(0,120),yieldQuantity=Number(b.yieldQuantity)||1,items=Array.isArray(b.items)?b.items:[];
  if(!menuItemId||!name||!Number.isFinite(yieldQuantity)||yieldQuantity<=0||!items.length)return res.status(400).json({error:'Menu item, recipe name, positive yield and ingredients are required.'});
  const menuResult=await db.query("SELECT value FROM restaurant_config WHERE key='menu'"),menu=Array.isArray(menuResult.rows[0]?.value)?menuResult.rows[0].value:[];
  if(!menu.some(x=>String(x.id)===menuItemId))return res.status(400).json({error:'Selected menu item does not exist.'});
  const clean=[];
  for(const item of items){const inventoryItemId=String(item.inventoryItemId||'').trim(),quantity=Number(item.quantity);if(!inventoryItemId||!Number.isFinite(quantity)||quantity<=0)return res.status(400).json({error:'Each recipe ingredient needs a valid item and positive quantity.'});const found=await db.query('SELECT id FROM pos_inventory_items WHERE id=$1 AND active=true',[inventoryItemId]);if(!found.rows.length)return res.status(400).json({error:'A recipe ingredient was not found.'});clean.push({inventoryItemId,quantity});}
  const existing=await db.query('SELECT id FROM pos_recipes WHERE menu_item_id=$1 AND active=true',[menuItemId]);if(existing.rows.length)return res.status(409).json({error:'An active recipe already exists for this menu item.'});
  const id='REC-'+crypto.randomUUID();
  const r=await db.query('INSERT INTO pos_recipes(id,menu_item_id,name,yield_quantity) VALUES($1,$2,$3,$4) RETURNING *',[id,menuItemId,name,yieldQuantity]);
  for(const item of clean)await db.query('INSERT INTO pos_recipe_items(id,recipe_id,inventory_item_id,quantity) VALUES($1,$2,$3,$4)',['RECI-'+crypto.randomUUID(),id,item.inventoryItemId,item.quantity]);
  await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'recipe.create','recipe',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,id,JSON.stringify({menuItemId,name,yieldQuantity,items:clean})]);
  return res.status(201).json({ok:true,recipe:r.rows[0]});
 }catch(e){console.error('Recipes API failed',e.message);return res.status(500).json({error:'Could not process the recipe request.'});}
}
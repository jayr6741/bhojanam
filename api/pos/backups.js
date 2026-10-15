import { db, storage } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET','POST'];
const TABLES=[
 ['restaurant_orders','id'],['restaurant_customers','phone'],['restaurant_tables','number'],['restaurant_bookings','id'],['restaurant_config','key'],['restaurant_table_merges','table_number'],['restaurant_table_qr_tokens','table_number'],['pos_roles','id'],
 ['pos_users','id'],['pos_payments','id'],['pos_loyalty_ledger','id'],['pos_inventory_items','id'],['pos_suppliers','id'],['pos_purchase_orders','id'],['pos_purchase_order_items','id'],['pos_recipes','id'],['pos_recipe_items','id'],['pos_inventory_movements','id'],['pos_expenses','id'],['pos_shifts','id'],['pos_cash_drawer_entries','id'],['pos_kitchen_stations','id'],['pos_kitchen_tickets','id'],['pos_kitchen_ticket_items','id'],['pos_audit_logs','id'],['pos_loyalty_tiers','id'],['pos_loyalty_rewards','id']
];
export default async function(req,res){
 try{
  const user=await requirePermission(req,res,'manage_backups');if(!user)return;
  if(req.method==='GET'&&req.query?.download){const backup=await db.query('SELECT storage_key FROM pos_backup_runs WHERE id=$1',[String(req.query.download)]);if(!backup.rows.length)return res.status(404).json({error:'Backup not found.'});const url=await storage.url(backup.rows[0].storage_key,{ttl:30});return res.redirect(302,url);}
  if(req.method==='GET'){
   const r=await db.query('SELECT id,record_counts,bytes,status,created_at,notes FROM pos_backup_runs ORDER BY created_at DESC LIMIT 100');
   return res.json({backups:r.rows});
  }
  const backupId='BKP-'+crypto.randomUUID(),data={format:'olive-ember-pos-backup-v1',createdAt:new Date().toISOString(),tables:{}},counts={};
  for(const [table,key] of TABLES){
   let result;
   if(table==='pos_users')result=await db.query('SELECT id,full_name,email,role_id,active,must_change_password,created_at,updated_at FROM pos_users ORDER BY id LIMIT 20000');
   else result=await db.query('SELECT * FROM '+table+' ORDER BY '+key+' LIMIT 20000');
   if(result.rows.length>=20000)return res.status(413).json({error:'A table reached the 20,000-row export limit. Create a paginated archive before backing up this database size.'});data.tables[table]=result.rows;counts[table]=result.rows.length;
  }
  const json=JSON.stringify(data),bytes=Buffer.byteLength(json,'utf8');
  if(bytes>25000000)return res.status(413).json({error:'Backup exceeds the 25 MB export limit. Use a paginated archive export for this database size.'});
  const storageKey='backups/'+backupId+'.json';
  await storage.put(storageKey,Buffer.from(json,'utf8'),'application/json',{metadata:{backup_id:backupId,format:'olive-ember-pos-backup-v1'}});
  await db.query("INSERT INTO pos_backup_runs(id,storage_key,record_counts,bytes,status,created_by,notes) VALUES($1,$2,$3::jsonb,$4,'completed',$5,'Private database and application data snapshot; staff password hashes excluded')",[backupId,storageKey,JSON.stringify(counts),bytes,user.id]);
  await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'backup.create','backup',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,backupId,JSON.stringify({counts,bytes,storageKey})]);
  return res.status(201).json({ok:true,backup:{id:backupId,storageKey,recordCounts:counts,bytes,status:'completed',createdAt:new Date().toISOString(),url:await storage.url(storageKey)}});
 }catch(e){console.error('Backup API failed',e.message);return res.status(500).json({error:'Could not create or list backups.'});}
}
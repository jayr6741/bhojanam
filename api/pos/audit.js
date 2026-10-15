import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET'];
export default async function(req,res){
 try{
  const user=await requirePermission(req,res,'view_audit_logs');if(!user)return;
  const action=String(req.query?.action||'').slice(0,100),entity=String(req.query?.entityType||'').slice(0,100);
  const r=await db.query("SELECT id,actor_user_id,actor_name,action,entity_type,entity_id,before_data,after_data,request_id,created_at FROM pos_audit_logs WHERE ($1='' OR action=$1) AND ($2='' OR entity_type=$2) ORDER BY created_at DESC LIMIT 500",[action,entity]);
  return res.json({logs:r.rows});
 }catch(e){console.error('Audit API failed',e.message);return res.status(500).json({error:'Could not load the audit log.'});}
}
import { events } from 'hatchable';
import { requirePermission } from '../lib/pos-auth.js';
export const access='public';
export const methods=['GET'];
export default async function(req,res){
 const user=await requirePermission(req,res,'view_orders');if(!user)return;
 const channels=['pos-orders','pos-kitchen','pos-tables'];
 return res.json(await events.grant(channels));
}
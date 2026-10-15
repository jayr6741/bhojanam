import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET'];
export default async function(req,res){
  try{
    const user=await requirePermission(req,res,'create_bill'); if(!user)return;
    const phone=String(req.query?.phone||'').replace(/[^0-9+]/g,'').slice(0,16);
    if(!phone||phone.length<8)return res.status(400).json({error:'Enter a valid customer mobile number.'});
    const r=await db.query('SELECT phone,name,points,visits,status FROM restaurant_customers WHERE phone=$1',[phone]);
    const cfg=await db.query("SELECT value FROM restaurant_config WHERE key='loyalty'");
    const rules=cfg.rows[0]?.value||{earning:10,spend:100,redeemPoints:100,redeemValue:50};
    return res.json({customer:r.rows[0]||null,rules});
  }catch(e){console.error('Loyalty lookup failed',e.message);return res.status(500).json({error:'Could not load loyalty details.'});}
}
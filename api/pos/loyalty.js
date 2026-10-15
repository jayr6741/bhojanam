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
    const ledger=r.rows[0]&&user.permissions.includes('view_loyalty')?await db.query('SELECT id,order_id,entry_type,points,reason,metadata,created_at FROM pos_loyalty_ledger WHERE customer_phone=$1 ORDER BY created_at DESC LIMIT 200',[phone]):{rows:[]};
    const rewards=await db.query('SELECT id,name,description,points_cost,reward_value FROM pos_loyalty_rewards WHERE active=true AND (expires_at IS NULL OR expires_at>now()) ORDER BY points_cost');const tiers=await db.query('SELECT id,name,minimum_points,earning_multiplier FROM pos_loyalty_tiers WHERE active=true ORDER BY minimum_points');
    return res.json({customer:r.rows[0]||null,rules,ledger:ledger.rows,rewards:rewards.rows.filter(x=>!r.rows[0]||Number(x.points_cost)<=Number(r.rows[0].points)),tiers:tiers.rows});
  }catch(e){console.error('Loyalty lookup failed',e.message);return res.status(500).json({error:'Could not load loyalty details.'});}
}
import { db } from 'hatchable';
import { requirePermission } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET','POST','PUT'];
export default async function(req,res){
 try{
  if(req.method==='GET'){
   const user=await requirePermission(req,res,'view_loyalty');if(!user)return;
   const [rewards,tiers]=await Promise.all([db.query('SELECT * FROM pos_loyalty_rewards ORDER BY points_cost,name'),db.query('SELECT * FROM pos_loyalty_tiers WHERE active=true ORDER BY minimum_points')]);
   return res.json({rewards:rewards.rows,tiers:tiers.rows});
  }
  const user=await requirePermission(req,res,'manage_loyalty');if(!user)return;
  const b=req.body||{};
  if(req.method==='POST'&&b.action==='createReward'){
   const name=String(b.name||'').trim().slice(0,120),description=String(b.description||'').trim().slice(0,500),pointsCost=Math.floor(Number(b.pointsCost)),rewardValue=Number(b.rewardValue);
   if(!name||!Number.isInteger(pointsCost)||pointsCost<1||!Number.isFinite(rewardValue)||rewardValue<0)return res.status(400).json({error:'Enter a reward name, positive points cost and valid reward value.'});
   const id='RWD-'+crypto.randomUUID();
   const r=await db.query('INSERT INTO pos_loyalty_rewards(id,name,description,points_cost,reward_value,expires_at) VALUES($1,$2,$3,$4,$5,NULLIF($6,\'\')::timestamptz) RETURNING *',[id,name,description,pointsCost,Number(rewardValue.toFixed(2)),String(b.expiresAt||'')]);
   await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'loyalty.reward.create','loyalty_reward',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,id,JSON.stringify(r.rows[0])]);
   return res.status(201).json({ok:true,reward:r.rows[0]});
  }
  if(req.method==='PUT'&&b.action==='setRewardActive'){
   const id=String(b.id||'').trim();if(!id||typeof b.active!=='boolean')return res.status(400).json({error:'Reward ID and active state are required.'});
   const r=await db.query('UPDATE pos_loyalty_rewards SET active=$2,updated_at=now() WHERE id=$1 RETURNING *',[id,b.active]);if(!r.rows.length)return res.status(404).json({error:'Reward not found.'});
   await db.query("INSERT INTO pos_audit_logs(id,actor_user_id,actor_name,action,entity_type,entity_id,after_data) VALUES($1,$2,$3,'loyalty.reward.update','loyalty_reward',$4,$5::jsonb)",['AUD-'+crypto.randomUUID(),user.id,user.name,id,JSON.stringify({active:b.active})]);
   return res.json({ok:true,reward:r.rows[0]});
  }
  return res.status(400).json({error:'Unsupported loyalty reward action.'});
 }catch(e){console.error('Loyalty rewards API failed',e.message);return res.status(500).json({error:'Could not process loyalty rewards.'});}
}
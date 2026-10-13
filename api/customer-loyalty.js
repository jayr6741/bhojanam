import { db } from 'hatchable';
export const access='public';
export const methods=['POST'];
export default async function(req,res){
  try{
    const body=req.body||{};
    const phone=String(body.phone||'').replace(/[^0-9]/g,'').slice(-10);
    const name=String(body.name||'').trim().replace(/\s+/g,' ').slice(0,120);
    if(phone.length!==10||!name)return res.status(400).json({error:'Enter your 10-digit mobile number and registered name.'});
    const result=await db.query('SELECT points,visits,status FROM restaurant_customers WHERE regexp_replace(phone, \'[^0-9]\', \'\', \'g\') LIKE $1 AND lower(trim(name))=lower(trim($2)) LIMIT 1',['%'+phone,name]);
    if(!result.rows.length)return res.status(404).json({error:'We could not match these details. Please check your registered name and mobile number.'});
    const config=await db.query("SELECT value FROM restaurant_config WHERE key='loyalty'");
    const rules=config.rows[0]?.value||{earning:10,spend:100,redeemPoints:100,redeemValue:50};
    const customer=result.rows[0];
    return res.json({ok:true,points:Number(customer.points||0),visits:Number(customer.visits||0),status:customer.status||'Active',rules:{earning:Number(rules.earning||10),spend:Number(rules.spend||100),redeemPoints:Number(rules.redeemPoints||100),redeemValue:Number(rules.redeemValue||50)}});
  }catch(error){console.error('Customer loyalty portal failed',error.message);return res.status(500).json({error:'Loyalty details are temporarily unavailable. Please try again.'});}
}
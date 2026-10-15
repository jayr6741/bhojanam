import { db } from 'hatchable';
import { currentUser } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET','PUT'];
const base={restaurant:'Olive & Ember',phone:'+91 98765 43210',address:'Surat, Gujarat',earning:10,spend:100,redeemPoints:100,redeemValue:50,loyaltyExpiryDays:365,tierSilverPoints:500,tierGoldPoints:1500,tierPlatinumPoints:5000,taxRate:5,serviceChargeRate:0,tableCount:12,currency:'INR',printerConnection:'wifi',printerRole:'receipt',printerName:'',paperWidth:'80',printerIp:'',printerPort:'9100',bluetoothName:'',printCopies:1,autoPrintReceipt:false,autoPrintKot:false,printKotOnUpdate:false,autoCut:false,showLogo:true,showAddress:true,showTax:true,showDiscount:true,showPaymentMethod:true,kotShowPrices:false,kotGroupItems:true,printOrderNumber:true,receiptFooter:'Thank you for visiting!',kotHeader:'KITCHEN ORDER TICKET',kotRouting:'all',defaultOrderType:'dine-in',enableCash:true,enableUpi:true,enableCard:true,enableSplitPayment:true,enablePointsPayment:true,enableOtherPayment:true,allowDiscounts:true,allowHoldBill:true,allowSplitBill:true,allowMergeTables:true,qrOrderingEnabled:true,autoRefreshSeconds:5,defaultPaymentMethod:'Cash',gstin:'',serviceChargeRate:0};
const restaurantKeys=['restaurant','phone','address','tableCount','currency'];
const loyaltyKeys=['earning','spend','redeemPoints','redeemValue','loyaltyExpiryDays','tierSilverPoints','tierGoldPoints','tierPlatinumPoints','taxRate'];
const preferenceKeys=Object.keys(base).filter(k=>!restaurantKeys.includes(k)&&!loyaltyKeys.includes(k));
export default async function(req,res){
 try{
  const user=await currentUser(req);if(!user)return res.status(401).json({error:'Please sign in again.'});
  const allowed=req.method==='GET'?(user.permissions.includes('view_settings')||user.permissions.includes('view_loyalty')):(req.body?.scope==='loyalty'?user.permissions.includes('manage_loyalty'):user.permissions.includes('manage_settings'));
  if(!allowed)return res.status(403).json({error:'Your role does not have permission for this action.'});
  if(req.method==='GET'){
   const r=await db.query("SELECT key,value FROM restaurant_config WHERE key IN ('restaurant','loyalty','pos_preferences')");
   const out={...base};
   for(const x of r.rows){
    const v=x.value||{};
    if(x.key==='restaurant'){for(const k of restaurantKeys)if(v[k]!==undefined)out[k]=v[k];}
    else if(x.key==='loyalty'){for(const k of loyaltyKeys)if(v[k]!==undefined)out[k]=v[k];}
    else if(x.key==='pos_preferences')Object.assign(out,v);
   }
   return res.json({settings:out});
  }
  const b=req.body||{};
  if(b.scope==='loyalty'){
   const loyalty={earning:Math.max(0,Number(b.earning)||0),spend:Math.max(1,Number(b.spend)||100),redeemPoints:Math.max(1,Number(b.redeemPoints)||100),redeemValue:Math.max(0,Number(b.redeemValue)||0),loyaltyExpiryDays:Math.max(0,Math.min(3650,Math.floor(Number(b.loyaltyExpiryDays??365)||0))),tierSilverPoints:Math.max(0,Math.floor(Number(b.tierSilverPoints)||500)),tierGoldPoints:Math.max(0,Math.floor(Number(b.tierGoldPoints)||1500)),tierPlatinumPoints:Math.max(0,Math.floor(Number(b.tierPlatinumPoints)||5000))};
   await db.query("INSERT INTO restaurant_config(key,value) VALUES('loyalty',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=$1::jsonb,updated_at=now()",[JSON.stringify(loyalty)]);
   await db.query("UPDATE pos_loyalty_tiers SET minimum_points=CASE name WHEN 'Silver' THEN $1 WHEN 'Gold' THEN $2 WHEN 'Platinum' THEN $3 ELSE minimum_points END,updated_at=now() WHERE name IN ('Silver','Gold','Platinum')",[loyalty.tierSilverPoints,loyalty.tierGoldPoints,loyalty.tierPlatinumPoints]);
   return res.json({ok:true,settings:loyalty});
  }
  const s={...base};for(const k of Object.keys(base))if(b[k]!==undefined)s[k]=b[k];
  s.restaurant=String(s.restaurant).slice(0,120);s.phone=String(s.phone).slice(0,40);s.address=String(s.address).slice(0,250);s.gstin=String(s.gstin||'').slice(0,20);s.earning=Math.max(0,Number(s.earning)||0);s.spend=Math.max(1,Number(s.spend)||100);s.redeemPoints=Math.max(1,Number(s.redeemPoints)||100);s.redeemValue=Math.max(0,Number(s.redeemValue)||0);s.taxRate=Math.max(0,Math.min(28,Number(s.taxRate)||0));s.serviceChargeRate=Math.max(0,Math.min(25,Number(s.serviceChargeRate)||0));s.tableCount=Math.max(1,Math.min(200,Math.floor(Number(s.tableCount)||12)));s.printCopies=Math.max(1,Math.min(5,Math.floor(Number(s.printCopies)||1)));s.autoRefreshSeconds=Math.max(5,Math.min(120,Math.floor(Number(s.autoRefreshSeconds)||5)));
  const restaurant={},loyalty={},preferences={};for(const k of restaurantKeys)restaurant[k]=s[k];for(const k of loyaltyKeys)loyalty[k]=s[k];for(const k of preferenceKeys)preferences[k]=s[k];
  await db.query("INSERT INTO restaurant_config(key,value) VALUES('restaurant',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=$1::jsonb,updated_at=now()",[JSON.stringify(restaurant)]);
  await db.query("INSERT INTO restaurant_config(key,value) VALUES('loyalty',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=$1::jsonb,updated_at=now()",[JSON.stringify(loyalty)]);
  await db.query("UPDATE pos_loyalty_tiers SET minimum_points=CASE name WHEN 'Silver' THEN $1 WHEN 'Gold' THEN $2 WHEN 'Platinum' THEN $3 ELSE minimum_points END,updated_at=now() WHERE name IN ('Silver','Gold','Platinum')",[loyalty.tierSilverPoints,loyalty.tierGoldPoints,loyalty.tierPlatinumPoints]);
  await db.query("INSERT INTO restaurant_config(key,value) VALUES('pos_preferences',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=$1::jsonb,updated_at=now()",[JSON.stringify(preferences)]);
  for(let n=1;n<=s.tableCount;n++)await db.query("INSERT INTO restaurant_tables(number,seats,status) VALUES($1,CASE WHEN $1<=4 THEN 2 ELSE 4 END,'Available') ON CONFLICT(number) DO NOTHING",[n]);
  return res.json({ok:true,settings:s});
 }catch(e){console.error('Settings API failed',e.message);return res.status(500).json({error:'Could not save settings.'});}
}
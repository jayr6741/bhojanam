import { db } from 'hatchable';
export const access = 'admin';
export const methods = ['GET','PUT','POST'];
export default async function(req,res){
 try {
  if(req.method==='GET'){const r=await db.query('SELECT number,seats,status,updated_at FROM restaurant_tables ORDER BY number');return res.json({tables:r.rows});}
  const b=req.body||{};
  if(req.method==='POST'){const max=await db.query('SELECT COALESCE(max(number),0)::int AS n FROM restaurant_tables');const number=Math.max(0,max.rows[0].n)+1;const seats=Math.max(1,Math.min(20,Math.floor(Number(b.seats)||4)));const r=await db.query('INSERT INTO restaurant_tables(number,seats,status) VALUES($1,$2,\'Available\') RETURNING number,seats,status,updated_at',[number,seats]);return res.status(201).json({ok:true,table:r.rows[0]});}
  const number=Math.floor(Number(b.number));const status=['Available','Occupied','Reserved','Cleaning'].includes(b.status)?b.status:null;if(!number||!status)return res.status(400).json({error:'Table number and valid status are required.'});const r=await db.query('UPDATE restaurant_tables SET status=$2,updated_at=now() WHERE number=$1 RETURNING number,seats,status,updated_at',[number,status]);if(!r.rows.length)return res.status(404).json({error:'Table not found.'});return res.json({ok:true,table:r.rows[0]});
 }catch(e){console.error('Table operation failed',e.message);return res.status(500).json({error:'Could not update tables.'});}
}
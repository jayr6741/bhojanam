import { db } from 'hatchable';
const ALL_PERMISSIONS=['view_dashboard','create_bill','view_orders','update_order_status','view_tables','manage_tables','manage_reservations','view_menu','manage_menu','view_customers','manage_customers','view_loyalty','manage_loyalty','view_settings','manage_settings','user_management','manage_roles','view_reports','export_reports','refund_orders','manage_payments','view_inventory','manage_inventory','manage_purchases','view_finance','manage_expenses','manage_shifts','manage_kitchen','manage_discounts','cancel_orders','manage_printers','view_audit_logs','manage_backups'];
function b64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes)));}
async function hashText(value){const data=new TextEncoder().encode(String(value));return b64(await crypto.subtle.digest('SHA-256',data));}
async function passwordHash(password,salt){const enc=new TextEncoder();const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:120000,hash:'SHA-256'},key,256);return salt+':'+b64(bits);}
export async function makePasswordHash(password){const salt=crypto.randomUUID();return passwordHash(password,salt);}
async function verifyPassword(password,stored){const [salt,expected]=String(stored||'').split(':');if(!salt||!expected)return false;return (await passwordHash(password,salt))===stored;}
export const PERMISSIONS=ALL_PERMISSIONS;
export const ROLE_DEFAULTS={
  'Super Admin':ALL_PERMISSIONS,
  Admin:ALL_PERMISSIONS.filter(p=>p!=='manage_backups'),
  Manager:ALL_PERMISSIONS.filter(p=>!['manage_backups','manage_roles'].includes(p)),
  Cashier:['view_dashboard','create_bill','view_orders','update_order_status','view_tables','view_menu','view_customers','view_loyalty','view_finance','manage_shifts','manage_payments'],
  Waiter:['view_dashboard','create_bill','view_orders','view_tables','view_menu','view_customers','update_order_status'],
  'Kitchen Staff':['view_orders','update_order_status','view_menu','manage_kitchen'],
  'Inventory Manager':['view_dashboard','view_inventory','manage_inventory','manage_purchases','view_menu'],
  Accountant:['view_dashboard','view_reports','export_reports','view_finance','view_loyalty']
};
export async function ensureRoles(){
  for(const [name,permissions] of Object.entries(ROLE_DEFAULTS)){
    await db.query('INSERT INTO pos_roles(id,name,permissions,is_system) VALUES($1,$2,$3::jsonb,true) ON CONFLICT(name) DO NOTHING',['role-'+name.toLowerCase(),name,JSON.stringify(permissions)]);
  }
}
function cookieValue(req,name){const raw=req.headers?.cookie||'';for(const part of raw.split(';')){const i=part.indexOf('=');if(i>0&&part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim());}return '';}
export function setSessionCookie(res,token,maxAge){res.setHeader('Set-Cookie','oe_pos_session='+encodeURIComponent(token)+'; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age='+maxAge);}
export async function currentUser(req){
  const token=cookieValue(req,'oe_pos_session');if(!token)return null;
  const tokenHash=await hashText(token);
  const r=await db.query("SELECT u.id,u.full_name,u.email,u.active,u.must_change_password,r.id AS role_id,r.name AS role_name,r.permissions FROM pos_sessions s JOIN pos_users u ON u.id=s.user_id JOIN pos_roles r ON r.id=u.role_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true",[tokenHash]);
  if(!r.rows.length)return null;
  const u=r.rows[0];return {id:u.id,name:u.full_name,email:u.email,active:u.active,mustChangePassword:u.must_change_password,roleId:u.role_id,role:u.role_name,permissions:Array.isArray(u.permissions)?u.permissions:[]};
}
export async function requirePermission(req,res,permission){
  const user=await currentUser(req);
  if(!user){res.status(401).json({error:'Please sign in again.',code:'session_required'});return null;}
  if(!user.permissions.includes(permission)){res.status(403).json({error:'Your role does not have permission for this action.',code:'permission_denied',permission});return null;}
  return user;
}
export async function login(req,res){
  await ensureRoles();
  const email=String(req.body?.email||'').trim().toLowerCase();
  const password=String(req.body?.password||'');
  if(!email||!password)return res.status(400).json({error:'Email and password are required.'});
  let found=await db.query('SELECT id,full_name,email,password_hash,active FROM pos_users WHERE lower(email)=$1',[email]);
  // Bootstrap the requested initial admin only while the user table is empty.
  if(!found.rows.length&&email==='admin@gmail.com'&&password==='admin123'){
    const count=await db.query('SELECT count(*)::int AS n FROM pos_users');
    if(Number(count.rows[0].n)===0){
      const ph=await makePasswordHash(password);
      await db.query("INSERT INTO pos_users(id,full_name,email,password_hash,role_id,must_change_password) VALUES($1,$2,$3,$4,$5,true)",['user-'+crypto.randomUUID(),'Restaurant Admin',email,ph,'role-admin']);
      found=await db.query('SELECT id,full_name,email,password_hash,active FROM pos_users WHERE lower(email)=$1',[email]);
    }
  }
  if(!found.rows.length||!found.rows[0].active||!(await verifyPassword(password,found.rows[0].password_hash)))return res.status(401).json({error:'Invalid email or password.'});
  const token=crypto.randomUUID()+'.'+crypto.randomUUID();
  const tokenHash=await hashText(token);
  await db.query('DELETE FROM pos_sessions WHERE expires_at<=now()');
  await db.query('INSERT INTO pos_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'12 hours\')',[tokenHash,found.rows[0].id]);
  setSessionCookie(res,token,43200);
  const user=await currentUser({headers:{cookie:'oe_pos_session='+encodeURIComponent(token)}});
  return res.json({ok:true,user});
}
export async function logout(req,res){
  const token=cookieValue(req,'oe_pos_session');
  if(token)await db.query('DELETE FROM pos_sessions WHERE token_hash=$1',[await hashText(token)]);
  setSessionCookie(res,'',0);
  return res.json({ok:true});
}
export async function changeOwnPassword(req,res){
  const user=await currentUser(req);if(!user)return res.status(401).json({error:'Please sign in again.'});
  const oldPassword=String(req.body?.currentPassword||'');const newPassword=String(req.body?.newPassword||'');
  if(newPassword.length<10)return res.status(400).json({error:'New password must be at least 10 characters.'});
  const r=await db.query('SELECT password_hash,must_change_password FROM pos_users WHERE id=$1',[user.id]);
  if(!r.rows.length)return res.status(401).json({error:'Account not found. Please sign in again.'});
  // During the mandatory first-login change, successful sign-in plus the active HttpOnly session already proves possession of the temporary credential. Require the current password for all later changes.
  if(!r.rows[0].must_change_password&&!(await verifyPassword(oldPassword,r.rows[0].password_hash)))return res.status(400).json({error:'Current password is incorrect.'});
  await db.query('UPDATE pos_users SET password_hash=$2,must_change_password=false,updated_at=now() WHERE id=$1',[user.id,await makePasswordHash(newPassword)]);
  await db.query('DELETE FROM pos_sessions WHERE user_id=$1',[user.id]);
  setSessionCookie(res,'',0);
  return res.json({ok:true,reauthenticate:true});
}
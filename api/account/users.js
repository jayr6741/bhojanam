import { db } from 'hatchable';
import { requirePermission, makePasswordHash, ensureRoles, PERMISSIONS } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET','POST','PUT','DELETE'];
export default async function(req,res){
  try{
    const actor=await requirePermission(req,res,'user_management');if(!actor)return;
    await ensureRoles();
    if(req.method==='GET'){
      const [users,roles]=await Promise.all([
        db.query("SELECT u.id,u.full_name,u.email,u.active,u.must_change_password,u.created_at,r.id AS role_id,r.name AS role_name FROM pos_users u JOIN pos_roles r ON r.id=u.role_id ORDER BY u.created_at DESC"),
        db.query("SELECT id,name,permissions,is_system,created_at FROM pos_roles ORDER BY is_system DESC,name")
      ]);
      return res.json({users:users.rows.map(x=>({id:x.id,name:x.full_name,email:x.email,active:x.active,mustChangePassword:x.must_change_password,createdAt:x.created_at,roleId:x.role_id,role:x.role_name})),roles:roles.rows.map(x=>({id:x.id,name:x.name,permissions:Array.isArray(x.permissions)?x.permissions:[],isSystem:x.is_system,createdAt:x.created_at})),availablePermissions:PERMISSIONS});
    }
    const b=req.body||{};
    if(req.method==='POST'&&b.action==='createRole'){
      const name=String(b.name||'').trim().slice(0,50);const permissions=Array.isArray(b.permissions)?[...new Set(b.permissions.filter(x=>PERMISSIONS.includes(x)))]:[];
      if(!name)return res.status(400).json({error:'Role name is required.'});
      const id='role-'+crypto.randomUUID();
      const r=await db.query('INSERT INTO pos_roles(id,name,permissions,is_system) VALUES($1,$2,$3::jsonb,false) ON CONFLICT(name) DO NOTHING RETURNING id,name,permissions,is_system',[id,name,JSON.stringify(permissions)]);
      if(!r.rows.length)return res.status(409).json({error:'A role with this name already exists.'});
      return res.status(201).json({ok:true,role:{...r.rows[0],isSystem:r.rows[0].is_system}});
    }
    if(req.method==='POST'&&b.action==='createUser'){
      const name=String(b.name||'').trim().slice(0,100),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),roleId=String(b.roleId||'');
      if(!name||!email||!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Enter a name and valid email.'});
      if(password.length<10)return res.status(400).json({error:'Temporary password must be at least 10 characters.'});
      const role=await db.query('SELECT id FROM pos_roles WHERE id=$1',[roleId]);if(!role.rows.length)return res.status(400).json({error:'Choose a valid role.'});
      const id='user-'+crypto.randomUUID();
      const r=await db.query('INSERT INTO pos_users(id,full_name,email,password_hash,role_id,must_change_password) VALUES($1,$2,$3,$4,$5,true) ON CONFLICT(email) DO NOTHING RETURNING id,full_name,email,active,role_id',[id,name,email,await makePasswordHash(password),roleId]);
      if(!r.rows.length)return res.status(409).json({error:'A user with this email already exists.'});
      return res.status(201).json({ok:true,user:{id:r.rows[0].id,name:r.rows[0].full_name,email:r.rows[0].email,active:r.rows[0].active,roleId:r.rows[0].role_id}});
    }
    if(req.method==='PUT'&&b.action==='updateRole'){
      const roleId=String(b.roleId||''),name=String(b.name||'').trim().slice(0,50);let permissions=Array.isArray(b.permissions)?[...new Set(b.permissions.filter(x=>PERMISSIONS.includes(x)))]:[];
      if(!roleId||!name)return res.status(400).json({error:'Role and role name are required.'});
      const oldRole=await db.query('SELECT name,is_system FROM pos_roles WHERE id=$1',[roleId]);if(!oldRole.rows.length)return res.status(404).json({error:'Role not found.'});
      if(oldRole.rows[0].name==='Admin'&&!permissions.includes('user_management'))permissions.push('user_management');
      const r=await db.query('UPDATE pos_roles SET name=CASE WHEN is_system THEN name ELSE $2 END,permissions=$3::jsonb,updated_at=now() WHERE id=$1 RETURNING id,name,permissions,is_system',[roleId,name,JSON.stringify(permissions)]);
      if(!r.rows.length)return res.status(404).json({error:'Role not found.'});
      return res.json({ok:true,role:{...r.rows[0],isSystem:r.rows[0].is_system}});
    }
    if(req.method==='PUT'&&b.action==='updateUser'){
      const userId=String(b.userId||''),name=String(b.name||'').trim().slice(0,100),roleId=String(b.roleId||''),active=b.active!==false;
      if(!userId||!name||!roleId)return res.status(400).json({error:'Name, user and role are required.'});
      if(userId===actor.id&&!active)return res.status(400).json({error:'You cannot deactivate your own account.'});
      const target=await db.query("SELECT u.id,r.name AS role_name FROM pos_users u JOIN pos_roles r ON r.id=u.role_id WHERE u.id=$1",[userId]);
      if(!target.rows.length)return res.status(404).json({error:'User not found.'});
      if(target.rows[0].role_name==='Admin'&&(roleId!=='role-admin'||!active)){
        const n=await db.query("SELECT count(*)::int AS n FROM pos_users u JOIN pos_roles r ON r.id=u.role_id WHERE r.name='Admin' AND u.active=true");
        if(n.rows[0].n<=1)return res.status(400).json({error:'Keep at least one active admin.'});
      }
      const r=await db.query('UPDATE pos_users SET full_name=$2,role_id=$3,active=$4,updated_at=now() WHERE id=$1 RETURNING id,full_name,email,active,role_id',[userId,name,roleId,active]);
      if(!r.rows.length)return res.status(404).json({error:'User not found.'});
      if(!active)await db.query('DELETE FROM pos_sessions WHERE user_id=$1',[userId]);
      return res.json({ok:true,user:{id:r.rows[0].id,name:r.rows[0].full_name,email:r.rows[0].email,active:r.rows[0].active,roleId:r.rows[0].role_id}});
    }
    if(req.method==='DELETE'){
      const userId=String(req.query?.id||b.userId||'');
      if(!userId)return res.status(400).json({error:'User ID is required.'});
      if(userId===actor.id)return res.status(400).json({error:'You cannot delete your own account.'});
      const target=await db.query("SELECT u.id,r.name AS role_name FROM pos_users u JOIN pos_roles r ON r.id=u.role_id WHERE u.id=$1",[userId]);
      if(!target.rows.length)return res.status(404).json({error:'User not found.'});
      if(target.rows[0].role_name==='Admin'){
        const n=await db.query("SELECT count(*)::int AS n FROM pos_users u JOIN pos_roles r ON r.id=u.role_id WHERE r.name='Admin' AND u.active=true");
        if(n.rows[0].n<=1)return res.status(400).json({error:'Cannot delete the last active admin.'});
      }
      await db.query('DELETE FROM pos_users WHERE id=$1',[userId]);
      return res.json({ok:true});
    }
    return res.status(400).json({error:'Unsupported user-management action.'});
  }catch(e){console.error('User management failed',e.message);return res.status(500).json({error:'Could not complete user-management action.'});}
}
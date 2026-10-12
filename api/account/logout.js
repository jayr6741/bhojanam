import { logout } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['POST'];
export default async function(req,res){try{return await logout(req,res)}catch(e){console.error('POS logout failed',e.message);return res.status(500).json({error:'Logout failed.'})}}
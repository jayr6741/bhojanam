import { changeOwnPassword } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['POST'];
export default async function(req,res){try{return await changeOwnPassword(req,res)}catch(e){console.error('Password update failed',e.message);return res.status(500).json({error:'Password update failed.'})}}
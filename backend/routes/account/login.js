import { login } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['POST'];
export default async function(req,res){try{return await login(req,res)}catch(e){console.error('POS login failed',e.message);return res.status(500).json({error:'Login service unavailable.'})}}
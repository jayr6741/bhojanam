import { currentUser } from '../../lib/pos-auth.js';
export const access='public';
export const methods=['GET'];
export default async function(req,res){try{const user=await currentUser(req);return res.json({user})}catch(e){console.error('POS session failed',e.message);return res.status(500).json({error:'Session check failed.'})}}
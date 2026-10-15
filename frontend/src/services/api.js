const baseUrl=(import.meta.env.VITE_API_URL||'http://localhost:5000/api').replace(/\/$/,'');
export async function apiRequest(path,options={}) {
 const normalizedPath=path.startsWith('/')?path:`/${path}`;
 const response=await fetch(`${baseUrl}${normalizedPath}`,{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const error=new Error(data.message||data.error||`Request failed (${response.status})`);error.status=response.status;throw error;}
 return data;
}

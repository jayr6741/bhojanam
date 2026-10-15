import {useEffect,useState} from 'react';
import PageHeader from '../components/ui/PageHeader.jsx';
import {apiRequest} from '../services/api.js';
export default function DataPage({title,description,endpoint}){
 const [data,setData]=useState(null);const [error,setError]=useState('');
 useEffect(()=>{let active=true;setData(null);setError('');apiRequest(endpoint).then(result=>active&&setData(result)).catch(err=>active&&setError(err.message));return()=>{active=false};},[endpoint]);
 return <><PageHeader eyebrow="RESTAURANT MANAGEMENT" title={title} description={description}/>
 {error&&<div className="notice notice-warning"><strong>Feature API needs migration</strong><span>{error}. Original handlers are preserved in this branch and must be adapted to Express.</span></div>}
 <section className="panel data-placeholder"><div className="placeholder-icon">▤</div><h2>{data?'API response received':'Feature connection pending'}</h2><p>{data?'The API responded. Feature-specific UI and actions still need mapping to the original POS workflow.':'This is a React JSX page. The existing API handler is preserved separately while its Express port is completed.'}</p>{data&&<pre>{JSON.stringify(data,null,2)}</pre>}</section></>;
}

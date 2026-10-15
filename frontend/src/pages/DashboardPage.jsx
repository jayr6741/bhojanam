import {useEffect,useState} from 'react';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import {apiRequest} from '../services/api.js';
const formatMoney=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(value)||0);
export default function DashboardPage({onNavigate}){
 const [stats,setStats]=useState(null);const [error,setError]=useState('');
 useEffect(()=>{let active=true;apiRequest('/pos/dashboard').then(data=>active&&setStats(data.stats||data)).catch(err=>active&&setError(err.message));return()=>{active=false};},[]);
 const cards=[
 {label:'Today’s Revenue',value:formatMoney(stats?.todayRevenue??stats?.revenueToday??0),detail:'From POS dashboard API',icon:'₹',tone:'blue'},
 {label:'Total Orders',value:Number(stats?.totalOrders??stats?.ordersToday??0).toLocaleString('en-IN'),detail:'Order count reported by API',icon:'≡',tone:'green'},
 {label:'Active Tables',value:Number(stats?.activeTables??stats?.occupiedTables??0).toLocaleString('en-IN'),detail:'Current table occupancy',icon:'▦',tone:'orange'},
 {label:'Customers',value:Number(stats?.totalCustomers??stats?.customers??0).toLocaleString('en-IN'),detail:'Customer records',icon:'♙',tone:'purple'}];
 return <><PageHeader eyebrow="YOUR RESTAURANT AT A GLANCE" title="Good day, Admin 👋" description="Here’s what’s happening in your restaurant today." action={<button className="button button-primary" onClick={()=>onNavigate('POS Billing')}>＋ New order</button>}/>
 {error&&<div className="notice notice-warning"><strong>Live dashboard data unavailable</strong><span>{error}. Confirm backend and POS route migration.</span></div>}
 <div className="stats-grid">{cards.map(card=><StatCard key={card.label}{...card}/>)}</div>
 <section className="dashboard-grid"><article className="panel welcome-panel"><div className="panel-title-row"><div><p className="eyebrow">QUICK ACTIONS</p><h2>Run your restaurant</h2></div><span className="panel-title-icon">✦</span></div><p className="panel-description">Jump straight into the most-used POS tasks.</p><div className="quick-actions">
 <button onClick={()=>onNavigate('POS Billing')}><span className="quick-icon blue">▣</span><span><strong>Start billing</strong><small>Create an order and take payment</small></span><b>→</b></button>
 <button onClick={()=>onNavigate('Tables')}><span className="quick-icon green">▦</span><span><strong>Manage tables</strong><small>Check seating and table status</small></span><b>→</b></button>
 <button onClick={()=>onNavigate('Menu')}><span className="quick-icon orange">☷</span><span><strong>Update menu</strong><small>Items, prices and availability</small></span><b>→</b></button>
 <button onClick={()=>onNavigate('User Management')}><span className="quick-icon purple">♧</span><span><strong>Manage staff</strong><small>Users, roles and permissions</small></span><b>→</b></button></div></article>
 <article className="panel status-panel"><p className="eyebrow">SYSTEM STATUS</p><h2>Migration workspace</h2><p className="panel-description">React frontend is being connected to the Express API in stages.</p><div className="status-row"><span>React UI</span><strong className="status-good">● Running</strong></div><div className="status-row"><span>Express API</span><strong className={error?'status-warn':'status-good'}>● {error?'Needs setup':stats?'Responding':'Checking'}</strong></div><div className="status-row"><span>POS feature port</span><strong className="status-warn">In progress</strong></div><div className="status-callout">Production cutover se pehle routes, permissions aur order workflows test karein.</div></article></section></>;
}

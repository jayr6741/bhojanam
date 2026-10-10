const h=React.createElement;
const nav=['Overview','POS Billing','Tables','QR Menu','Orders','Customers','Loyalty','Menu','Settings'];
const dishes=[['🥗','Burrata & Heirloom','Starters',295],['🍟','Crispy Truffle Fries','Starters',185],['🍗','Ember-Grilled Chicken','Mains',425],['🍝','Wild Mushroom Pasta','Mains',365],['🍰','Warm Chocolate Cake','Desserts',195],['🍵','Iced Matcha Latte','Drinks',165]];
function App(){
const [page,setPage]=React.useState('Overview');
const [cart,setCart]=React.useState([]);
const [tables,setTables]=React.useState(Array.from({length:12},(_,i)=>({n:i+1,busy:[3,8,10].includes(i+1)})));
const [orders,setOrders]=React.useState([{id:'POS-1074204',name:'Table 3',total:610,status:'Verified'},{id:'QR-1074203',name:'Table 8',total:845,status:'Preparing'},{id:'POS-1074202',name:'Takeaway',total:295,status:'Completed'}]);
const [notice,setNotice]=React.useState('');
const money=n=>'₹'+Number(n).toLocaleString('en-IN');
const total=cart.reduce((s,d)=>s+d[3],0);
const msg=s=>{setNotice(s);setTimeout(()=>setNotice(''),2200)};
const button=(label,action,primary)=>'<button class="button '+(primary?'primary':'')+'" data-action="'+action+'">'+label+'</button>';
const rows=items=>items.map(x=>'<div class="rowitem"><div><div class="itemname">'+x[0]+'</div><div class="itemsub">'+(x[1]||'')+'</div></div><b>'+ (x[2]||'')+'</b></div>').join('');
const dishHtml=dishes.map((d,i)=>'<div class="dish"><div class="emoji">'+d[0]+'</div><h4>'+d[1]+'</h4><div class="category">'+d[2]+'</div><div class="dish-bottom"><b>'+money(d[3])+'</b><button class="button primary small" data-action="add" data-index="'+i+'">+ Add</button></div></div>').join('');
let body='';
if(page==='Overview'){
body='<div class="heading"><div><h2>Good afternoon 👋</h2><div class="muted">Here’s what’s happening at your restaurant today.</div></div>'+button('+ New order','pos',true)+'</div><div class="stats">'+[['Today’s revenue','₹18,450','↑ 12.8% vs yesterday'],['Orders today','42','8 more than yesterday'],['Average order value','₹439','Dine-in & takeaway'],['Active tables','3 / 12','9 tables available']].map(x=>'<div class="card"><div class="stat-label">'+x[0]+'</div><div class="stat-value">'+x[1]+'</div><div class="stat-foot">'+x[2]+'</div></div>').join('')+'</div><div class="grid2"><div class="card"><h3>Recent orders</h3>'+rows(orders.map(o=>[o.id,o.name,money(o.total)]))+'</div><div class="card"><h3>Popular menu items</h3>'+rows([['Ember-Grilled Chicken','78 sold'],['Wild Mushroom Pasta','64 sold'],['Crispy Truffle Fries','51 sold']])+'</div></div>';
}else if(page==='POS Billing'){
body='<div class="heading"><div><h2>POS Billing</h2><div class="muted">Add dishes to create a demo order.</div></div><span class="pill">Counter open</span></div><div class="menu-layout"><div class="card"><h3>Menu items</h3><div class="menuitems">'+dishHtml+'</div></div><div class="card"><h3>Current order</h3>'+(cart.length?cart.map((d,i)=>'<div class="rowitem"><span>'+d[1]+'</span><b>'+money(d[3])+'</b></div>').join(''):'<div class="empty">Your cart is empty</div>')+'<div class="totalrow final"><span>Total</span><span>'+money(total)+'</span></div>'+button('Create demo bill','checkout',true)+'</div></div>';
}else if(page==='Tables'){
body='<div class="heading"><div><h2>Tables & bookings</h2><div class="muted">Tap a table to toggle availability.</div></div>'+button('+ Add table','addtable',true)+'</div><div class="tablegrid">'+tables.map(t=>'<button class="tabletile '+(t.busy?'busy':'')+'" data-action="table" data-table="'+t.n+'"><div class="tn">Table '+t.n+'</div><div class="ts">4 seats</div><span class="pill '+(t.busy?'orange':'')+'">'+(t.busy?'Occupied':'Available')+'</span></button>').join('')+'</div>';
}else if(page==='Orders'){
body='<div class="heading"><div><h2>Orders & bills</h2><div class="muted">Recent POS and QR orders.</div></div></div><div class="card"><h3>All orders</h3>'+rows(orders.map(o=>[o.id,o.name,money(o.total)+' · '+o.status]))+'</div>';
}else if(page==='QR Menu'){
body='<div class="heading"><div><h2>QR Menu</h2><div class="muted">Guest menu preview for table ordering.</div></div></div><div class="grid2"><div class="card"><h3>Olive & Ember · Table 3</h3><div class="menuitems">'+dishHtml+'</div></div><div class="card"><h3>Table QR links</h3>'+rows([['Table 1','QR ordering link'],['Table 2','QR ordering link'],['Table 3','QR ordering link'],['Table 4','QR ordering link']])+'</div></div>';
}else{
const extra=page==='Menu'?'<div class="menuitems">'+dishHtml+'</div>':page==='Loyalty'?rows([['Points earning','10 points per ₹100 spent'],['₹50 bill discount','Redeem 100 points']]):page==='Customers'?'<div class="empty">Customer records will appear after the database is connected.</div>':rows([['Restaurant','Olive & Ember · Surat, Gujarat'],['Tax rate','5% GST preview'],['KOT printer','Browser print mode']]);
body='<div class="heading"><div><h2>'+page+'</h2><div class="muted">Restaurant management workspace.</div></div></div><div class="card">'+extra+'</div>';
}
const sidebar='<aside class="sidebar"><div class="brand"><strong>Olive & Ember</strong><small>RESTAURANT POS</small></div><div class="nav">'+nav.map(n=>'<button data-action="nav" data-page="'+n+'" class="'+(page===n?'active':'')+'"><span class="ico">'+({'Overview':'▦','POS Billing':'▣','Tables':'▤','QR Menu':'⌗','Orders':'▧','Customers':'♙','Loyalty':'✧','Menu':'☷','Settings':'⚙'})[n]+'</span><span class="label">'+n+'</span></button>').join('')+'</div><div class="sidebar-foot">● Preview workspace<br>Migration staging</div></aside>';
const markup=sidebar+'<main class="main"><header class="topbar"><div><div class="eyebrow">Restaurant management</div><h1>'+(page==='Overview'?'Dashboard':page)+'</h1></div><button class="avatar">OE</button></header><section class="content">'+body+'<div class="footer-note">Staging preview · Sample data · Existing live website has not been changed.</div></section></main>'+(notice?'<div class="toast">'+notice+'</div>':'');
return h('div',{className:'shell',dangerouslySetInnerHTML:{__html:markup},onClick:e=>{const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;if(a==='nav')setPage(b.dataset.page);if(a==='pos')setPage('POS Billing');if(a==='add')setCart(c=>[...c,dishes[Number(b.dataset.index)]]);if(a==='table')setTables(ts=>ts.map(t=>t.n===Number(b.dataset.table)?{...t,busy:!t.busy}:t));if(a==='addtable')setTables(ts=>[...ts,{n:ts.length+1,busy:false}]);if(a==='checkout'){if(!cart.length){msg('Add at least one menu item first.');return;}setOrders(os=>[{id:'POS-'+Date.now().toString().slice(-6),name:'Takeaway',total,status:'New order'},...os]);setCart([]);setPage('Orders');msg('Demo order created. Database is not connected yet.');}}});
}
ReactDOM.createRoot(document.getElementById('root')).render(h(App));
import {navigationGroups} from './navigation.js';
export default function Sidebar({activePage,onNavigate,mobileOpen,onClose}) {
 return <>{mobileOpen&&<button className="sidebar-backdrop" aria-label="Close menu" onClick={onClose}/>}<aside className={`sidebar ${mobileOpen?'sidebar-open':''}`}>
 <div className="brand"><div className="brand-logo">B</div><div><strong>Bhojanam</strong><span>RESTAURANT POS</span></div></div>
 <div className="restaurant-switch"><span className="restaurant-avatar">O</span><span><strong>Olive & Ember</strong><small>Restaurant workspace</small></span><span className="switch-chevron">⌄</span></div>
 <nav className="nav-groups" aria-label="Main navigation">{navigationGroups.map(group=><section className="nav-group" key={group.title}><p className="nav-heading">{group.title}</p>{group.items.map(item=><button key={item.label} className={`nav-item ${activePage===item.label?'active':''}`} onClick={()=>{onNavigate(item.label);onClose();}}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.label==='Orders'&&<span className="nav-dot"/>}</button>)}</section>)}</nav>
 <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">?</span><div><strong>Need a hand?</strong><small>POS help & support</small></div><span>↗</span></div><div className="user-chip"><div className="user-avatar">OE</div><div><strong>Restaurant Admin</strong><small>Administrator</small></div><button aria-label="Account options">•••</button></div></div>
 </aside></>;
}

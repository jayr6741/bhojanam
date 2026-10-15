import {useState} from 'react';
import Sidebar from './Sidebar.jsx';
export default function AppLayout({activePage,onNavigate,apiStatus,children}) {
 const [mobileOpen,setMobileOpen]=useState(false);
 return <div className="app-shell"><Sidebar activePage={activePage} onNavigate={onNavigate} mobileOpen={mobileOpen} onClose={()=>setMobileOpen(false)}/><div className="main-column">
 <header className="topbar"><button className="mobile-menu-button" aria-label="Open navigation" onClick={()=>setMobileOpen(true)}>☰</button><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{activePage}</strong></div><div className="topbar-actions"><span className={`api-pill ${apiStatus}`}><i/>{apiStatus==='connected'?'API connected':apiStatus==='checking'?'Checking API':'API offline'}</span><button className="icon-button" aria-label="Notifications">♧<i/></button><div className="topbar-avatar">OE</div></div></header>
 <main className="page-content">{children}</main><footer className="app-footer"><span>Bhojanam POS</span><span>Restaurant operations workspace</span></footer></div></div>;
}

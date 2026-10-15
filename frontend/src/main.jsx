import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
function App() {
  const [apiStatus, setApiStatus] = React.useState('Checking API…');
  React.useEffect(() => {
    let active = true;
    fetch(`${apiUrl}/health`).then(r => { if (!r.ok) throw new Error('API unavailable'); return r.json(); })
      .then(() => active && setApiStatus('Connected')).catch(() => active && setApiStatus('Not connected'));
    return () => { active = false; };
  }, []);
  return <main className="shell">
    <header className="topbar"><div className="brand-mark">B</div><div><strong>Bhojanam</strong><span>Restaurant POS</span></div><span className="environment">Migration workspace</span></header>
    <section className="welcome"><p className="eyebrow">REACT + EXPRESS FOUNDATION</p><h1>Restaurant operations,<br/>all in one place.</h1>
      <p className="intro">The new frontend/backend workspace is set up. Existing POS screens and workflows will be ported here in stages; the live Hatchable app remains unchanged.</p>
      <div className="status-card"><span className={apiStatus === 'Connected' ? 'dot online' : 'dot'}/><div><strong>Backend API</strong><span>{apiStatus}</span></div><code>{apiUrl}</code></div>
    </section><footer>Migration scaffold · Existing production data has not been modified.</footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);

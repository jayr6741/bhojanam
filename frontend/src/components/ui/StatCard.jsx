export default function StatCard({ label, value, detail, icon, tone = 'blue' }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}>{icon}</span></div><strong className="stat-value">{value}</strong><span className="stat-detail">{detail}</span></article>;
}

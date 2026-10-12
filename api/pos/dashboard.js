import { db } from 'hatchable';
export const access = 'admin';
export const methods = ['GET'];
export default async function (req, res) {
  try {
    const [orders, customers, tables, menu] = await Promise.all([
      db.query("SELECT count(*)::int AS count, COALESCE(sum((payload->>'total')::numeric),0)::numeric AS revenue FROM restaurant_orders WHERE created_at >= date_trunc('day', now()) AND status <> 'Cancelled'"),
      db.query('SELECT count(*)::int AS count FROM restaurant_customers'),
      db.query("SELECT count(*) FILTER (WHERE status = 'Occupied')::int AS occupied, count(*)::int AS total FROM restaurant_tables"),
      db.query("SELECT value FROM restaurant_config WHERE key = 'menu'")
    ]);
    const recent = await db.query('SELECT id, payload, status, created_at FROM restaurant_orders ORDER BY created_at DESC LIMIT 8');
    return res.json({ stats: { todayOrders: orders.rows[0].count, todayRevenue: Number(orders.rows[0].revenue), customers: customers.rows[0].count, occupiedTables: tables.rows[0].occupied, totalTables: tables.rows[0].total, menuItems: Array.isArray(menu.rows[0]?.value) ? menu.rows[0].value.length : 0 }, recentOrders: recent.rows.map(r => ({ id:r.id, ...r.payload, status:r.status, createdAt:r.created_at })) });
  } catch (e) { console.error('Dashboard query failed', e.message); return res.status(500).json({ error: 'Could not load dashboard data.' }); }
}
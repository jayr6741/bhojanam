# Controllers

Keep request parsing and HTTP responses in controllers; keep SQL access in services/repositories.

Migration order:
1. account/login, logout, me, password change/reset, users and role permissions
2. POS menu, customers, tables, orders and billing
3. QR menu token/table validation and QR order placement
4. loyalty ledger/rewards/tiers
5. inventory, suppliers, purchases, recipes and stock movements
6. kitchen stations/tickets and KOT
7. shifts, cash drawer, expenses, audit, revenue/reports and backups

Do not remove the current permission checks while porting. Add automated tests for each route before switching production traffic.

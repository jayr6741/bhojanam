# Bhojanam Restaurant POS — React + Express migration

This branch is a migration workspace separate from the live Hatchable deployment. The live app and its database have not been modified.

## Target structure

```text
bhojanam/
├── frontend/
│   ├── .env                 # local only; ignored by Git
│   ├── .env.example
│   ├── src/
│   └── package.json
├── backend/
│   ├── .env                 # local only; ignored by Git
│   ├── .env.example
│   ├── routes/
│   ├── controllers/
│   ├── middleware/
│   ├── config/
│   ├── server.js
│   └── package.json
├── migrations/
├── seed.sql
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Local setup

Requirements: Node.js 20+ and a PostgreSQL database you are authorized to use.

1. Install root tools: `npm install`
2. Install frontend dependencies: `npm --prefix frontend install`
3. Install backend dependencies: `npm --prefix backend install`
4. Copy `frontend/.env.example` to `frontend/.env`.
5. Copy `backend/.env.example` to `backend/.env`; configure `DATABASE_URL`, a unique long `SESSION_SECRET`, and `FRONTEND_URL`.
6. Run `npm run dev`.

Frontend: `http://localhost:5173`  
API health check: `http://localhost:5000/api/health`

## Environment files and credentials

Git does not track the real `.env` files intentionally. Create them locally from the examples. Never commit database credentials, session secrets, payment keys, or production tokens. Do not put private credentials into frontend `VITE_*` variables. Configure deployment secrets directly in the hosting environment.

## Existing POS feature migration plan

- **Foundation:** React/Vite client, Express API, PostgreSQL pool, route registry, health endpoint, error middleware.
- **Access control:** login/logout/session, password reset/change, user management, role/permission checks.
- **POS core:** menu/categories, customers, billing/orders/payments, tables, table merge, booking, receipts.
- **QR ordering:** signed/unguessable table tokens, locked table context, live order refresh/events, server-side validation.
- **Loyalty:** points ledger, redemption, rewards and tiers.
- **Operations:** inventory, stock movements, suppliers/purchases, recipes, kitchen stations/tickets/KOT, shifts, cash drawer and expenses.
- **Admin:** settings, audit log, reports/revenue, backup/restore.
- **Release:** automated tests, responsive checks, migration rehearsal, data comparison, rollback plan and only then cutover.

## Current completion status

This branch contains the **migration foundation**, not a complete conversion of every POS screen and API. The React page is a starter screen, and POS feature routes/controllers still need to be ported from the existing Hatchable app. The existing `migrations/` and `seed.sql` are carried over from the repository, but must be reviewed against the target database before running them.

Do not point this scaffold at production or switch traffic yet. Preserve the live Hatchable app as the source of truth until the entire feature set, role permissions, QR ordering, payments, table merging, loyalty, KOT and data migration are tested end-to-end.

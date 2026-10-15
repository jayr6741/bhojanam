# Bhojanam — React + Express migration

This branch is a **migration workspace**, separate from the live Hatchable POS. The production app and its database have not been changed.

## Structure
- `frontend/` — React + Vite client
- `backend/` — Express API, PostgreSQL connection and health endpoint
- `migrations/` and `seed.sql` — existing SQL files from the current repository

## Requirements
- Node.js 20 or newer
- PostgreSQL connection details for the target database

## Local setup
1. Run `npm install` at the root.
2. Run `npm --prefix frontend install`.
3. Run `npm --prefix backend install`.
4. Copy `frontend/.env.example` to `frontend/.env`.
5. Copy `backend/.env.example` to `backend/.env`; set the target PostgreSQL URL and a long random `SESSION_SECRET`.
6. Start both apps with `npm run dev`.

Frontend: `http://localhost:5173`  
API health: `http://localhost:5000/api/health`

## Environment and credentials
Real `.env` files are intentionally ignored by Git. Only example templates belong in the repository. Never put database passwords, session secrets, payment keys, or other private credentials in frontend `VITE_*` variables or commit them to GitHub. Configure actual credentials directly on the development machine or deployment server.

## Migration status
This branch currently contains the workspace foundation and API health check, **not a completed POS port**. Existing features include billing, orders, QR ordering, tables, menu, loyalty, user/role permissions, inventory, kitchen/KOT, reports and more. Each API, authorization rule, frontend screen and database behavior must be mapped and tested before this branch can replace anything.

Do not point this scaffold at production or switch traffic until all routes and permissions are ported, the schema is reconciled, data export/import and rollback are tested, and QR live updates, billing, KOT, table merging, loyalty and user management are verified end to end. The current Hatchable deployment remains the live source of truth during migration.

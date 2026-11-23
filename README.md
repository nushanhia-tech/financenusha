# NUSHA Finance

NUSHA Finance is the finance portal for NUSHA Students Union. It uses Next.js App Router, TypeScript, Tailwind CSS, shadcn-style Radix components, Recharts, Zod, and Supabase PostgreSQL and private Storage. NUSHA Finance manages usernames, password hashes and login sessions.

## Local development

Install Node.js 22 or later, npm, and Docker. Use the project’s Supabase CLI to start an isolated development project.

```sh
npm ci
npm run supabase -- start
npm run supabase -- status -o env
cp .env.example .env.local
```

Use the local CLI output to populate `.env.local`.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Local Supabase API URL, normally `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key, or the local legacy `ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret key, or the local legacy `SERVICE_ROLE_KEY` |
| `SUPABASE_JWT_SECRET` | Local `JWT_SECRET` used by the Supabase database and Storage APIs |
| `APP_ORIGIN` | Exact app origin, normally `http://localhost:3000` |
| `DEMO_PASSWORD` | A password of at least 12 characters. Required for the additional local test accounts |

Supabase applies the SQL migrations on first start. Run `npm run supabase -- migration up --local` after pulling new migrations for an existing local stack.

```sh
npm run seed:demo
npm run dev
```

Open `http://localhost:3000` and sign in with username `admin` and password `admin123`. Additional local test accounts use usernames `secretary`, `checker`, `nu-000001`, `nu-000002` and `nu-000003` with `DEMO_PASSWORD`. The seed creates sample finance records and only runs when the application and database URLs are loopback addresses. Use `npm run seed:demo -- --account-only` to add the demo administrator to an existing local database.

## Production deployment on Vercel

1. Apply the migrations to the hosted Supabase project.

   ```sh
   npm run supabase -- login
   npm run supabase -- link --project-ref YOUR_SUPABASE_PROJECT_REF
   npm run supabase -- db push
   ```

   Migration `202611230006_username_auth.sql` moves existing finance accounts to application-managed sign-in. For members, the username is their member ID in lowercase. For officers, it uses the existing email's local part when unique and valid. List assigned names in the Supabase SQL Editor if needed.

   ```sql
   select u.name, u.role, c.username
   from public.users u
   join finance_private.credentials c on c.user_id = u.id;
   ```

   Existing supported password hashes are carried forward. Members with pending invitations can get a temporary password from their officer. Users sign in again after the deployment, and any officers using two-factor authentication enroll their authenticator in the new login system.

2. In Vercel, import `nushanhia-tech/financenusha` as a Next.js project and set these **Production** Variables before deploying.

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Hosted Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key or legacy anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key or legacy service-role key |
   | `SUPABASE_JWT_SECRET` | **Legacy JWT Secret** under Supabase **Project Settings → JWT Keys**. The project APIs must accept tokens signed with this key |
   | `APP_ORIGIN` | The production Vercel origin, for example `https://financenusha.vercel.app` |

   The database service key and JWT signing secret are server-only. NUSHA issues short-lived tokens for PostgreSQL and private Storage access. These requests use row-level security and are tied to an active application session. Coordinate the migration and redeployment during an upgrade because the older sign-in is retired by the migration.

3. Create production officer usernames from a trusted terminal. Copy the production environment values into your ignored `.env.local` for the following commands. They prompt for a password without echoing it.

   ```sh
   npm run auth:officer -- create treasurer TREASURER "Union Treasurer"
   npm run auth:officer -- create finance-secretary FINANCE_SECRETARY "Finance Secretary"
   ```

   For an existing officer username use `npm run auth:officer -- reset USERNAME`. The demo password is only set by the local seed. Use individual officer accounts with passwords of at least 12 characters. High-value approvals require distinct reviewers under the configured maker-checker policy.

4. Deploy and verify the officer sign-in at the final Vercel URL. In **Members**, use **Create member login** or **Reset member password** to generate a temporary password and share it privately. It expires after 24 hours. The member sets a permanent password before accessing finance pages. To require officer MFA, enroll in the application and enable the requirement in Settings.

## Financial workflows

- **Transactions.** Save a draft, attach supporting documents, submit for approval, and post after the required decisions. Posted transactions are immutable. A reversal uses a new dated transaction and the original journal lines with debit and credit exchanged.
- **Balances.** Financial account balances sum posted journal movements. Accrual-based income and expense reports include recognised dues and reimbursements. Collections against dues credit receivables, and payments against reimbursements debit payables. Internal transfers appear in account books without creating income or expenses.
- **Proofs.** Members upload evidence and a payment reference. Administrators confirm receipt in the financial account, then verify a matching existing transaction or create a new one through the approval workflow. Proofs, pledges, and budgets have no effect on cash at submission or allocation.
- **Approvals.** Thresholds and maker-checker are captured when the transaction is submitted. Approvals and rejected decisions are retained by submission round. For high-value proof submissions, post the approved transaction from Approvals to complete verification and release the receipt.
- **Reconciliation.** Record actual balances by statement date. Optionally import a CSV with `reference,amount` and signed account movements. The ledger compares reference and amount and shows statement-only and system-only entries.
- **Closing.** Resolve pending items and reconcile affected accounts through the last date of the period. Closing posts the income and expense offset to retained surplus and locks the period. Asset, liability, and equity balances carry forward through the cumulative journal.
- **Reports.** Use date and dimension filters with PDF, XLSX, or CSV. PDF exports allow 500 rows, and spreadsheets allow 5,000 rows per export. Narrow the period for larger datasets. Member statements and individual receipts use authenticated download routes.
- **Notifications.** The app delivers notifications in the portal. The email and mobile push delivery interfaces are in `lib/notification-delivery.ts`.

## Tests

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run build
```

Use a fresh local database with the demo seed before the integration and browser suites. Integration tests verify username login, session revocation, database policies, balanced journals, approval requirements, reversals, reference idempotency, proof posting, receipts, and period closure. The browser tests cover admin and member sign-in, the major navigation routes, private receipt downloads, report formats, and mobile navigation. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if using a preinstalled Chromium.

`FINANCE_TEST_STORAGE=metadata` allows the integration suite to exercise proof accounting and Storage RLS against local PostgreSQL metadata when the Storage HTTP service is unavailable. Use the default mode with the Supabase stack to test actual uploads and downloads.

## Repository layout and backups

- `app/` contains the portals, login pages and authenticated downloads.
- `components/` contains portal sections, forms, charts and tables.
- `lib/` contains application session helpers, validation, localization and export formatters.
- `supabase/migrations/` contains the schema, RLS, atomic workflows, reporting views and read functions.

Use the hosted Supabase backup or point-in-time recovery features available to your plan. Keep separate, access-controlled backups of Storage objects because database backups contain object metadata only. Test database and Storage restoration together in a staging project so receipt and proof links resolve after recovery. Treat Supabase secret keys, connection strings, financial exports and Storage backups as restricted data.

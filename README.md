# NUSHA Finance

NUSHA Finance is the finance portal for NUSHA Students Union. It uses Next.js App Router, TypeScript, Tailwind CSS, shadcn-style Radix components, Recharts, Zod, and Supabase Auth, PostgreSQL, and private Storage.

## Local development

Install Node.js 22 or later, npm, and Docker. Use the project’s Supabase CLI to start an isolated development project.

```sh
npm ci
npm run supabase -- start
npm run supabase -- status -o env
cp .env.example .env.local
```

Populate `.env.local` using the local output:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Local Supabase API URL, normally `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key, or the local legacy `ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret key, or the local legacy `SERVICE_ROLE_KEY` |
| `APP_ORIGIN` | Exact app origin, normally `http://localhost:3000` |
| `DEMO_PASSWORD` | A password of at least 12 characters. Required only for the local demo and tests |

Supabase applies the SQL migrations on first start. Run `npm run supabase -- migration up --local` after pulling new migrations for an existing local stack.

```sh
npm run seed:demo
npm run dev
```

Open `http://localhost:3000`. Sign in as `treasurer@nusha.test`, `secretary@nusha.test`, `member-a@nusha.test`, or `member-b@nusha.test` with `DEMO_PASSWORD`. The seed uses the normal finance commands and generates real journal entries. It targets loopback Supabase only and expects a fresh finance database. The local mail inbox is normally available at `http://127.0.0.1:54324`.

## Production deployment on Vercel

1. Create or select a hosted Supabase project. Sign in to the Supabase CLI, then link and migrate that project from this repository.

   ```sh
   npm run supabase -- login
   npm run supabase -- link --project-ref YOUR_SUPABASE_PROJECT_REF
   npm run supabase -- db push
   ```

   The migrations create the finance tables, policies, functions, and private `finance-documents` bucket. Use a distinct Supabase project for previews that need financial data.

2. In Supabase Authentication, disable public sign-ups and enable TOTP enrollment and verification. Set the Site URL to the final Vercel origin and add exactly `https://YOUR_DOMAIN/auth/callback` as an allowed redirect. In the **Invite user** and **Reset password** email templates, copy the HTML from `supabase/templates/invite.html` and `supabase/templates/recovery.html`. Configure SMTP for production delivery.

3. Create the Treasurer and Finance Secretary Auth users with the Supabase dashboard. Register those users in the finance tables with their exact Auth emails. Run this in the Supabase SQL Editor after replacing all four example values.

   ```sql
   insert into public.users (id, name, role)
   select a.id, p.name, p.role::public.finance_role
   from auth.users a
   join (values
     ('treasurer@example.org', 'Treasurer name', 'TREASURER'),
     ('finance-secretary@example.org', 'Finance Secretary name', 'FINANCE_SECRETARY')
   ) as p(email, name, role) on lower(a.email) = lower(p.email);
   ```

   Confirm both profiles appear in `public.users`. For high-value transactions under maker-checker, assign a second eligible reviewer using one of the two finance roles, or configure the approval policy according to the union’s governance. Two approvals require two distinct reviewers. With maker-checker enabled, neither can be the creator.

4. In Vercel, import `financenusha-cloud/nushafinance`. Select Next.js, use the repository root, and keep the default `npm run build`. Set the production values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_ORIGIN`. The secret key belongs only in Vercel’s server-side environment. `DEMO_PASSWORD` is local only. Deploy and verify the sign-in screen at the final domain.

5. Sign in as an officer, create and activate the academic year, then configure accounts and any verified opening balances. Add members and send their invitations from the Members page. To require administrator MFA, enroll an authenticator, complete a challenge, and enable the requirement in Settings.

## Financial workflows

- **Transactions.** Save a draft, attach supporting documents, submit for approval, and post after the required decisions. Posted transactions are immutable. A reversal uses a new dated transaction and the original journal lines with debit and credit exchanged.
- **Balances.** Financial account balances sum posted journal movements. Accrual-based income and expense reports include recognised dues and reimbursements. Collections against dues credit receivables, and payments against reimbursements debit payables. Internal transfers appear in account books without creating income or expenses.
- **Proofs.** Members upload evidence and a payment reference. Administrators confirm receipt in the financial account, then verify a matching existing transaction or create a new one through the approval workflow. Proofs, pledges, and budgets have no effect on cash at submission or allocation.
- **Approvals.** Thresholds and maker-checker are captured when the transaction is submitted. Approvals and rejected decisions are retained by submission round. For high-value proof submissions, post the approved transaction from Approvals to complete verification and release the receipt.
- **Reconciliation.** Record actual balances by statement date. Optionally import a CSV with `reference,amount` and signed account movements. The ledger compares reference and amount and shows statement-only and system-only entries.
- **Closing.** Resolve pending items and reconcile affected accounts through the last date of the period. Closing posts the income and expense offset to retained surplus and locks the period. Asset, liability, and equity balances carry forward through the cumulative journal.
- **Reports.** Use date and dimension filters with PDF, XLSX, or CSV. PDF exports allow 500 rows, and spreadsheets allow 5,000 rows per export. Narrow the period for larger datasets. Member statements and individual receipts use authenticated download routes.
- **Notifications.** The app delivers notifications in the portal. The email and mobile push delivery interfaces are in `lib/notification-delivery.ts`. Supabase Auth delivers invitation and recovery emails independently.

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

Use a fresh local database with the demo seed before the integration and browser suites. Integration tests verify real Auth roles, database policies, balanced journals, approval requirements, reversals, reference idempotency, proof posting, receipts, and period closure. The browser tests cover admin and member sign-in, the major navigation routes, private receipt downloads, report formats, and mobile navigation. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if using a preinstalled Chromium.

`FINANCE_TEST_STORAGE=metadata` allows the integration suite to exercise proof accounting and Storage RLS against local PostgreSQL metadata when the Storage HTTP service is unavailable. Use the default mode with the Supabase stack to test actual uploads and downloads.

## Repository layout and backups

- `app/` contains the portals, Auth callbacks and authenticated downloads.
- `components/` contains portal sections, forms, charts and tables.
- `lib/` contains Supabase session helpers, validation, localization and export formatters.
- `supabase/migrations/` contains the schema, RLS, atomic workflows, reporting views and read functions.

Use the hosted Supabase backup or point-in-time recovery features available to your plan. Keep separate, access-controlled backups of Storage objects because database backups contain object metadata only. Test database and Storage restoration together in a staging project so receipt and proof links resolve after recovery. Treat Supabase secret keys, connection strings, financial exports and Storage backups as restricted data.

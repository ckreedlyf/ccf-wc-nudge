# CCF Miner Nudge Tool - Laptop Handover

Last updated: October 2, 2026 (Asia/Singapore)

## Start Here

The safe continuation branch is:

```text
codex/admin-reporting-deploy
```

Repository:

```text
https://github.com/ckreedlyf/ccf-wc-nudge.git
```

Production:

```text
https://ccf-miner-nudge.vercel.app/
```

The production application currently corresponds to code commit `870d601` plus no later application-code changes. This handover document is committed after that application commit.

Do not continue from `main`. It is behind the deployed role-access, reporting, and Sent-counter implementation.

## New Laptop Setup

Install Git and a current Node.js LTS release, then run:

```powershell
git clone https://github.com/ckreedlyf/ccf-wc-nudge.git
cd ccf-wc-nudge
git switch --track origin/codex/admin-reporting-deploy
npm ci
npm test
npm run check
npm run build
```

Expected application commit in the recent history:

```text
870d601 Fix sent-today queue counters
609f033 Add admin reporting and PDF exports
a769ce3 Display v1.2 in app header
```

## Environment Setup

Create `.env.local` from `.env.example`, or securely pull the Development environment from the existing Vercel project.

Required variables:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_SERVICE_ACCOUNT_JSON
CCF_SHEET_ID
```

Never put real values in this document, source files, commits, screenshots, or chat messages. `.env.local`, `.env.*.local`, `.vercel`, and `*.private.json` are ignored by Git.

To link the local clone to the existing Vercel project:

```powershell
npx vercel login
npx vercel link --project ccf-miner-nudge
npx vercel env pull .env.local --environment=development
```

Confirm that the Vercel account and team are the same ones that own the current `ccf-miner-nudge` project before deploying.

The complete role and service-account setup is documented in `ROLE_ACCESS_SETUP.md`.

## Current Architecture

- `index.html`: Single-page frontend, dashboard, queues, role-based navigation, seeker editing, reporting preview, and client-side Sheet model.
- `api/auth/*`: Supabase email/password session endpoints.
- `api/admin/users.js`: Admin-only user creation, reset, enable, and disable operations.
- `api/sheets.js`: Authenticated Google Sheets proxy with role and IMT assignment enforcement.
- `api/miner-updates.js`: Miner Integration update exchange and acknowledgement.
- `api/reports.js`: Admin-only report options, preview data, and PDF download.
- `api/_lib/reporting.js`: Aggregated report metrics and deterministic summaries.
- `api/_lib/report-statuses.js`: Central reporting status definitions.
- `api/_lib/report-pdf.js`: PDFKit report renderer.
- `supabase/migrations/202609120001_app_profiles.sql`: Role/profile schema.

The frontend intentionally remains a static `index.html`; Vercel deploys the files in `dist` and the `api` directory as serverless functions.

## Roles

- `imt`: Miner Nudge view for the user's assigned IMT only.
- `confirmation`: For Confirmation workflow only.
- `admin`: All IMTs, For Confirmation, Audit Trail, Users, and Reports.

Role authorization must be enforced by the server. Do not trust a role or IMT assignment supplied only by the browser.

## Important Business Rules

### Sent Today

The September 29 patch fixed historical local marks appearing in today's Sent counter.

- Source of truth: Date Last Touch (DLT) from the selected Harvest rows.
- Application timezone: `Asia/Singapore`.
- A Miner is counted as Sent today only when all applicable seeker rows for that Miner in the current IMT/month/status scope have DLT equal to today's calendar date.
- Historical or blank DLT values do not count.
- Remaining is always Queue Miners minus Sent today.
- Local staging IDs are date-scoped and are not the Sent KPI source.
- Do not rewrite historical DLT values to calculate dashboard metrics.

The live verification for MR, July-September 2026, active statuses 1-4 on September 29 returned:

```text
Queue Miners: 14
Sent: 0
Remaining: 14
```

### Statuses

Harvest placement status codes remain centralized and must not be redefined casually:

```text
1, 2, 3a, 3b, 4, 5, 6a, 6b, 6c, 7, 8
```

### Sheet Safety

- IMT users may update only their assigned rows.
- IMT writes are limited to Placement Status, IMT Remarks, and DLT.
- For Confirmation users may update only the For Confirmation status/DLT fields.
- Admin-only functions include Audit Trail, Users, and Reports.
- Keep the Google service-account key server-side.

## Admin Reporting

Admin navigation includes `Reports`.

API:

```text
GET  /api/reports
POST /api/reports
POST /api/reports?format=pdf
```

Report types:

- Executive Summary
- Detailed Operational Report

Reports use aggregated Harvest data and intentionally exclude unnecessary phone numbers, proof images, notes, passwords, tokens, and internal row IDs.

PDFKit dynamically loads font assets. Keep this Vercel configuration unless the PDF implementation changes:

```json
{
  "functions": {
    "api/reports.js": {
      "includeFiles": "node_modules/pdfkit/js/**"
    }
  }
}
```

## Tests and Checks

Run before every deployment:

```powershell
npm test
npm run check
npm run build
git diff --check
```

The test command covers:

- access controls and IMT Sheet scoping
- reporting metrics, Admin guard, privacy fields, and PDF generation
- DLT Sent-today parsing, timezone rollover, and queue arithmetic

## Safe Deployment

Inspect the diff first:

```powershell
git status --short
git diff --stat
git diff
```

Preview when the Preview environment has the required secrets:

```powershell
npx vercel deploy
```

Production workflow used successfully:

```powershell
npx vercel build --prod
npx vercel deploy --prebuilt --prod
npx vercel inspect https://ccf-miner-nudge.vercel.app
```

After deployment, verify:

1. Unauthenticated users see no queue or Sheet data.
2. An IMT account sees only its assigned IMT.
3. For Confirmation sees only its own workflow.
4. Admin sees Miner Nudge, For Confirmation, Audit Trail, Users, and Reports.
5. `/api/reports` rejects unauthenticated and non-Admin requests.
6. Report preview and PDF download both work.
7. Sent, Remaining, and progress use only today's DLT in Asia/Singapore.
8. `Sent + Remaining = Queue Miners`.

## Git Safety Note

On the original laptop there is another worktree at:

```text
C:\Users\My PC\Documents\New project\ccf-wc-nudge-role-access
```

That checkout contains unrelated, uncommitted experiments and was deliberately excluded from the production/reporting/Sent-counter deployments. Those local changes are not the continuation source and are not on the remote continuation branch.

If anything from that old checkout is needed later, inspect and port individual hunks deliberately. Do not deploy, commit, merge, reset, or copy the entire dirty worktree blindly.

The clean worktree used for the latest production deployments is:

```text
C:\Users\My PC\Documents\New project\ccf-wc-nudge-admin-reporting-deploy
```

## Recommended First Step on the Laptop

After setup, open this file, run the full test/check/build sequence, and compare the local branch with production before making a patch:

```powershell
git status
git log --oneline -5
npx vercel inspect https://ccf-miner-nudge.vercel.app
```

Continue with narrowly scoped commits. For production hotfixes, isolate unrelated changes before deployment.

# Role-based access setup

This branch replaces browser-held Google OAuth tokens with Supabase email/password authentication and a server-side Google service account. Do not deploy it until the steps below are complete.

## Access model

| Role | Workspace access |
| --- | --- |
| IMT User | Miner Nudge for the account's single IMT assignment only |
| For Confirmation | RG For Confirmation workflow only |
| Admin | Every IMT queue, For Confirmation, all-IMT overview, Audit Trail, and user management |

Every temporary password is generated once and returned only to the Admin. The user must replace it with a password of at least 12 characters before any Sheet data is available.

## 1. Create Supabase project

1. Create a Supabase project for the CCF Nudge Tool.
2. Open **SQL Editor** and run `supabase/migrations/202609120001_app_profiles.sql`.
3. Keep email confirmation disabled for administrator-created accounts; the server creates them as already confirmed.
4. Copy the project URL, anon key, and service-role key. The service-role key is server-only.

## 2. Create Google service account

1. In the Google Cloud project with Sheets API enabled, create a service account and a JSON key.
2. Share the centralized Google Sheet with the service account's `client_email` as **Editor**.
3. Keep the entire JSON key server-side. Do not commit it or paste it into `index.html`.

## 3. Configure Vercel

Add these variables for Production, Preview, and Development:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_SERVICE_ACCOUNT_JSON
CCF_SHEET_ID
```

`GOOGLE_SERVICE_ACCOUNT_JSON` is the complete single-line JSON document. `CCF_SHEET_ID` should identify the centralized Sheet.

## 4. Bootstrap the first five accounts

After the migration and environment variables are available, run this once from a secure terminal:

```powershell
node scripts/bootstrap-users.mjs > initial-credentials.private.json
```

The script creates:

- `megsrafols@gmail.com` as MR IMT User
- `valeriezandueta@gmail.com` as VZ IMT User
- `juminagayo@gmail.com` as Admin with JG as the default assignment
- `jeccatorres02@gmail.com` as JT IMT User
- `gamboarmell@gmail.com` as RG For Confirmation

Send each temporary password privately. Delete `initial-credentials.private.json` after distribution; it is ignored by Git. Future accounts and password resets are handled in the Admin **Users** screen.

## 5. Validate before production

Test all five access paths in Preview:

1. IMT users cannot switch assignments or open For Confirmation/Audit/Users.
2. RG can access only For Confirmation.
3. Admin can switch assignments and see the overview, Audit Trail, and Users.
4. A temporary password always opens the forced password-change dialog.
5. A Sheet write from an IMT account is rejected if the row's current Column A no longer matches that account.
6. User creation, reset, enable, and disable actions appear in Audit Log.

Volunteers should no longer need direct Editor access to the centralized Sheet. Removing that direct access after rollout prevents bypassing the app's assignment controls.

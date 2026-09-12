create table if not exists public.app_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  role text not null check (role in ('admin', 'imt', 'confirmation')),
  imt_assignment text,
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imt_users_have_assignment check (role <> 'imt' or nullif(trim(imt_assignment), '') is not null)
);

alter table public.app_profiles enable row level security;
revoke all on table public.app_profiles from anon, authenticated;
grant select, insert, update, delete on table public.app_profiles to service_role;

comment on table public.app_profiles is 'Server-managed CCF Nudge Tool roles. Browser clients have no direct access.';

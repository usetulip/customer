-- Client portal projects, ported from usetulip/backend src/drizzle/project-schema.ts.
-- Rows are written by the customer app's route handlers with the service role;
-- signed-in users can only read their own rows.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'processing', 'delivered')),
  primary_color text not null,
  secondary_color text not null,
  background_color text not null,
  layout_type text not null,
  features jsonb not null default '[]'::jsonb,
  pipeline_steps jsonb not null default '[
    {"id": "brief", "label": "Brief Received & Validated", "status": "completed"},
    {"id": "orchestration", "label": "AI Orchestration in Progress", "status": "active"},
    {"id": "qa", "label": "Human QA & Token Sync", "status": "pending"},
    {"id": "compilation", "label": "Asset Compilation", "status": "pending"}
  ]'::jsonb,
  processing_started_at timestamptz,
  delivered_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  figma_file_url text,
  figma_file_name text,
  github_url text,
  zip_file_url text,
  zip_file_name text,
  s3_bucket text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_created_at_idx
  on public.projects (user_id, created_at desc);

-- A user may only have one project that is not yet delivered.
create unique index projects_one_active_per_user
  on public.projects (user_id)
  where status <> 'delivered';

alter table public.projects enable row level security;

create policy "Users can read their own projects"
  on public.projects
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- API keys for the remote Tulip MCP server (mcp-server/, header x-tulip-api-key).
-- Only a SHA-256 hash of each key is stored. Each key is scoped to the
-- client token sets (client_ids) it may read and compile against.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 120),
  -- First characters of the key (e.g. tulip_live_Ab12), to identify it in lists.
  key_prefix text not null check (key_prefix ~ '^tulip_(live|test)_[A-Za-z0-9_-]{4}$'),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  client_ids text[] not null check (
    cardinality(client_ids) > 0
    and array_to_string(client_ids, ',') ~ '^[a-z0-9][a-z0-9-]{0,62}(,[a-z0-9][a-z0-9-]{0,62})*$'
  ),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

-- RLS on with no policies: only the service role (which bypasses RLS) can
-- read or write keys. Clients using the anon key or a user JWT see nothing.
alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;

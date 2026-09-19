-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run

-- One row per magazine a user has favorited
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  archive_id text not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (user_id, archive_id)
);

-- Named groups a user creates to organize favorites
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Many-to-many: a favorite can belong to multiple collections
create table public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  favorite_id uuid not null references public.favorites(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, favorite_id)
);

alter table public.favorites enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

create policy "own favorites" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own collections" on public.collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own collection items" on public.collection_items
  for all using (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
    and exists (select 1 from public.favorites f where f.id = favorite_id and f.user_id = auth.uid())
  );

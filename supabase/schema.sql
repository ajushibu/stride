-- Stride: one row of JSON per signed-in user. Safe to run in an existing project
-- (for example the one Margin and Recall use): it only creates the stride_state table.

create table if not exists public.stride_state (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.stride_state enable row level security;

drop policy if exists "stride_select_own" on public.stride_state;
drop policy if exists "stride_insert_own" on public.stride_state;
drop policy if exists "stride_update_own" on public.stride_state;
drop policy if exists "stride_delete_own" on public.stride_state;

create policy "stride_select_own" on public.stride_state for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "stride_insert_own" on public.stride_state for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "stride_update_own" on public.stride_state for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "stride_delete_own" on public.stride_state for delete to authenticated
  using ((select auth.uid()) = user_id);

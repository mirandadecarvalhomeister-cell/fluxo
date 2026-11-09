alter table public.posts add column if not exists media jsonb default '[]'::jsonb;
alter table public.posts add column if not exists comments_disabled boolean default false;

create table if not exists public.direct_messages (
  id text primary key,
  sender_id text not null,
  recipient_id text not null,
  text text default '',
  attachment jsonb,
  read boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists direct_messages_sender_idx on public.direct_messages (sender_id);
create index if not exists direct_messages_recipient_idx on public.direct_messages (recipient_id);
create index if not exists direct_messages_created_idx on public.direct_messages (created_at);

alter table public.direct_messages enable row level security;

drop policy if exists direct_messages_read on public.direct_messages;
create policy direct_messages_read on public.direct_messages for select to authenticated using (
  sender_id = auth.uid()::text or recipient_id = auth.uid()::text
);
drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages for insert to authenticated with check (
  sender_id = auth.uid()::text and recipient_id <> auth.uid()::text
);
drop policy if exists direct_messages_update on public.direct_messages;
create policy direct_messages_update on public.direct_messages for update to authenticated using (
  recipient_id = auth.uid()::text or sender_id = auth.uid()::text
) with check (
  recipient_id = auth.uid()::text or sender_id = auth.uid()::text
);
drop policy if exists direct_messages_delete on public.direct_messages;
create policy direct_messages_delete on public.direct_messages for delete to authenticated using (
  sender_id = auth.uid()::text
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;

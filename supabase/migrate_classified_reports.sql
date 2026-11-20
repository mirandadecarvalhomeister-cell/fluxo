-- Denúncias de anúncios dos classificados (VibeFluxo 2.0 — Etapa 3).
-- Qualquer membro autenticado pode denunciar; apenas leitura para
-- owner/admin/moderator da comunidade. Idempotente.

create table if not exists public.community_classified_reports (
  id text primary key,
  classified_id text not null references public.community_classifieds(id) on delete cascade,
  reporter_id text not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (classified_id, reporter_id)
);
alter table public.community_classified_reports enable row level security;

drop policy if exists community_classified_reports_insert on public.community_classified_reports;
create policy community_classified_reports_insert on public.community_classified_reports
  for insert to authenticated with check (reporter_id = auth.uid()::text);

drop policy if exists community_classified_reports_read on public.community_classified_reports;
create policy community_classified_reports_read on public.community_classified_reports
  for select to authenticated using (
    reporter_id = auth.uid()::text
    or exists (
      select 1 from public.community_classifieds c
      where c.id = community_classified_reports.classified_id
        and (
          exists (select 1 from public.communities cm where cm.id = c.community_id and cm.owner_id = auth.uid()::text)
          or exists (
            select 1 from public.community_members m
            where m.community_id = c.community_id
              and m.user_id = auth.uid()::text
              and m.role in ('owner', 'admin', 'moderator')
          )
        )
    )
  );

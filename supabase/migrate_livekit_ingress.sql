-- Ingress RTMP por palco (transmissão via OBS).
-- A chave de transmissão é secreta: apenas o dono do palco pode ler.
-- A criação/atualização é feita pelo servidor (Edge Function livekit-ingress)
-- usando a service_role, que ignora o RLS. Seguro para rodar mais de uma vez.

create table if not exists public.channel_ingress (
  channel_id text primary key references public.channels(id) on delete cascade,
  owner_id text not null,
  ingress_id text not null,
  url text not null,
  stream_key text not null,
  created_at timestamptz not null default now()
);

alter table public.channel_ingress enable row level security;

-- Somente o dono do palco pode ler a própria URL/chave. Não criar policies de
-- insert/update/delete: a escrita é exclusiva do servidor com service_role.
drop policy if exists "channel ingress owner read" on public.channel_ingress;
create policy "channel ingress owner read"
  on public.channel_ingress for select
  using (auth.uid()::text = owner_id);

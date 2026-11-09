alter table public.channels
  add column if not exists livekit boolean not null default false;

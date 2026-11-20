-- Tema da interface por usuário (VibeFluxo 2.0 — Etapa 2).
-- Idempotente: não altera perfis existentes (default 'dark' preserva o tema
-- atual da maioria dos usuários; quem preferia claro ajusta nas configurações).
alter table public.profiles
  add column if not exists theme text not null default 'dark'
    check (theme in ('light', 'dark'));

create index if not exists profiles_user_idx on public.profiles (user_id);

-- ============================================================================
-- Remove o formato "reações" dos posts: converte posts antigos desse formato
-- para "text" e retira o formato das opções de criação (já feito no app).
-- Idempotente.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgname = 'posts_guard_interactive_schedule'
      and tgrelid = 'public.posts'::regclass
  ) then
    alter table public.posts disable trigger posts_guard_interactive_schedule;
  end if;
end $$;

update public.posts
set interactive = jsonb_set(interactive, '{format}', '"text"')
where interactive->>'format' = 'reactions';

alter table public.posts enable trigger posts_guard_interactive_schedule;

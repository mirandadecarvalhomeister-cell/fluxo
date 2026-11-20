# VibeFluxo 2.0 — Entrega parcial (Etapas 0, 2 e 3)

## Commit base

Os 20 arquivos pendentes da rodada anterior foram commitados como `0429ba0`.

## Etapa 0 — Hotfix de segurança (aplicado em produção via CLI)

Migration `supabase/migrate_private_community_rls.sql` aplicada:

- `can_read_community()` e `can_write_community()` (SECURITY DEFINER).
- `posts_read` → `community_id is null OR can_read_community(community_id)`.
- `posts_insert` → exige `can_write_community(community_id)` (bloqueia postagem em comunidade privada por não-membro).
- Leitura de eventos, classificados, galeria, canais, membros, tópicos e RSVPs restrita pela visibilidade da comunidade.
-Índices `community_members(user_id)` e `posts(community_id, created_at desc)`.
- Correção aplicada durante a execução: `community_topics.community_id` é `uuid` (cast para `text`).
- Fotos/vídeos de comunidades privadas passam a ir para `community-private`, com `PrivateMedia.jsx` resolvendo URLs assinadas sob demanda.

Verificação: policies confirmadas no banco; helper validado com JWT real (público = `true`, inexistente = `false`).

## Etapa 2 — Interface e experiência

- `profiles.theme` (`migrate_profile_theme.sql`, aplicada) + `remote.setProfileTheme()`.
- Tema carregado do perfil no login e salvo no Supabase; **corrigido o bug que forçava tema claro quando deslogado**.
- `Skeleton.jsx` (`Skeleton`, `PostSkeleton`, `ListSkeleton`) usado no feed durante `!ready`, com CSS e `prefers-reduced-motion`.
- `errors.js` com catálogo de mensagens amigáveis, usado no gravador de voz; 5 testes novos.

## Etapa 3 — Comunidades (parcial)

- `community_announcements` + `community_announcement_reads` (`migrate_community_announcements.sql`, aplicada) com RLS por visibilidade e escrita restrita a owner/admin/moderator.
- CRUD completo de comunicados: título, corpo, imagem, prioridade, fixação, contagem de visualizações, editar e excluir — integrado na aba Comunicados, preservando os "avisos rápidos" anteriores.
- Classificados: filtros por categoria e status, alternância disponível/vendido, copiar contato e denúncias (`community_classified_reports`, aplicada) com RLS.

## Verificação final

| Comando | Resultado |
|---|---|
| `npm run build` | OK |
| `npm test` | 48/48 |
| `cd mobile && npx tsc --noEmit` | 0 erros |
| Migrations via CLI | aplicadas e verificadas em produção |

## Pendente das etapas seguintes

- Etapa 3 restante: eventos com lembretes, hierarquia de papéis no app (admin/moderator), portar galeria/eventos/classificados/comunicados/admin para o mobile.
- Etapa 4: paginação por cursor, sinais de dwell/share/save no ranking, compartilhar posts públicos de comunidade no feed, diretório de comunidades.
- Etapa 5: destaques, conquistas, posts fixados, aba Salvos no mobile, contador de seguidores autoritativo.
- Etapa 6: validação server-side de placar de Quiz/Enigmas, reputação, competições entre comunidades, ranking Arena via RPC.
- Etapa 7: rate limiting, auditoria de moderação, índices finais.
- Etapa 8: testes de RLS/permissões, testes de componentes, CI, matriz desktop/mobile.

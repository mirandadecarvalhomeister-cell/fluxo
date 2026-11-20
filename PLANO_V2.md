# VibeFluxo 2.0 — Diagnóstico técnico e plano de execução

> Documento produzido com **auditoria somente-leitura** de código e banco de produção
> (`thxfyzlyijbgoauwextw`). Nenhuma alteração estrutural foi feita antes desta aprovação.

## 1. Estado atual

| Camada | Tecnologia |
|---|---|
| Site | React 19 + Vite 8, `AppContext.jsx` (~5.2k linhas), `app.css`, 30+ componentes |
| App | Expo 58 / RN 0.88, 23 telas, 5 abas, módulos compartilhados via Metro `watchFolders` |
| Backend | Supabase Postgres 17, 40+ tabelas, Storage, Realtime, 2 Edge Functions (LiveKit), Cloudflare Pages Functions |
| Testes | `node --test`, 43 testes unitários, sem CI, sem testes de RLS/componentes |

### Funcionalidades já implementadas (preservar)

- **Feed**: 6 modos (`Fluxo`, `Ondas sociais`, `Seguindo`, `Mais recentes`, `Em alta`, `Comunidades`), motor `pulse.js` com pesos, qualidade, anti-manipulação e "ondas", preferências persistidas por usuário em `feed_preferences`.
- **Comunidades**: 10 abas (Publicações/Comunicados/Galeria/Enquetes/Eventos/Classificados/Membros/Admin etc.), chat com áudio gestual, respostas e reações (rodada anterior).
- **Perfis**: capa, avatar, bio, interesses, seguidores, grid de posts, salvos, comunidades, recados, estatísticas Arena (site).
- **Jogos**: Arena do Caos (Colyseus, servidor autoritativo), Quiz BOOM! (13×100 perguntas, rank global/amigos), NÍVEL ZERO (100 enigmas, rank global), Defesa Estelar (local).
- **Notificações**: derivadas de Realtime com dedup por ID, preferência global, notificações locais no app.
- **Mobile**: 5 abas (Início, Buscar, **Criar** central, Mensagens, Perfil), navegação por gestos, dados compartilhados via mesmo Supabase e módulos JS.

## 2. Achados críticos

### Segurança (evidências reais do banco)

| # | Achado | Evidência | Severidade |
|---|---|---|---|
| S1 | Posts de comunidades privadas legíveis por qualquer autenticado | `posts_read USING (true)` | 🔴 |
| S2 | Qualquer usuário pode postar em comunidade privada sem ser membro | `posts_insert WITH CHECK (author_id = auth.uid())` | 🔴 |
| S3 | Eventos, classificados, galeria, RSVPs, tópicos e membros de **todas** as comunidades são públicos | policies `*_read USING (true)` | 🔴 |
| S4 | Fotos/vídeos de comunidades privadas ainda vão ao bucket público `media` | `media_read USING (bucket_id='media')` | 🔴 |
| S5 | Tabelas legadas `messages` e `post_comments` convivem com `direct_messages`/`comments` | inventário do schema | 🟠 |
| S6 | Sem rate limiting, sem log de auditoria de moderação | apenas 2 Edge Functions (LiveKit) | 🟠 |
| S7 | `community_members` sem índice por `user_id`; papéis só `member`/`owner` (`is_community_mod` espera `moderator`) | inspeção de índices e dados | 🟡 |

> **Contexto**: hoje há 0 comunidades privadas (1 no total, 7 posts de comunidade). O risco é latente — precisa ser corrigido **antes** de habilitar privacidade de verdade.

### Produto / UX

| # | Achado |
|---|---|
| P1 | Tema salvo só no localStorage (`fluxo.theme`); sem coluna em `profiles`; **forçado para claro quando deslogado** |
| P2 | **Sem paginação por cursor**: `loadWorkspace` traz todos os posts em uma query (`remote.js:270-275`); ranking 100% client-side |
| P3 | Sinais de ranking ausentes: dwell time (peso 0), compartilhamento e salvamento |
| P4 | `feedScore`/`reasonFor` (`feed.js:122-155`) são código morto |
| P5 | Sem diretório de comunidades com filtro por categoria |
| P6 | Sem skeletons e sem catálogo de erros padronizado (só `Empty`/`ErrorBoundary`/`Toast`) |
| P7 | Perfil sem destaques, conquistas e posts fixados; contador `followers` não é autoritativo no banco; mobile sem aba "Salvos" |
| P8 | Quiz e Nível Zero **aceitam pontuação enviada pelo cliente** (`quizFinishRun`, `enigma_scores`) — risco de fraude |
| P9 | Quiz anuncia "+1 rodada a cada 3h" mas `quiz_round_status()` não retorna `refresh_rounds` (SQL/UI divergentes) |
| P10 | Ranking Arena calculado no cliente a partir de até 4000 linhas |
| P11 | Mobile sem galeria/eventos/classificados/tópicos/admin/notificações da comunidade; sem Arena/Enigmas/Defesa |
| P12 | Mobile com larguras fixas que podem estourar em telas estreitas; `Dimensions` capturado uma vez no load |
| P13 | Push notifications **reais ausentes** (só locais com app aberto); sem preferências por tipo |
| P14 | 20 arquivos alterados e não commitados da rodada anterior |

## 3. Plano de execução

Ordem proposta: manter as 8 etapas, mas antecipar um **hotfix de segurança** antes da Etapa 2, pois S1–S4 são pré-requisito para comunidades privadas da Etapa 3.

### Etapa 0 — Hotfix de RLS (pré-requisito)
- **Arquivos**: nova `supabase/migrate_private_community_rls.sql`; `CommunitySpace.jsx`, `AppContext.jsx`, `remote.js`.
- **Ações**: helper `can_read_community(id)` SECURITY DEFINER; reescrever `posts_read` (público OU membro/owner/mod), `posts_insert` (validar associação), policies de eventos/classificados/galeria/RSVP/tópicos/membros; fotos e vídeos de comunidades privadas → `community-private` com URL assinada (`PrivateAudio` já estabelece o padrão).
- **Testes**: consultas SQL por papel (anon, membro, não-membro) antes/depois; build + testes.

### Etapa 1 — Diagnóstico e preservação
- ✅ Concluída. Commitar os 20 arquivos pendentes como base; tirar snapshot do schema.

### Etapa 2 — Interface e experiência
- **Arquivos**: `app.css`, `Icon.jsx`, `Empty.jsx`, `Toast.jsx`, `Shell.jsx`, `ModalHost.jsx`, `remote.js`, migration `profiles.theme`.
- **Ações**: coluna `theme` em `profiles` + sincronização (corrigir o bug logged-out); design tokens de espaçamento/tipografia/z-index; componente `Skeleton`; catálogo de erros com retry; transições e feedback padronizados.
- **Testes**: build, testes, verificação visual desktop/mobile.

### Etapa 3 — Comunidades
- **Arquivos**: `CommunitySpace.jsx`, `ModalHost.jsx`, migrations.
- **Ações**: tabela de comunicados com fixar/prioridade/imagem/leituras; eventos com imagem/link/lembretes; classificados com filtros e estado `sold`; papéis hierarchy (owner/admin/mod/member) + tabela de audit log; portar galeria/eventos/classificados/tópicos/admin para o mobile.
- **Testes**: permissões por papel, CRUD, Realtime.

### Etapa 4 — Feed ↔ comunidades
- **Arquivos**: `Feed.jsx`, `lib/feed.js`, `lib/pulse.js`, `remote.js`.
- **Ações**: compartilhar post público de comunidade no feed (ação autorizada); diretório de comunidades com filtros por categoria/interesse/atividade; paginação por cursor com `created_at+id`; sinais de dwell/share/save no ranking; conectar `feedScore`/`reasonFor` ou removê-los.
- **Testes**: paginação, recomendação determinística, vazamento de posts privados.

### Etapa 5 — Perfis e descoberta
- **Arquivos**: `Profile.jsx`, `UserScreen`, `remote.js`, migrations.
- **Ações**: destaques, posts fixados, conquistas unificadas, aba "Salvos" no mobile, contagem de seguidores via trigger no banco, paridade site/app.
- **Testes**: consistência de contadores, privacidade de perfil.

### Etapa 6 — Gamificação e Arena
- **Arquivos**: `remote.js`, `server/`, migrations, `src/games/`, `mobile/`.
- **Ações**: validação server-side de placar do Quiz/Enigmas (recalcular a partir de respostas), reputação unificada, competições entre comunidades, ranking Arena via RPC/view, corrigir `refresh_rounds`, levar jogos ao mobile (ou ao menos estatísticas).
- **Testes**: submissão fraudulenta de pontuação, limites de rodada, rankings.

### Etapa 7 — Segurança e performance
- **Ações**: índices, rate limiting (Edge Function ou RPC), auditoria, revisão final de RLS, cache e lazy-loading de mídia.
- **Testes**: carga, latência, auditoria de policies.

### Etapa 8 — Testes e validação final
- **Ações**: testes de RLS/permissões no banco, testes de componentes, CI, matriz desktop/mobile/público/privado.

## 4. Decisões necessárias antes de começar

1. Commitar ou descartar os 20 arquivos pendentes da rodada anterior?
2. Aceitar o hotfix de RLS (Etapa 0) antes da Etapa 2, ou seguir estritamente 2 → 3 → 7?

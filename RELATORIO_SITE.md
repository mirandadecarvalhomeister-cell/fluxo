# Relatório — Atualização do Site Fluxo

## Fase 1 — Ajustes rápidos (concluído)

- **Balões do chat reduzidos**: padding `6px 10px 5px` → `4px 8px 3px`, raio `13px` → `11px`, max-width `76%/86%` → `68%/74%`. Ajustadas todas as redefinições em cascata do CSS (`app.css:831, 843, 1196, 1359, 1563-1565, 1329`).
- **Bolinha de não lidas azul claro**: `.ci-badge` trocada de gradiente vermelho (`#FF2D6F,#FF6B3D`) para azul (`#7DD3FC,#38BDF8`), com texto escuro e brilho azul.
- **Edição de mensagem em 10s**: `EDIT_WINDOW_MS` de 20.000 → 10.000 (`Messages.jsx:288`). A opção some do menu automaticamente após a janela.
- **Aba Jogos em Conexões**: seletor Canais/Jogos no topo. Jogos (Quiz/Arena) separados da listagem de canais.

## Fase 2 — Canais modelo YouTube (concluído)

- **Backend**: tabela `channel_subscriptions` com RLS (insert/delete só do próprio usuário), trigger atômico `sync_channel_subscribers` que atualiza `channels.followers`, índice e realtime (`supabase/migrate_channel_subscriptions.sql`).
- **Tipos de canal removidos**: `NewChannelModal` agora só pede nome e descrição; todo canal é criado como `palco`.
- **Grade de vídeos**: `ChannelVideos` em `Connections.jsx` lista os vídeos (`posts.kind='video'`) do dono do canal, com miniatura, play e métricas; clique abre o post.
- **Inscrição**: botão Inscrever-se/Inscrito no cabeçalho do canal, com persistência via `remote.setChannelSubscription`.
- **Live restrita**: `openLive` abre o modal de criação de canal quando o usuário não tem um; backend já valida `owner_id` no Edge Function `livekit-token` (403).
- Migration aplicada no banco de produção.

## Fase 3 — Comunidades renovadas (parcial)

**Entregue:**
- Tabelas (`supabase/migrate_communities_v2.sql`): `community_gallery`, `community_events`, `community_event_rsvps`, `community_classifieds`, `community_notifications`, coluna `topics.pinned`, RLS por membro/mod, realtime. Migration aplicada.
- `CommunitySpace.jsx`: navegação interna com abas Publicações, Conversas, Tópicos, Galeria, Eventos, Classificados e Administração.
  - Publicações: posts com `community_id` reaproveitando `Post.jsx`.
  - Conversas: canais vinculados existentes.
  - Tópicos: fixar/desafixar (mod/owner) via coluna `pinned`.
  - Galeria coletiva: adicionar/remover fotos e vídeos com `community_id`, autor e tema.
  - Eventos: criação, data/hora, descrição, confirmação de presença (RSVP) e remoção.
  - Classificados: categorias (venda, serviço, trabalho, parceria, outros), preço, contato, edição e remoção.
  - Administração: botão para o painel existente (`CommunityModal`).
- Integração no `ModalHost` com alternância espaço ↔ admin.
- Actions no store + funções em `remote.js` para todas as novas entidades.

**Pendente desta fase:**
- Exibir as `community_notifications` persistentes na UI de notificações (tabela criada, ainda sem consumo no painel).
- Lembretes automáticos de eventos (job/cron).
- Denúncia de anúncios e regras próprias por categoria de classificados.
- Hierarquia `admin` distinta de `owner`/`moderator` e log de ações de moderação.

## Fase 4 — Emojis, figurinhas e reações (parcial)

**Entregue:**
- Favoritos de emoji persistidos por conta (`emoji_favorites` + RLS + realtime), action `toggleEmojiFavorite`.
- `EmojiPicker` com **busca instantânea** (por nome/palavra), **favoritos** (estrelinha por emoji), categoria Favoritos e Recentes mantidos.
- **Reações em comentários no site**: botão de coração com contador, persistido em `comment_likes` (tabela que já existia no backend mas não era usada pelo site).
- **Realtime de descurtir**: `post_likes` DELETE agora decrementa contadores no feed (`unlike`).

**Pendente desta fase:**
- Animações Lottie/TGS/WebM/GIF: exigem bibliotecas e arquivos de animation externos (não há nenhum no projeto). A arquitetura atual usa Unicode + CSS puro.
- Reações animadas recebidas em mensagens (`likeMessage` do chat direto ainda é local-only; `message_reactions` atende só mensagens de canal).
- "Emojis grandes" em mensagens (exibição especial para mensagens só com emojis).
- Painel de figurinhas com formatos animados (hoje figurinhas são emoji grande ou imagem estática do storage).

## Fase 4b — Emojis animados do Noto (concluído)

- Fonte: **Google Noto Emoji Animation** (`googlefonts.github.io/noto-emoji-animation`), licenças **OFL 1.1 / Apache 2.0**. Caminho seguro (sem usar animações do Telegram).
- 16 animações Lottie baixadas do CDN do Google (`fonts.gstatic.com/s/e/notoemoji/latest/{codepoint}/lottie.json`) e servidas **localmente** em `public/emoji/` (site) e `mobile/assets/emoji/` (APK) — sem dependência externa em runtime. Total ~800 KB.
- **Site**: `lottie-web` + componente `AnimatedEmoji` com fallback Unicode, respeitando `prefers-reduced-motion`. Integrado no overlay de reação do feed (`ReactionFx`), no picker de reações (`Post`) e no painel de emojis do chat (`EmojiPicker`).
- **APK**: `lottie-react-native` + `AnimatedEmoji` integrado na `ReactionBar` (picker e emoji atual), no picker do chat e em **emojis grandes** em mensagens que contêm apenas emojis.
- Emojis sem animação disponível continuam com o Unicode normal (fallback transparente).

## Fase 5 — Animações no uso real, chat e comunidade como ambiente (concluído)

- **Cache/preload de Lottie**: `animatedEmoji.js` agora mantém cache em memória e `App.jsx` pré-carrega as 16 animações. Corrige o problema em que a animação só aparecia na tabela de emojis: no overlay de reação (~1,5 s) e nas mensagens o fetch assíncrono não terminava a tempo.
- **Emojis animados em mensagens**: novo `MessageText` em `Messages.jsx` divide o texto e renderiza `AnimatedEmoji` inline para os emojis com animação (links continuam via `TagText`).
- **Botão Encaminhar fora do balão**: removido de dentro dos anexos de foto/vídeo e posicionado ao lado do balão (`.msg-forward`), com bordas do balão mais abertas (maior largura e respiro à direita).
- **Comunidade como rota própria**: `#comunidade/<id>` vira página completa (não modal/card/painel). `openComm` navega para a rota; `openCommAdmin` abre o painel de gerenciamento. A criação de comunidade também entra direto na página.
- **`CommunitySpace` reescrito**: cabeçalho exclusivo (capa, ícone, nome, descrição, privacidade, participantes, mídias, eventos), ações conforme permissão e navegação interna lateral no desktop / abas horizontais no mobile com 10 seções: Visão geral, Conversas, Publicações, Comunicados, Galeria, Enquetes, Eventos, Classificados, Membros e Administração. Botão "Voltar ao Fluxo" integrado.
- **Integridade de dados**: corrigido o mapeamento dos tópicos para preservar `pinned` e usar `by` (autor) e `desc` (descrição) conforme o modelo real. Adicionados ícones `tag` e `chevron-right` ao `IconSprite`.
- Mantido o escopo: sem lives, Radar, busca nova nem alterações no feed principal dentro da comunidade.

## Fase 6 — Conexões estilo Twitch (concluído)

- **Live sem criar canal**: `openLive` abre o modal diretamente; `LiveModal` pede só título e categoria opcional; `startLive` reaproveita um palco próprio ou cria um automaticamente e **não insere mais mensagem fictícia** no chat.
- **Diretório de lives**: aba "Ao vivo" com grade de todas as transmissões (thumbnail, categoria, espectadores, criador), aba "Canais" com filtros (Todos/Avisos/Conversas/Palcos) e aba "Jogos".
- **Chat interativo real**: mensagens persistidas em `channel_messages` com realtime + fallback de 4,5 s, barra de emojis rápidos Noto animados e texto com `EmojiText` (emojis animados inline). O painel "Sobre" usa apenas dados reais (criador, espectadores, seguidores, mensagens, enquetes) — removida a lista falsa de "Na sala".
- **Enquetes do dono da live**: formulário de criação (modos chat/fluxo, 2–6 alternativas, duração até 24 h) e cards de voto/encerramento já existentes, mantidos e integrados ao chat da transmissão.
- **Animações na prévia do feed**: `EmojiText` aplicado ao texto dos posts e ao emoji da reação atual; picker de reações remonta ao abrir para a animação Lottie rodar no feed, não só na postagem aberta.

## Fase 7 — Comunidade como canal, conta como canal e OBS (concluído)

- **Comunidade como canal**: aba **Publicações** é a principal e traz composer com texto, **áudio gravado no navegador**, fotos e vídeos da galeria. Em comunidades abertas, qualquer pessoa pode publicar.
- Removida a aba **Conversas**; a galeria agora exibe **apenas mídias publicadas nas publicações** da comunidade (foto, vídeo e áudio).
- **Posts de comunidade fora do feed**: `Feed.jsx` filtra `communityId`; os posts permanecem em `data.posts` para alimentar o Radar.
- **Radar**: assuntos de comunidade com muitos comentários ganham peso em `buildTrending`; nova seção "Comunidades em alta" por engajamento recente; `SidePanel` também ordena por interações.
- **OBS Studio na comunidade**: administração pode iniciar/encerrar a live e abrir o modal OBS. A sala técnica é um palco interno vinculado via `community_channels`, criado automaticamente — **nenhuma migration ou Edge Function nova foi necessária**.
- **Áudio em publicações**: `mediaKind` reconhece `audio/*`, upload/persistência preservam o tipo e `Post.jsx` renderiza player de áudio.
- **Conta como canal**: removida a aba "Canais" e a lista de canais em Conexões; diretório mostra quem está ao vivo; no palco, o botão de inscrição foi trocado por "Seguir" (relacionamento entre contas).

**Verificação LiveKit (18/11)**: autorização via `lk cloud auth --user-auth` concluída. Projeto `fluxo` (`p_gqlzc8tipro`), subdomínio `fluxo-mn2zb5o7`. Secrets e Edge Functions (`livekit-token` v3, `livekit-ingress` v1) ativos; endpoint responde OK. Uso em novembro: **21 sessões, ~133 participant-minutos de 5.000** do plano Build, **0 sessões ativas** — sem sinal de limite atingido ou cobrança.

## Validação

- `npm test`: **16/16** testes passando em todas as fases.
- `npm run build`: OK em todas as fases.
- Deploy Cloudflare Pages: `fluxosocial`, último deploy `662e6850`.
- Migrations aplicadas no Supabase de produção: `migrate_channel_subscriptions.sql`, `migrate_communities_v2.sql`, `migrate_emoji_favorites.sql`.

## Commits desta rodada

`856e3cb`, `dc938d8`, `6df3410`, `f4037fa`, `c501bdd`, `17d23a1`, `f1f6758`, `6492642`, `ab3dccb`, `60a462a`, `5a5b47f`, `d9191ec`, `6d49d70`, `1a4c197`.

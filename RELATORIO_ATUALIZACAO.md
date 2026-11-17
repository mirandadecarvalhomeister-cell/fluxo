# Relatório de Atualização — App Fluxo (Etapas 1 a 5)

## 1. Corrigidos

| Item | Correção | Evidência |
|---|---|---|
| `delete_account()` quebrado em produção | Reescrita da função sem tabelas fantasma (`post_comments`, `community_topics`, `messages`) e com limpeza de quiz, reações, relatos, convites e agora `comment_likes`. Migration `supabase/migrate_fix_delete_account.sql` aplicada. | Verificação no banco: `delete_account_status = OK_COM_LIKES`. |
| Reações sem tempo real e sem barra discreta | Realtime de `post_likes` reescrito para atualizar `reactionCounts` por emoji com deduplicação; nova `ReactionBar` com haptics e animação em feed, Clips e PostScreen. | Typecheck 0 erros; build release OK. |
| Volume do Clips sempre visível | Botão aparece ao tocar e some após ~2,8s com fade. | Build release OK. |
| Vídeo no feed era apenas um placeholder | Player inline real (`FeedVideo`) com autoplay quando visível, pausa ao sair da tela/background e no máximo 1 vídeo ativo por vez. | Build release OK. |
| Sheet de comentários só arrastável pela alça | Gesto estendido ao cabeçalho inteiro, com expandir/fechar e rolagem da lista preservada. | Typecheck 0 erros. |
| Grade do perfil carregava só 60 posts fixos | `fetchUserPosts` paginado com `range`; `ProfileScreen` e `UserScreen` com `FlatList` 3 colunas + `onEndReached`. | Typecheck 0 erros. |
| Navegação sem gestos e barra inferior grande | Swipe da borda para voltar/trocar aba, transições slide+fade e barra reduzida. | Typecheck 0 erros. |
| **Erro "Algo saiu do fluxo" ao abrir Conexões no site** | O app criava canais com `kind: 'live'`, mas o site só conhecia `avisos`/`conversa`/`palco` em `KINDS` — `KINDS['live'][0]` lançava TypeError. Corrigido em 3 camadas: app passou a gravar `kind: 'palco'`; `KINDS` do site ganhou o alias `live`; `Connections.jsx` usa fallback `KINDS[kind] || KINDS.conversa`. Canal existente normalizado no banco. | 16/16 testes; build OK; deploy Cloudflare; `index-sIhCxIJl.js` no ar. |
| **Vídeos não reproduziam no APK** | `FeedVideo` usava source em objeto (`{uri}`) e `visibleRef` sem re-render (race com `onViewableItemsChanged`). Migrado para source string (padrão que funciona no Clips), visibilidade com `useState`, `statusChange` para fallback e botão de retry/abrir Clips. | Typecheck 0 erros. |
| **Tabela de emojis aparecia sempre no feed** | `ReactionBar` reescrita: só coração; picker aparece apenas ao segurar e some sozinho; curtir/descurtir alterna ❤️. | Typecheck 0 erros. |
| **Posts com texto longo ficavam pequenos** | Texto limitado a 3 linhas com botão **Ler mais/Ler menos**; mídia mantém tamanho generoso. | Typecheck 0 erros. |
| **Menu dos 3 pontinhos incompleto** | Agora replica o site: dono (editar, ativar/desativar comentários, compartilhar, copiar link, excluir) e terceiros (não tenho interesse, mostrar menos, silenciar assunto, ocultar perfil, deixar de seguir, compartilhar, copiar link, salvar, denunciar). Filtros locais persistem em `Preferences`. | Typecheck 0 erros. |
| **Botão AO VIVO iniciava transmissão direto** | Movido para dentro de Criar; abre a câmera, mostra prévia e só inicia a live ao tocar **Iniciar live**. | Typecheck 0 erros. |

## 2. Novos recursos (integrados ao backend)

- **Áudio no chat com storage real**: botão de microfone (segure para gravar, solte para enviar), bucket `audio` (público, 5 MB) com RLS por prefixo `auth.uid()`, `attachment.kind = 'audio'` com URL real, player inline e preview `🎤 Áudio · Xs` na lista de conversas. Migrations `migrate_audio_bucket.sql` aplicada.
- **Respostas e curtidas em comentários**: `comments.parent_id` (cascade), tabela `comment_likes` com RLS e realtime, respostas aninhadas e botão de curtir com haptics. Migration `migrate_comment_replies.sql` aplicada.
- **Modos do feed**: "Para você" e "Seguindo" com paginação real (`fetchFollowingPage`).
- **Rascunhos locais**: editor salva texto, formato, opções, convites e mídia no AsyncStorage; restaura ao abrir, autosave e botão de descarte.
- **Comunidades no mobile**: lista real do backend, entrar/sair com escrita em `community_members`, feed da comunidade paginado, capa/ícone/contagem de membros. Entrada pelo botão "Comunidades" em Explorar.
- **Aba JOGOS no topo** do feed abrindo o Quiz BOOM! existente.
- **Fluxo de criação reformulado**: aba Criar abre direto na **câmera** (capturar foto, gravar vídeo segurando, trocar câmera, galeria); etapa de seleção com **+ para adicionar mais mídia** e **Avançar**; etapa de personalização com prévia temática, **6 estilos de cor**, escolha de capa e rodapé exclusivo com **Ao vivo / Enquete / Clips / Votação**, cada um com personalização própria (título da live, alternativas coloridas, estilos de clipe, legendas por imagem). Rodapé do app oculto nessa tela. Rascunho local preservado.
- **Lives com LiveKit nativo (mesmo fluxo do site)** — `registerGlobals()` no entry point, token via Edge Function `livekit-token` com `role: host/viewer`, transmissão de câmera/microfone do celular, reprodução dos tracks remotos, controles de cam/mic/trocar câmera/sair, contagem de espectadores, corações com haptics, prévia da câmera para o anfitrião e chat em tempo real. A transmissão agora começa em **Criar → Ao vivo → Abrir câmera → Iniciar live**; aba **Lives** no Explorar para assistir. Canal marcado offline ao encerrar.
- **Realtime cobre agora `comment_likes`** além das 10 tabelas anteriores.

## 3. Pendências de backend

- **Gravação de lives** (salvar a transmissão como vídeo): deliberadamente adiada por decisão do usuário (depende de Egress LiveKit + storage + custo por minuto). **Transmissão e reprodução ao vivo já estão implementadas** e não dependem de Egress.
- **Realtime ainda não coberto no mobile para**: `communities`, `quiz_*`, jogos/arena e `message_reactions`. As telas funcionam com carregamento sob demanda; não há atualização automática nestes pontos.
- **Criação de comunidades pelo app**: o mobile consome, entra e sai; a criação continua disponível apenas no site.
- **Postar dentro de uma comunidade pelo app**: o feed da comunidade é somente leitura; a publicação com `community_id` existe no site.

## 4. Integração

- Nenhuma funcionalidade existente foi removida. Autenticação, perfis, publicações, mensagens, quiz, lives e Clips permanecem intactos.
- Todos os botões novos têm ação real — nenhum decorativo.
- Nenhum dado fictício foi introduzido: listas, contagens e mídias vêm do Supabase.
- Site mantido inalterado nesta rodada; já publicado via Cloudflare Pages (`fluxosocial`), inclusive `functions/og.js` e `functions/convite.js`.

## 5. Testes

- `npx tsc --noEmit` executado após cada etapa — **0 erros** ao final.
- `assembleRelease` executado — **BUILD SUCCESSFUL**.
- Backend verificado por SQL remoto:
  - `delete_account` sem tabelas fantasma e com limpeza de `comment_likes`.
  - `comments.parent_id` presente; `comment_likes` presente com RLS ativo.
  - Buckets `media` e `audio` públicos; 4 policies `audio_*` ativas.
  - `supabase_realtime` contém `comments`, `comment_likes` e `post_likes`.
  - `quiz_refresh_rounds()` coerente com a hora UTC (0 às 01:13 UTC; volta a 1 às 03:00 UTC).
  - RLS ativo em `comments`, `comment_likes`, `communities` e `community_members`.
- 15 commits enviados para `main`: `2df1d8d`, `1076e4f`, `5919eb3`, `9197e1d`, `58ebf00`, `72c8462`, `917aa4c`, `bc50f32`, `79009d5`, `5ece899`, `32b85e9`, `c771927`, `37f95b4`, `5f8bb93`, `5b8b1ad`.

## 6. Problemas e limitações conhecidos

- O rascunho salva URIs locais de mídia; após reiniciar o app ou limpar o cache, a mídia pode precisar ser readicionada (texto, formato e opções são restaurados normalmente).
- Bucket de áudio limitado a 5 MB por arquivo — suficiente para mensagens de voz curtas.
- Reações em tempo real dependem do canal Supabase; se o realtime cair, a contagem atualiza localmente e sincroniza no próximo evento.

## 7. APK

Artefato release: `C:\fm\android\app\build\outputs\apk\release\app-release.apk`

- Build final: **BUILD SUCCESSFUL em 2m24s** (775 tarefas: 23 executadas, 752 up-to-date); bundle Metro com **1156 módulos** (antes 900).
- Tamanho: **129.824.799 bytes** (~124 MB), gerado em 16/11/2026 às 22:45.
- Inclui `expo-audio` (config plugin + permissões `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`) e o **LiveKit nativo** (`registerGlobals()`, `livekit-client`, `@livekit/react-native`, WebRTC) — acréscimo de ~1,7 MB em relação ao APK anterior.
- `npx tsc --noEmit` final: **0 erros** (inclusive após a integração LiveKit nativa).
- **Testes visuais reais no emulador Android (AVD `Medium_Phone_API_37.0`, API 37)**: APK instalado via ADB, login efetuado, telas validadas por screenshot + `logcat` (sem crashes do app).
  - Feed carrega; vídeo inline **tocando de fato** (96% dos pixels da área mudaram em 5s).
  - Menu dos 3 pontinhos exibe as 9 opções do site (confirmado por screenshot).
  - Texto longo com **Ler mais** visível.
  - Criar abre a **câmera real** (permissão concedida no emulador) e **a barra inferior fica oculta** nas telas de criação.
  - Galeria → seleção com **+ / Avançar** → personalização com 6 estilos e rodapé **Ao vivo / Enquete / Clips / Votação** (painel de Enquete conferido).
  - **Ao vivo** abre a câmera e **não inicia a transmissão**; botão **Iniciar live** presente.
  - Tabela de reações **oculta por padrão** e visível **apenas ao segurar** o coração (via `motionevent DOWN/UP`), sumindo ao soltar.
  - Câmera de criação com **seletor de tipo de postagem na primeira tela** e botão **Avançar no topo**; barra inferior oculta.
  - Chat: barra de digitar maior, **botão enviar vinculado ao gravador de áudio** (ícone muda para microfone quando não há texto), e **menu de anexos** com Galeria, Câmera, Documentos e Localização (confirmado por screenshot).
- A transmissão real via LiveKit depende do servidor ativo; a lógica espelha exatamente o `LiveStage.jsx` do site.

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

## 2. Novos recursos (integrados ao backend)

- **Áudio no chat com storage real**: botão de microfone (segure para gravar, solte para enviar), bucket `audio` (público, 5 MB) com RLS por prefixo `auth.uid()`, `attachment.kind = 'audio'` com URL real, player inline e preview `🎤 Áudio · Xs` na lista de conversas. Migrations `migrate_audio_bucket.sql` aplicada.
- **Respostas e curtidas em comentários**: `comments.parent_id` (cascade), tabela `comment_likes` com RLS e realtime, respostas aninhadas e botão de curtir com haptics. Migration `migrate_comment_replies.sql` aplicada.
- **Modos do feed**: "Para você" e "Seguindo" com paginação real (`fetchFollowingPage`).
- **Rascunhos locais**: editor salva texto, formato, opções, convites e mídia no AsyncStorage; restaura ao abrir, autosave e botão de descarte.
- **Comunidades no mobile**: lista real do backend, entrar/sair com escrita em `community_members`, feed da comunidade paginado, capa/ícone/contagem de membros. Entrada pelo botão "Comunidades" em Explorar.
- **Aba JOGOS no topo** do feed abrindo o Quiz BOOM! existente.
- **Realtime cobre agora `comment_likes`** além das 10 tabelas anteriores.

## 3. Pendências de backend

- **Gravação de lives**: deliberadamente adiada por decisão do usuário (depende de Egress LiveKit + storage + custo por minuto).
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
- 9 commits enviados para `main`: `2df1d8d`, `1076e4f`, `5919eb3`, `9197e1d`, `58ebf00`, `72c8462`, `917aa4c`, `bc50f32`, `79009d5`.

## 6. Problemas e limitações conhecidos

- O rascunho salva URIs locais de mídia; após reiniciar o app ou limpar o cache, a mídia pode precisar ser readicionada (texto, formato e opções são restaurados normalmente).
- Bucket de áudio limitado a 5 MB por arquivo — suficiente para mensagens de voz curtas.
- Reações em tempo real dependem do canal Supabase; se o realtime cair, a contagem atualiza localmente e sincroniza no próximo evento.

## 7. APK

Artefato release: `C:\fm\android\app\build\outputs\apk\release\app-release.apk`

# Relatório — Reestruturação de Publicações, Chats e Áudio das Comunidades

## Diagnóstico (antes das alterações)

- **Chat direto** (`src/components/Messages.jsx`): gravação com `MediaRecorder` própria; arrastar **para cima cancelava** (ao contrário do requisito de cadeado); soltar enviava automaticamente; player sem onda, sem velocidade e sem reprodução exclusiva; anexos aceitavam **um único arquivo**; mídia ia como data URL dentro de `direct_messages.attachment`.
- **Chat da comunidade** (`src/components/CommunitySpace.jsx`): gravação por **toque** (inicia/parar e envia sozinha), player nativo `<audio controls>`, sem respostas nem reações; galeria só foto/vídeo.
- **Mobile** (`mobile/src/screens/ChatScreen.tsx`): push-to-talk com `expo-audio`, envio automático ao soltar, sem cadeado e sem prévia.
- **Backend**: bucket `audio` público (5 MB) existente mas usado só pelo mobile; `message_reactions` sem Realtime; `community_notifications` carregada mas nunca exibida; `comments.parent_id` já disponível.

## Entregue nesta rodada

### 1. Máquina de estados pura e testável
- `src/lib/voiceRecording.js`: estados `IDLE`, `RECORDING`, `CANCEL_PENDING`, `LOCKED_RECORDING`, `REVIEW`, `UPLOADING`, `SENT`, `ERROR`; token de sessão para ignorar eventos assíncronos antigos; prioridade do cadeado em gestos diagonais; retorno do dedo desiste do cancelamento; envio só via `SEND` em `REVIEW`.
- `tests/voice-recording.test.js`: **21 cenários**. `npm test`: **43/43** passando.

### 2. Gravador gestual (site e app)
- `src/components/VoiceRecorder.jsx` (site) e `mobile/src/components/VoiceRecorderSheet.tsx` (app), ambos usando a **mesma** máquina de estados.
- Pressionar e segurar: cronômetro, ondas com `AnalyserNode` no site, destinos de cancelamento (lixeira) e bloqueio (cadeado) com feedback visual e vibração.
- Arrastar à esquerda → `CANCEL_PENDING`; soltar descarta; voltar o dedo desiste.
- Arrastar para cima → `LOCKED_RECORDING`; soltar o dedo **não** interrompe; painel com parar/excluir.
- Prévia obrigatória: reproduzir/pausar, avançar/retroceder 5 s, 1x/1,5x/2x, onda, duração, apagar, regravar e **enviar só por clique explícito**.
- Pointer Events com captura, `touch-action: none`, limpeza de microfone em cancelamento, desmontagem, perda de foco e `pagehide`; limite de duração e de tamanho; erro recuperável com retry.

### 3. Player de áudio profissional e compartilhado
- `src/components/AudioPlayer.jsx` (site) e `AudioBubble.tsx` ampliado (app): onda com progresso, tempo atual/duração, remetente, ±5 s, velocidades e registro global `audioPlayback` / `audioPlayback.ts` evitando reprodução simultânea.
- Integrado em mensagens diretas, chat da comunidade e publicações (`Post.jsx`).

### 4. Armazenamento real
- `remote.uploadAudio` no site (bucket `audio`, caminho `<uid>/<ts>-<rand>.<ext>`, mesmo contrato do mobile).
- `remote.uploadCommunityAudio` + `remote.createSignedMediaUrl`: comunidades **abertas** usam o bucket público `audio`; comunidades **privadas** usam `community-private` e são lidas por **URL assinada de 1h**, renovada automaticamente em caso de erro (`src/components/PrivateAudio.jsx`, integrado em chat, galeria e `Post.jsx`).
- `actions.sendChatAudio` e `sendCommunityAudio(communityId, blob, meta)` com duração e ondas no attachment; fallback para data URL sem sessão.

### 5. Chat e comunidades
- Separadores dinâmicos por data (Hoje/Ontem/data) no chat direto.
- Envio múltiplo de fotos/vídeos com prévia, remoção, legenda, status por arquivo e retry (`sendChatMedia`).
- Chat da comunidade: reações com `post_likes`, respostas encadeadas via `comments.parent_id`, exibição de comentários.
- Galeria com categorias Todos/Fotos/Vídeos/Áudios/Arquivos e botão "Ver original".
- Notificações persistentes `community_notifications` exibidas no painel do sino, com marcação de lida.

### 6. Segurança/backend (aplicado em produção via CLI)
- Acesso via `supabase db query --remote` ao projeto vinculado `thxfyzlyijbgoauwextw`.
- **Descoberta**: o bucket `audio` não existia em produção (havia só `avatars`, `covers`, `media`) — o envio de áudio falhava silenciosamente. Apliquei `supabase/migrate_audio_bucket.sql`.
- Apliquei `supabase/migrate_secure_community_media.sql`: bucket privado `community-private` com policy de leitura restrita a membros/owner; `message_reactions` no Realtime; colunas opcionais `reply_to`, `pinned`, `duration`, `waves` em `direct_messages`.
- Verificação após aplicação: `audio` (público, 5 MB), `community-private` (privado, 5 MB), `message_reactions` no `supabase_realtime`, função `can_read_community_private_media` e as 4 colunas presentes em `direct_messages`.
- Correção aplicada: as policies originally usavam `split_part(name,'/',3)` para o usuário e `2` para a comunidade — **posições trocadas**. Ajustado para `<community_id>/<user_id>/<arquivo>` (partes 1 e 2) e reaplicado.
- Validação funcional da policy com JWT de um membro real: `membro_pode = true`, `outro_nao_pode = false`.
- Grant de execução estendido a `authenticated`, `service_role` e `postgres` (o papel `supabase_read_only_user` do `--read-only` não executa a função).

## Validação

- `npm run build`: OK.
- `npm test`: 43/43.
- `cd mobile && npx tsc --noEmit`: 0 erros.
- Nenhuma funcionalidade existente removida; nenhum dado alterado; componentes novos são aditivos e as duas implementações duplicadas de áudio foram substituídas pelas novas.

## Pendente (próximas iterações)

- Mídias privadas antigas que já estejam no bucket público `audio` precisam ser migradas manualmente para `community-private` (não alterei dados existentes sem necessidade).
- Reações de mensagens diretas persistidas/consumidas via Realtime no cliente (tabela e publicação já prontas).
- Fixação de mensagens, indicadores de falha de envio e carregamento progressivo do histórico no chat direto.
- Notificações push (browser/mobile) para novos eventos de comunidade.
- Uploads com barra de progresso real em bytes (Supabase Storage via resumable upload) — hoje o progresso é por arquivo.

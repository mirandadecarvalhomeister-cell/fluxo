# Fluxo Mobile (Android / Expo)

Aplicativo nativo do Fluxo para Android, construído com Expo SDK 58 + React Native.
Usa **a mesma conta, banco e Storage do site** (Supabase), portanto publicações,
mensagens, reações, seguidores, lives e o Quiz BOOM são compartilhados entre web e app.

- Sem WebView: toda a interface é nativa (React Native).
- Navegação própria com 5 abas: **Início, Explorar, Criar (+), Mensagens, Perfil**.
- Player vertical tela cheia estilo TikTok (`expo-video`), com vídeo por baixo das
  barras do sistema e overlays respeitando as safe areas.
- Sessão persistida em `AsyncStorage` (continua logado até sair).
- Modo economia de dados, autoplay/som configuráveis, compartilhamento nativo,
  câmera/galeria, notificações locais e botão voltar do Android.

---

## 1. Requisitos

| Ferramenta | Versão |
| --- | --- |
| Node.js | 20 LTS ou superior |
| npm | 10+ |
| JDK | **17** (Temurin/Microsoft OpenJDK) |
| Android SDK | Platform 36, Build-Tools 36.0.0, Platform-Tools |
| Android Studio | opcional (útil para emulador e SDK Manager) |

Variáveis de ambiente esperadas para build local:

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17..."
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
```

O SDK em `%LOCALAPPDATA%\Android\Sdk` já possui `platforms/android-36`
(o projeto também aceita `android-37.0`) e `build-tools/36.0.0`.

---

## 2. Instalação

```powershell
cd mobile
npm install
Copy-Item .env.example .env
```

Preencha o `.env`:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_SUA_CHAVE
EXPO_PUBLIC_LIVEKIT_URL=wss://SEU-LIVEKIT.livekit.cloud
EXPO_PUBLIC_PUBLIC_WEB_URL=https://vibefluxo.com
```

> Use somente a chave **anon/publishable**. A `service_role` nunca deve ir para o app.
> Variáveis `EXPO_PUBLIC_*` são embutidas no bundle: reinicie o Metro após alterá-las.

---

## 3. Banco, Storage e Realtime (Supabase)

Rode as migrações no SQL Editor do projeto **na ordem** (uma vez cada). As
principais para o app são:

| Arquivo | Conteúdo |
| --- | --- |
| `supabase/schema.sql` | tabelas base, bucket `media` e políticas |
| `supabase/migrate_posts_dm.sql` | posts, mídia e mensagens diretas |
| `supabase/migrate_reactions.sql` | reações e salvos |
| `supabase/migrate_mentions.sql` | menções |
| `supabase/migrate_notifications.sql` | notificações |
| `supabase/migrate_interactive.sql` | enquetes/interações |
| `supabase/migrate_scheduled_interactions.sql` | interações agendadas |
| `supabase/migrate_communities.sql` | comunidades |
| `supabase/migrate_arena.sql` | arena |
| `supabase/migrate_messages.sql` | conversas |
| `supabase/migrate_chat_edit.sql` | `edited_at` + RPC `edit_direct_message` |
| `supabase/migrate_livekit*.sql` | canais/lives e ingress |
| `supabase/migrate_live_polls.sql` | enquetes de live |
| `supabase/migrate_realtime_live.sql` | realtime de canais e chat da live |
| `supabase/migrate_quiz_boom.sql` | quiz: runs, medalhas, convites, desafios, rankings |
| `supabase/migrate_delete_account.sql` | RPC `delete_account` |

O bucket **`media`** deve ser público (o `schema.sql` já cria). O app envia arquivos
para `media/<user_id>/...` e usa a URL pública para exibir.

Realtime necessário:
- `direct_messages` (edição/entrega de mensagens) — `migrate_chat_edit.sql`
- `channels` e `channel_messages` — `migrate_realtime_live.sql`
- notificações/reações conforme as migrações correspondentes

### Edge Functions

```powershell
supabase functions deploy livekit-token
supabase functions deploy livekit-ingress
supabase secrets set LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... LIVEKIT_URL=...
```

`livekit-token` valida o JWT do Supabase e devolve o token da sala; o app o usa
para entrar no chat da live (o vídeo nativo da live ainda não está implementado —
ver Limitações).

### Autenticação

No painel Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://vibefluxo.com`
- **Redirect URLs:**
  - `https://vibefluxo.com/**`
  - `https://SEU-DOMINIO-DE-DEPLOY/**` (preview/Netlify/Vercel)
  - `fluxo://**`
  - `fluxo://redefinir-senha`

A confirmação de e-mail e a redefinição de senha são concluídas no site. O app
abre o link, mas o fluxo de recuperação de senha no app ainda não consome o
`access_token` do deep link (ver Limitações).

---

## 4. Rodar em desenvolvimento

```powershell
npm start            # Metro com expo-dev-client
npm run start:go     # Metro sem dev-client (Expo Go, limitado)
npm run android      # compila e instala no emulador/aparelho via Gradle
```

Atalhos: `a` abre no Android, `r` recarrega, `m` abre o menu.

O `metro.config.js` inclui `../src` em `watchFolders` para reutilizar os bancos
de perguntas do Quiz BOOM do site (`src/games/quiz/bank.js`). Mantenha a pasta
web ao lado de `mobile/` ao desenvolver/buildar.

---

## 5. Deep links e App Links

Esquema próprio:

```text
fluxo://post/<id>
fluxo://perfil/<userId>
fluxo://mensagens
fluxo://live/<channelId>
fluxo://redefinir-senha
```

Links universais (web → app):

```text
https://vibefluxo.com/#feed/post/<id>
https://vibefluxo.com/#perfil/<userId>
https://vibefluxo.com/#conexoes/quiz?desafio=<id>
https://vibefluxo.com/#convite=<id>
```

O `app.json` já declara os intent filters `https://vibefluxo.com` e
`https://www.vibefluxo.com` com `autoVerify`.

### Verificação automática (obrigatório para abrir sem seletor)

1. Gere o SHA-256 da chave de assinatura:

   ```powershell
   keytool -list -v -keystore MEU_KEYSTORE.keystore -alias fluxo
   ```

2. Publique `https://vibefluxo.com/.well-known/assetlinks.json`:

   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "app.fluxo.mobile",
       "sha256_cert_fingerprints": ["AA:BB:..."]
     }
   }]
   ```

   Inclua também a impressão digital da chave de debug se quiser testar em debug.
   O arquivo precisa ser servido com `Content-Type: application/json` e sem redirect.

3. Teste:

   ```powershell
   adb shell pm verify-app-links --re-verify app.fluxo.mobile
   adb shell pm get-app-links app.fluxo.mobile
   ```

---

## 6. Gerar APK de debug

Requer JDK 17 + Android SDK configurados.

```powershell
cd mobile
npx expo prebuild --platform android --clean
npm run apk:debug
```

Saída: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`

Instalar:

```powershell
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

O APK de debug usa a keystore de debug do `~/.android` e não serve para a Play Store.

---

## 7. Build de release (APK/AAB) e assinatura

### 7.1 Criar a keystore

```powershell
keytool -genkeypair -v -storetype PKCS12 `
  -keystore fluxo-release.keystore -alias fluxo `
  -keyalg RSA -keysize 2048 -validity 10000
```

Guarde a keystore e as senhas fora do repositório.

### 7.2 Configurar `android/gradle.properties` (não versionar)

Após o `prebuild`, crie/edite `mobile/android/gradle.properties` (ou
`~/.gradle/gradle.properties`) com:

```properties
FLUXO_UPLOAD_STORE_FILE=C:/caminho/absoluto/fluxo-release.keystore
FLUXO_UPLOAD_STORE_PASSWORD=...
FLUXO_UPLOAD_KEY_ALIAS=fluxo
FLUXO_UPLOAD_KEY_PASSWORD=...
```

E em `mobile/android/app/build.gradle`, no bloco `android { signingConfigs { ... } }`:

```gradle
signingConfigs {
    release {
        storeFile file(FLUXO_UPLOAD_STORE_FILE)
        storePassword FLUXO_UPLOAD_STORE_PASSWORD
        keyAlias FLUXO_UPLOAD_KEY_ALIAS
        keyPassword FLUXO_UPLOAD_KEY_PASSWORD
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        // ...
    }
}
```

> O `prebuild --clean` recria `android/`, então mantenha essas mudanças em um
> config plugin ou reaplique após cada prebuild. O jeito mais seguro é usar EAS.

### 7.3 Gerar

```powershell
npm run apk:release      # APK sideload
npm run bundle:release   # AAB para Play Store
```

Saídas:
- `mobile/android/app/build/outputs/apk/release/app-release.apk`
- `mobile/android/app/build/outputs/bundle/release/app-release.aab`

### 7.4 EAS Build (recomendado para release)

```powershell
npm i -g eas-cli
eas login
eas build --platform android --profile preview      # APK interno
eas build --platform android --profile production   # AAB Play Store
```

`eas.json` já define os perfis `development`, `preview` (APK) e `production`
(AAB com incremento automático de versão). O EAS gerencia a keystore.

---

## 8. Play Store — checklist

- [ ] `versionCode` maior que o anterior (`app.json` ou `autoIncrement` do EAS).
- [ ] AAB assinado com a keystore definitiva (guarde o fingerprint para o `assetlinks.json`).
- [ ] Política de privacidade publicada.
- [ ] Formulário de segurança de dados (coleta de e-mail, fotos, vídeos, mensagens).
- [ ] Permissões justificadas: câmera, microfone, fotos/vídeos, notificações.
- [ ] Conta de teste com credenciais para a revisão.
- [ ] Declaração de "app de redes sociais" e moderação de conteúdo/UGC.
- [ ] Target SDK conforme exigência atual do Google Play (o Expo SDK 58 já usa API recente).
- [ ] Testar em aparelho real: login persistente, upload, push local, deep links.

---

## 9. Estrutura do app

```text
mobile/
  App.tsx                    # providers, status bar, shell
  src/
    context/AppContext.tsx   # sessão, dados, navegação, realtime, deep links
    navigation/AppShell.tsx  # tabs + pilha de telas
    lib/api.ts               # camada Supabase (posts, DMs, quiz, uploads, lives)
    lib/supabase.ts          # cliente com AsyncStorage e PKCE
    lib/links.ts             # parser de deep links
    lib/share.ts             # compartilhamento nativo e links públicos
    lib/media.ts             # mídia, orientação e previews
    lib/notifications.ts     # permissão + notificações locais
    quiz/                    # regras do Quiz BOOM (espelho do site)
    screens/                 # Auth, Home, Explore, Create, Messages, Chat,
                             # Profile, User, Reels, Post, Comments, Live, Quiz…
    components/              # UI nativa compartilhada
```

Fluxo de dados: telas → `AppContext.actions` → `lib/api.ts` → Supabase.
O app assina canais Realtime para mensagens e live; o feed usa paginação por offset.

### Quiz BOOM

- Modos **Clássico** (15 s por pergunta) e **Insano** (um cronômetro total:
  `max(45s, 8s × perguntas)`).
- Combos com nomes e multiplicador até x7; erro zera o combo.
- Medalha ao acertar 100% da categoria + compartilhamento da conquista.
- 3 rodadas grátis por semana; convite concede +3 rodadas para convidante e convidado.
- Ranking semanal global e ranking só de amigos (quem você segue).

Regras replicadas em `src/quiz/quizData.ts` (offline/fallback local) e no site em
`src/games/quiz/quizData.js`. As RPCs de servidor ficam em
`supabase/migrate_quiz_boom.sql`.

---

## 10. Limitações conhecidas (honestas)

1. **Vídeo de live não é renderizado no app.** O chat da live, enquetes e canais
   funcionam de verdade via Supabase/LiveKit token, mas o componente de vídeo
   nativo do LiveKit não foi integrado. A tela informa isso ao usuário.
2. **Confirmação de e-mail e redefinição de senha** acontecem no site. O app trata
   o link de confirmação/entrada, mas ainda não troca o `code` de recuperação de
   senha por uma nova senha dentro do app.
3. **Notificações são locais** (geradas enquanto o app está aberto/ativo). Push
   remoto exige FCM + `expo-notifications` com credenciais no EAS/Supabase Edge Function.
4. **App Links** só abrem direto no app depois de publicar o `assetlinks.json`
   com o SHA-256 correto. Sem isso, o Android mostra o seletor.
5. **iOS** não está configurado neste projeto (apenas Android).
6. O APK local exige JDK 17; sem ele use EAS Build na nuvem.

---

## 11. Solução de problemas

| Sintoma | Correção |
| --- | --- |
| `Cannot find module 'babel-preset-expo'` | `npm i -D babel-preset-expo@~58.0.25` |
| `EXPO_PUBLIC_*` vazio no app | reinicie o Metro com cache limpo: `npx expo start -c` |
| Gradle falha com versão de Java | instale JDK 17 e aponte `JAVA_HOME` |
| `SDK location not found` | defina `ANDROID_HOME` ou crie `android/local.properties` com `sdk.dir=...` |
| Deep link abre o navegador | publique `assetlinks.json` e re-verifique com `adb` |
| Upload falha | confirme bucket `media` público e políticas de Storage |
| Quiz não sincroniza | rode `migrate_quiz_boom.sql` e verifique as RPCs no Supabase |
| Mensagem editada não atualiza | rode `migrate_chat_edit.sql` (Realtime em `direct_messages`) |

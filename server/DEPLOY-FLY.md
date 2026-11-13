# Deploy da Arena do Caos no Fly.io

Servidor Colyseus da Arena hospedado no **Fly.io**, região **GRU (São Paulo)**.
HTTPS/WSS são automáticos (`https://fluxo-arena.fly.dev`) — não precisa de
domínio próprio, Caddy nem abrir portas.

> Para hospedar na Oracle Cloud (Always Free), veja `DEPLOY.md`.

## Arquitetura

```
Navegador (FluXo, https://fluxosocial.netlify.app)
        │  wss://fluxo-arena.fly.dev  (WebSocket seguro)
        ▼
   Fly.io proxy ──► Node/Colyseus 0.0.0.0:2567
        │
        └──► Supabase (auth + resultados das partidas)
```

> Como o FluXo roda em HTTPS, o jogo exige **`wss://`**. O proxy do Fly.io cuida
> do certificado TLS e do upgrade de WebSocket automaticamente.

## Arquivos

- `server/Dockerfile` — imagem Node 22 (o Colyseus 0.18 exige Node ≥ 22).
- `server/fly.toml` — região `gru`, `http_service` na porta 2567, sem dormir.
- `server/.dockerignore`

## Pré-requisitos

- Conta no Fly.io (com cartão) e `flyctl` instalado.
- Chaves do Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
  `SUPABASE_SERVICE_ROLE_KEY` (a service_role é secreta).

## Passo 1 — Autenticar

```bash
fly auth login
```

## Passo 2 — Criar o app

```bash
cd server
fly apps create fluxo-arena --org personal
```

## Passo 3 — Definir os secrets

```bash
fly secrets set \
  SUPABASE_URL=https://SEU-PROJETO.supabase.co \
  SUPABASE_ANON_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  ARENA_ALLOWED_ORIGIN=https://fluxosocial.netlify.app \
  -a fluxo-arena
```

## Passo 4 — Deploy

```bash
cd server
fly deploy -a fluxo-arena --ha=false
```

## Passo 5 — Testar

```bash
curl https://fluxo-arena.fly.dev/health
# esperado: {"ok":true,"game":"arena-do-caos","now":...}

curl https://fluxo-arena.fly.dev/arena/rooms
# esperado: {"rooms":[]}
```

## Passo 6 — Cliente (FluXo)

No `.env` local e nas variáveis de ambiente do Netlify:

```env
VITE_ARENA_URL=wss://fluxo-arena.fly.dev
VITE_ARENA_HTTP_URL=https://fluxo-arena.fly.dev
```

Como o Vite embute essas variáveis no build, é preciso **rebuild/deploy do site**
depois de alterá-las.

## Manutenção

```bash
fly logs -a fluxo-arena        # logs ao vivo
fly status -a fluxo-arena      # estado da máquina
fly deploy -a fluxo-arena      # publicar mudanças
fly secrets set ARENA_ALLOWED_ORIGIN=https://novo-dominio -a fluxo-arena
```

## Custos

- **Fly.io:** máquina `shared-cpu-1x` / 512 MB sempre ligada (alguns dólares/mês).
- **Supabase Free:** R$ 0.

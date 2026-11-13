# Deploy da Arena do Caos na Oracle Cloud (Always Free)

Guia para colocar o servidor Colyseus no ar numa VM **Ampere A1 (ARM) Always Free**,
com **HTTPS/WSS** na frente via Caddy. O servidor da Arena é um processo Node
sempre ligado; o Caddy cuida do certificado e do upgrade de WebSocket.

## Arquitetura

```
Navegador (FluXo, https://)
        │  wss://arena.seudominio.com  (WebSocket seguro)
        ▼
   Caddy :443  ──proxy──►  Node/Colyseus 127.0.0.1:2567
        ▲                         │
        │  HTTPS (Let's Encrypt)  └──► Supabase (auth + resultados)
        └── portas 80/443 públicas
```

> **Importante:** como o FluXo roda em HTTPS, o jogo precisa de **`wss://`**.
> Navegador bloqueia `ws://` (inseguro) em página HTTPS. Por isso o Caddy + domínio.

## O que você precisa ter

- Conta na **Oracle Cloud** (Always Free).
- **Domínio ou subdomínio** para a Arena (ex.: `arena.seudominio.com`).
  Sem domínio? Veja "Alternativas sem domínio" no fim.
- As chaves do Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
  `SUPABASE_SERVICE_ROLE_KEY` (as mesmas do projeto FluXo).

---

## Passo 1 — Criar a VM

1. Oracle Cloud → **Compute → Instances → Create instance**.
2. **Image:** Ubuntu 22.04 ou 24.04 (ARM/aarch64).
3. **Shape:** `VM.Standard.A1.Flex` — **2 OCPU / 12 GB** já sobra muito
   (o limite free é 4 OCPU / 24 GB).
4. **Networking:** deixe criar a VCN e a subnet pública.
5. **SSH keys:** baixe a chave privada (`.key`).
6. Anote o **IP público** da instância.

> Se a criação do ARM falhar com "Out of capacity", tente outra
> Availability Domain ou horários diferentes — é comum no free tier.

## Passo 2 — Abrir as portas (⚠️ tem DOIS firewalls)

### 2a. Security List (firewall da nuvem)
VCN → **Security Lists** → a da subnet → **Add Ingress Rules**:

| Source | Protocol | Dest. port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

### 2b. iptables da instância (o clássico esquecido)
As imagens da Oracle vêm com iptables bloqueando tudo menos SSH. Na VM:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

> A porta `2567` **não** precisa ser pública — o Caddy acessa por `127.0.0.1`.

## Passo 3 — Apontar o DNS

No seu provedor de DNS, crie um registro **A**:

```
arena.seudominio.com  →  <IP público da VM>
```

## Passo 4 — Instalar Node 20 e Caddy

Conecte por SSH (`ssh -i chave.key ubuntu@IP`) e rode:

```bash
# Node.js 20 (o servidor exige Node >= 20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Caddy (HTTPS automático)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

node -v && caddy version
```

## Passo 5 — Copiar o servidor

Do seu computador (na pasta do FluXo), envie a pasta `server/` para a VM:

```bash
# rode no SEU computador (troque IP e chave)
scp -i chave.key -r server ubuntu@IP:/tmp/fluxo-arena
```

Na VM:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin fluxo || true
sudo mkdir -p /opt/fluxo-arena
sudo cp -r /tmp/fluxo-arena/* /opt/fluxo-arena/
cd /opt/fluxo-arena
sudo npm install --omit=dev
sudo cp .env.example .env
sudo nano .env          # preencha as chaves (ver abaixo)
sudo chown -R fluxo:fluxo /opt/fluxo-arena
sudo chmod 600 /opt/fluxo-arena/.env
```

Conteúdo do `/opt/fluxo-arena/.env`:

```env
PORT=2567
HOST=127.0.0.1
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ARENA_ALLOWED_ORIGIN=https://seu-fluxo.app
```

## Passo 6 — Serviço systemd

```bash
sudo cp /opt/fluxo-arena/deploy/fluxo-arena.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fluxo-arena
sudo systemctl status fluxo-arena --no-pager
```

## Passo 7 — Caddy (HTTPS)

```bash
sudo cp /opt/fluxo-arena/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # troque arena.seudominio.com pelo seu
sudo systemctl reload caddy
```

## Passo 8 — Testar

```bash
# local (na VM)
curl -s http://127.0.0.1:2567/health

# público, com HTTPS
curl -s https://arena.seudominio.com/health
# esperado: {"ok":true,"game":"arena-do-caos",...}

curl -s https://arena.seudominio.com/arena/rooms
# esperado: {"rooms":[]}
```

## Passo 9 — Configurar o cliente (FluXo)

No `.env` do projeto FluXo (e no painel do host do site, ex. Netlify):

```env
VITE_ARENA_URL=wss://arena.seudominio.com
VITE_ARENA_HTTP_URL=https://arena.seudominio.com
```

Depois, rebuild/deploy do site. O `VITE_LIVEKIT_INGRESS_URL` é opcional.

---

## Alternativas sem domínio próprio

- **DuckDNS (grátis):** crie `seu-nome.duckdns.org`, aponte para o IP e use esse
  nome no `Caddyfile`. O Caddy emite o certificado via porta 80.
- **Cloudflare Tunnel:** não precisa abrir portas nem IP público. Instala
  `cloudflared`, aponta o túnel para `http://127.0.0.1:2567` e ganha um hostname
  `https://…` pronto. Bom se você já usa Cloudflare.

## Custos

- **Oracle Always Free:** R$ 0 (VM ARM + 10 TB de egress/mês).
- **Caddy + Let's Encrypt:** R$ 0.
- **Supabase Free:** R$ 0 (pausa após 7 dias sem uso).
- **Total:** **R$ 0/mês**, desde que fique no free tier.

## Manutenção rápida

```bash
sudo systemctl restart fluxo-arena     # reiniciar o jogo
sudo journalctl -u fluxo-arena -f      # logs ao vivo
sudo systemctl reload caddy            # recarregar proxy
```

## O que eu preciso de você para implementar "de dentro"

1. **IP público** da VM.
2. **Usuário SSH** (`ubuntu` ou `opc`) e a **chave privada** (ou senha).
3. **Domínio/subdomínio** escolhido (ex.: `arena.seudominio.com`) — ou avisar se
   prefere DuckDNS/Cloudflare Tunnel.
4. As **chaves do Supabase** (URL, anon, service_role) — posso ler do `.env`
   local se preferir.

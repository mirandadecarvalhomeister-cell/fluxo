# Servidor da Arena do Caos (Colyseus) para Fly.io
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# Instala só as dependências de produção primeiro (melhor cache de camadas).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

# Fly.io roteia o tráfego externo (HTTP/WebSocket) para esta porta interna.
ENV PORT=2567
EXPOSE 2567

CMD ["node", "index.js"]

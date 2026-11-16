/**
 * Cloudflare Pages Function — endpoint de convite do Fluxo.
 *
 * O app usa hash routing (#conexoes/quiz?desafio=ID), que é invisível para
 * crawlers de WhatsApp/Telegram/Facebook ( eles só veem a URL até o '?' ).
 * Este endpoint resolve isso:
 *
 *  - Para CRAWLERS (que leem og: tags): devolve HTML com og:title,
 *    og:description e og:image apontando para /og (imagem gerada no edge).
 *  - Para USUÁRIOS: redireciona (via meta refresh + JS) para o app real,
 *    mantendo o desafio/convite no hash.
 *
 * Roda inteiramente no free tier do Cloudflare Pages Functions.
 */

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const challenge = url.searchParams.get('desafio') || url.searchParams.get('challenge') || '';
  const invite = url.searchParams.get('convite') || url.searchParams.get('invite') || '';
  const mode = url.searchParams.get('modo') || 'classic';
  const category = url.searchParams.get('categoria') || 'Todas as categorias';
  const challenger = url.searchParams.get('de') || 'Um amigo';
  const target = url.searchParams.get('meta') || '';

  const origin = url.origin;
  const imageUrl =
    origin +
    '/og?' +
    new URLSearchParams({
      desafio: challenge,
      convite: invite,
      modo: mode,
      categoria: category,
      de: challenger,
      meta: target,
    }).toString();

  const title = 'Desafio do Quiz BOOM! · Fluxo';
  const description = challenger
    ? `${challenger} te desafiou no Quiz BOOM! Aceite o desafio no Fluxo.`
    : 'Venha jogar o Quiz BOOM no Fluxo!';

  const hash = challenge
    ? `#conexoes/quiz?desafio=${encodeURIComponent(challenge)}`
    : invite
      ? `#conexoes/quiz?convite=${encodeURIComponent(invite)}`
      : '#conexoes/quiz';

  const appUrl = origin + '/' + hash;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl)}">
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Fluxo">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
</head>
<body>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(appUrl)}">Abrir o Fluxo</a></p>
<script>location.replace(${JSON.stringify(appUrl)});</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

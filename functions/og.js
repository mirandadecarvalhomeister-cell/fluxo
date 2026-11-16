import { ImageResponse } from 'workers-og';

/**
 * Cloudflare Pages Function — gera a imagem OG do Quiz BOOM (1200x630) no edge.
 * Usa satori (via workers-og), 100% no free tier, sem navegador.
 *
 * Recebe: ?modo=classic|insane&categoria=...&de=...&meta=...&desafio=...&convite=...
 */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const p = url.searchParams;
  const insane = (p.get('modo') || 'classic') === 'insane';
  const modeName = insane ? 'Insano' : 'Clássico';
  const category = p.get('categoria') || 'Todas as categorias';
  const challenger = p.get('de') || 'Um amigo';
  const metaRaw = p.get('meta') || '';
  const metaNum = Number(metaRaw);
  const accent = insane ? '#ff2d87' : '#8b5cf6';
  const bg = insane
    ? 'linear-gradient(135deg,#2a0a1f 0%,#120613 55%,#05050a 100%)'
    : 'linear-gradient(135deg,#1a1038 0%,#0d0a20 55%,#05050a 100%)';

  const metaBlock = metaNum
    ? `<div style="display:flex;align-items:center;justify-content:center;height:74px;background:rgba(255,255,255,0.08);border:2px solid ${accent};border-radius:18px;font-size:34px;font-weight:800;color:#fff;">Meta: ${esc(metaNum.toLocaleString('pt-BR'))} pontos</div>`
    : `<div style="display:flex;align-items:center;justify-content:center;height:74px;background:rgba(255,255,255,0.08);border:2px solid ${accent};border-radius:18px;font-size:32px;font-weight:700;color:#fff;">Aceite o desafio no Fluxo</div>`;

  const html = `
    <div style="display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;background:${bg};color:#fff;padding:56px;border:3px solid ${accent};border-radius:24px;font-family:sans-serif;">
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;color:${accent};font-size:30px;font-weight:800;letter-spacing:2px;">◆ QUIZ BOOM!</div>
        <div style="display:flex;font-size:76px;font-weight:800;line-height:1.05;color:#fff;">Você foi desafiado!</div>
        <div style="display:flex;font-size:30px;color:#c9c3dd;">${esc(challenger)} te chamou para jogar</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:18px;">
        <div style="display:flex;align-items:center;gap:20px;font-size:28px;">
          <div style="display:flex;background:rgba(255,255,255,0.1);border:1px solid ${accent};border-radius:999px;padding:8px 18px;color:#fff;">${esc(modeName)}</div>
          <div style="display:flex;color:#22d3ee;font-weight:700;">${esc(category.toUpperCase())}</div>
        </div>
        ${metaBlock}
      </div>
    </div>
  `;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
  });
}

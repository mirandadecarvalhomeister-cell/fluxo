import { modeById } from '../games/quiz/quizData';

/**
 * Gera uma imagem ilustrativa REAL do Quiz BOOM (1200x630, formato de card de
 * redes sociais) desenhada em canvas. Usada tanto como prévia visual nos
 * convites/compartilhamentos (Web Share API / og:image) quando no card do chat.
 *
 * Retorna um data URL (image/png) — funciona offline e sem CORS.
 */

const FONT = "'Bricolage Grotesque', 'Instrument Sans', system-ui, sans-serif";

function fitText(ctx, text, maxWidth, baseSize, minSize = 24) {
  let size = baseSize;
  ctx.font = `800 ${size}px ${FONT}`;
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    ctx.font = `800 ${size}px ${FONT}`;
  }
  return size;
}

function wrap(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

export function drawQuizCard(canvas, info = {}) {
  const ctx = canvas.getContext('2d');
  const W = (canvas.width = 1200);
  const H = (canvas.height = 630);
  const mode = modeById(info.mode);
  const insane = info.mode === 'insane';
  const category = info.categoryName || 'Todas as categorias';
  const challenger = info.challengerName || 'Um amigo';
  const size = Number(info.size) || 10;
  const target = Number(info.targetScore) || 0;

  // Fundo: gradiente temático do jogo.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  if (insane) {
    bg.addColorStop(0, '#2a0a1f');
    bg.addColorStop(0.55, '#120613');
    bg.addColorStop(1, '#05050a');
  } else {
    bg.addColorStop(0, '#1a1038');
    bg.addColorStop(0.55, '#0d0a20');
    bg.addColorStop(1, '#05050a');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Halos decorativos.
  const glow = ctx.createRadialGradient(980, 120, 10, 980, 120, 520);
  glow.addColorStop(0, insane ? 'rgba(255,45,135,.30)' : 'rgba(139,92,246,.28)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const glow2 = ctx.createRadialGradient(120, 600, 10, 120, 600, 460);
  glow2.addColorStop(0, 'rgba(34,211,238,.16)');
  glow2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Moldura.
  ctx.strokeStyle = insane ? 'rgba(255,45,135,.55)' : 'rgba(139,92,246,.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // Bomba ilustrativa (desenho vetorial, não emoji dependente de fonte).
  const cx = 960;
  const cy = 300;
  ctx.save();
  ctx.shadowColor = insane ? '#ff2d87' : '#8b5cf6';
  ctx.shadowBlur = 60;
  ctx.fillStyle = '#111018';
  ctx.beginPath();
  ctx.arc(cx, cy + 30, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Brilho na bomba.
  const bombGrad = ctx.createRadialGradient(cx - 45, cy - 10, 10, cx, cy + 30, 160);
  bombGrad.addColorStop(0, insane ? '#ff7ab8' : '#b79bff');
  bombGrad.addColorStop(0.25, insane ? '#ff2d87' : '#8b5cf6');
  bombGrad.addColorStop(1, '#1b0f2e');
  ctx.fillStyle = bombGrad;
  ctx.beginPath();
  ctx.arc(cx, cy + 30, 142, 0, Math.PI * 2);
  ctx.fill();
  // Pavio e faísca.
  ctx.strokeStyle = '#ffc93c';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 30, cy - 95);
  ctx.quadraticCurveTo(cx + 95, cy - 150, cx + 70, cy - 205);
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = '#ff8a3c';
  ctx.shadowBlur = 45;
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath();
  ctx.arc(cx + 70, cy - 210, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // "?" no corpo da bomba.
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.font = `800 150px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', cx, cy + 42);

  // Texto — lado esquerdo.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Selo do jogo.
  ctx.fillStyle = insane ? '#ff2d87' : '#8b5cf6';
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText('QUIZ BOOM!', 72, 112);
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText('FLUXO · DESAFIO', 72, 148);

  // Título principal.
  ctx.fillStyle = '#ffffff';
  fitText(ctx, 'Você foi desafiado!', 820, 76, 42);
  ctx.fillText('Você foi desafiado!', 72, 250);

  // Quem desafiou.
  ctx.fillStyle = '#c9c3dd';
  ctx.font = `600 32px ${FONT}`;
  const who = `${challenger} te chamou para jogar`;
  fitText(ctx, who, 820, 32, 22);
  ctx.fillText(who, 72, 310);

  // Categoria.
  ctx.fillStyle = insane ? '#ff8ab9' : '#9b83ff';
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText(category.toUpperCase(), 72, 372);

  // Linha de metadados (modo + perguntas).
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText(`${mode?.emoji || '⏱️'}  ${mode?.name || 'Clássico'}`, 72, 440);
  ctx.fillStyle = '#22d3ee';
  ctx.fillText(`${size} perguntas`, 330, 440);

  // Meta de pontos — caixa destacada.
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.strokeStyle = insane ? 'rgba(255,45,135,.5)' : 'rgba(139,92,246,.5)';
  ctx.lineWidth = 2;
  roundRect(ctx, 72, 484, 470, 78, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 36px ${FONT}`;
  ctx.fillText(`Meta: ${target.toLocaleString('pt-BR')} pontos`, 96, 534);

  // Rodapé.
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText('Aceite o desafio e mostre do que é capaz.', 72, 600);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let cache = new Map();
const CACHE_LIMIT = 40;

/** Retorna um data URL PNG do card. Cacheia por desafio para não redesenhar. */
export function quizCardImage(info = {}) {
  const key = [
    info.mode || 'classic',
    info.categoryName || '',
    info.challengerName || '',
    info.size || 10,
    info.targetScore || 0,
  ].join('|');
  if (cache.has(key)) return cache.get(key);
  try {
    const canvas = document.createElement('canvas');
    drawQuizCard(canvas, info);
    const url = canvas.toDataURL('image/png');
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

export default quizCardImage;

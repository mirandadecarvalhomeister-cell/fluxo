// Modelo de edição de mídia (fotos e vídeos).
//
// A edição é representada por um objeto serializável guardado junto da mídia:
// {
//   v: 1,
//   ar: 1.333,              // altura / largura da mídia original
//   filter: { b: 100, c: 100, s: 100, se: 0, g: 0, bl: 0 },
//   rotate: 0,              // 0 | 90 | 180 | 270 (queimado no export de fotos)
//   flip: false,
//   texts: [{ id, text, x, y, color, size }],      // x, y e size em fração (0-1) da caixa
//   strokes: [{ id, color, w, pts: [[x, y], ...] }],
// }
//
// Fotos: sempre que possível a edição é "queimada" em um novo JPEG no export
// (exportEditedImage) e o objeto sai da mídia. Se o export falhar (fonte
// externa sem CORS, canvas contaminado etc.), o objeto permanece e a edição
// é aplicada na exibição, como acontece com vídeos.

export const NEUTRAL_FILTER = { b: 100, c: 100, s: 100, se: 0, g: 0, bl: 0 };

export function emptyEdit(ar = 1) {
  return {
    v: 1,
    ar: ar > 0 ? ar : 1,
    filter: { ...NEUTRAL_FILTER },
    rotate: 0,
    flip: false,
    texts: [],
    strokes: [],
  };
}

export function isNeutralFilter(filter) {
  if (!filter) return true;
  return Object.keys(NEUTRAL_FILTER).every((key) => !filter[key] || filter[key] === NEUTRAL_FILTER[key]);
}

export function hasEdits(edit) {
  if (!edit) return false;
  return (
    !isNeutralFilter(edit.filter) ||
    !!edit.rotate ||
    !!edit.flip ||
    (edit.texts || []).some((t) => t && t.text) ||
    (edit.strokes || []).length > 0
  );
}

export function filterCss(filter) {
  if (!filter || isNeutralFilter(filter)) return '';
  const parts = [];
  if (filter.b !== undefined && filter.b !== 100) parts.push(`brightness(${filter.b / 100})`);
  if (filter.c !== undefined && filter.c !== 100) parts.push(`contrast(${filter.c / 100})`);
  if (filter.s !== undefined && filter.s !== 100) parts.push(`saturate(${filter.s / 100})`);
  if (filter.se) parts.push(`sepia(${filter.se / 100})`);
  if (filter.g) parts.push(`grayscale(${filter.g / 100})`);
  if (filter.bl) parts.push(`blur(${filter.bl}px)`);
  return parts.join(' ');
}

// Aspecto da caixa após rotação de 90/270 graus.
export function wrapperAspect(edit) {
  const ar = edit?.ar > 0 ? edit.ar : 1;
  return edit?.rotate === 90 || edit?.rotate === 270 ? 1 / ar : ar;
}

export function mediaTransformStyle(edit) {
  if (!edit || (!edit.rotate && !edit.flip)) return undefined;
  const parts = [];
  if (edit.rotate) parts.push(`rotate(${edit.rotate}deg)`);
  if (edit.flip) parts.push('scaleX(-1)');
  return { transform: parts.join(' ') };
}

// Estilo inline a aplicar no elemento de mídia exibido (filtro + giro).
export function mediaDisplayStyle(edit) {
  if (!edit) return undefined;
  return {
    filter: filterCss(edit.filter) || undefined,
    ...(mediaTransformStyle(edit) || {}),
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clampPercent = (v) => clamp01(v);

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
    img.src = src;
  });
}

function applyPixelFilters(ctx, w, h, filter) {
  if (isNeutralFilter(filter)) return;
  const { b = 100, c = 100, s = 100, se = 0, g = 0 } = filter || {};
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const kb = b / 100;
  const kc = c / 100;
  const ks = s / 100;
  const kse = se / 100;
  const kg = g / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let gg = d[i + 1];
    let bl = d[i + 2];
    if (kb !== 1) {
      r *= kb;
      gg *= kb;
      bl *= kb;
    }
    if (kc !== 1) {
      r = (r - 128) * kc + 128;
      gg = (gg - 128) * kc + 128;
      bl = (bl - 128) * kc + 128;
    }
    if (ks !== 1) {
      const l = 0.299 * r + 0.587 * gg + 0.114 * bl;
      r = l + (r - l) * ks;
      gg = l + (gg - l) * ks;
      bl = l + (bl - l) * ks;
    }
    if (kse) {
      const sr = 0.393 * r + 0.769 * gg + 0.189 * bl;
      const sg = 0.349 * r + 0.686 * gg + 0.168 * bl;
      const sb = 0.272 * r + 0.534 * gg + 0.131 * bl;
      r += (Math.min(255, sr) - r) * kse;
      gg += (Math.min(255, sg) - gg) * kse;
      bl += (Math.min(255, sb) - bl) * kse;
    }
    if (kg) {
      const l = 0.299 * r + 0.587 * gg + 0.114 * bl;
      r += (l - r) * kg;
      gg += (l - gg) * kg;
      bl += (l - bl) * kg;
    }
    d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg;
    d[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
  }
  ctx.putImageData(image, 0, 0);
}

function drawStrokes(ctx, edit, cw, ch) {
  (edit.strokes || []).forEach((stroke) => {
    if (!stroke || !stroke.pts?.length) return;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, (stroke.w || 0.015) * cw);
    if (stroke.pts.length === 1) {
      const [x, y] = stroke.pts[0];
      ctx.beginPath();
      ctx.arc(x * cw, y * ch, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    stroke.pts.forEach(([x, y], i) => {
      if (i) ctx.lineTo(x * cw, y * ch);
      else ctx.moveTo(x * cw, y * ch);
    });
    ctx.stroke();
  });
}

function drawTexts(ctx, edit, cw, ch) {
  (edit.texts || []).forEach((t) => {
    if (!t || !t.text) return;
    const fs = Math.max(9, (t.size || 0.09) * cw);
    ctx.font = `800 ${fs}px 'Bricolage Grotesque','Segoe UI',system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.color || '#fff';
    const lines = String(t.text).split('\n').slice(0, 6);
    const lh = fs * 1.15;
    const x = t.x * cw;
    const y0 = t.y * ch - ((lines.length - 1) * lh) / 2;
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = fs * 0.12;
    ctx.shadowOffsetY = fs * 0.03;
    lines.forEach((line, i) => ctx.fillText(line, x, y0 + i * lh));
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
}

// Exporta a foto editada como JPEG (edição queimada no arquivo).
// Lança erro se não conseguir; nesse caso o chamador mantém o objeto de
// edição e a mídia é exibida com a edição aplicada em tempo de exibição.
export async function exportEditedImage({
  src,
  edit,
  fileName = 'foto.jpg',
  maxSide = 1440,
  quality = 0.9,
}) {
  const img = await loadImage(src);
  const rot = ((Number(edit.rotate) || 0) % 360 + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const cw = swap ? h : w;
  const ch = swap ? w : h;

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const css = filterCss(edit.filter);
  const supportsCtxFilter = typeof ctx.filter === 'string';

  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate((rot * Math.PI) / 180);
  if (edit.flip) ctx.scale(-1, 1);
  if (supportsCtxFilter && css) ctx.filter = css;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();

  if (!supportsCtxFilter) applyPixelFilters(ctx, cw, ch, edit.filter);
  drawStrokes(ctx, edit, cw, ch);
  drawTexts(ctx, edit, cw, ch);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Não foi possível gerar a imagem editada.');
  const base = String(fileName || 'foto').replace(/\.[^.]+$/, '') || 'foto';
  return new File([blob], `${base}-editada.jpg`, { type: 'image/jpeg' });
}

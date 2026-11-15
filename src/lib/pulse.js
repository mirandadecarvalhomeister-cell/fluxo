// FLUXO PULSO + ONDAS SOCIAIS
//
// Recomendação por regras, sem IA complexa:
// - interesses declarados e comunidades;
// - conexões (quem você segue, quem conversa com quem);
// - conversa de verdade (comentários, respostas, votos e entradas);
// - recência;
// - potencial de conversa (pergunta aberta, enquete sem voto etc.);
// - ondas: publicações que começaram a receber participação ganham
//   distribuição progressiva para pessoas com interesses parecidos.
//
// A pontuação é determinística e auditável. Popularidade bruta nunca domina:
// curtidas entram com peso baixo e logarítmico, e sinais de manipulação
// (respostas repetidas, rajadas artificiais e baixa diversidade) reduzem a
// qualidade da onda.
import { normalizeInteractive } from './interactive.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const WEIGHTS = {
  comment: 2.4,
  answer: 3,
  join: 2.6,
  vote: 2,
  reaction: 1,
  like: 0.8,
  view: 0,
};

const STAGE_META = {
  breaking: { label: 'Onda forte agora', boost: 1.5, short: 'Onda forte' },
  rising: { label: 'Onda crescendo', boost: 1.22, short: 'Crescendo' },
  starting: { label: 'Começando a pegar ritmo', boost: 1.08, short: 'Começando' },
  quiet: { label: 'Sem onda no momento', boost: 1, short: 'Parada' },
};

export function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const ageHours = (ts, now = Date.now()) =>
  Math.max(0.25, (now - (ts || now)) / HOUR);

const safeRows = (post) => (Array.isArray(post?.interactions) ? post.interactions : []);

function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = row?.by || row?.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function interactionWeights(post) {
  const rows = safeRows(post).filter((row) => row?.kind !== 'view');
  return rows.map((row) => ({
    row,
    weight:
      WEIGHTS[row.kind] ??
      (row.kind === 'like' || row.kind === 'reaction' ? WEIGHTS.reaction : 1),
  }));
}

function repeatPenalty(post) {
  const answers = safeRows(post).filter((row) => row.kind === 'answer' && row.text);
  const seen = new Map();
  answers.forEach((row) => {
    const key = norm(row.text).slice(0, 140);
    if (!key) return;
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  let repeats = 0;
  seen.forEach((count) => {
    if (count > 1) repeats += count - 1;
  });
  return answers.length ? repeats / answers.length : 0;
}

function burstPenalty(post, now) {
  const timestamps = safeRows(post)
    .filter((row) => row?.kind !== 'view' && row?.ts)
    .map((row) => row.ts)
    .sort((a, b) => a - b);
  if (timestamps.length < 6) return 0;
  let biggest = 1;
  let start = 0;
  for (let end = 0; end < timestamps.length; end += 1) {
    while (timestamps[end] - timestamps[start] > 120_000) start += 1;
    biggest = Math.max(biggest, end - start + 1);
  }
  if (biggest < 6) return 0;
  const recentShare = timestamps.filter((ts) => now - ts <= 5 * 60_000).length / timestamps.length;
  return Math.min(0.5, 0.15 + biggest * 0.03 + recentShare * 0.15);
}

// Qualidade da participação: diversidade de pessoas, profundidade da conversa,
// conteúdo real e punição para rajadas/repetição. Retorna 0.35 a ~1.8.
export function qualityOf(post, now = Date.now()) {
  const rows = interactionWeights(post);
  const unique = uniqueRows(rows.map((entry) => entry.row));
  const totalWeight = rows.reduce((sum, entry) => sum + entry.weight, 0);
  const comments = (post?.comments || []).length;
  const textSize = Math.min(1.2, String(post?.text || '').trim().length / 140);
  const mediaBonus = (post?.media || []).length || post?.kind === 'photo' || post?.kind === 'video' ? 0.6 : 0;
  const diversity = rows.length ? unique.length / rows.length : 0.6;
  const depth = Math.min(1.4, totalWeight / 6 + comments / 5);
  const base = 0.3 + depth * 0.55 + textSize * 0.28 + mediaBonus * 0.22;
  const penalties = repeatPenalty(post) * 0.65 + burstPenalty(post, now);
  return Math.max(0.35, Math.min(1.8, base * (0.62 + diversity * 0.55) - penalties));
}

export function interestScore(post, terms) {
  if (!terms?.length) return 0;
  const haystack = norm(
    `${post?.text || ''} ${post?.communityName || ''} ${post?.communityCat || ''}`
  );
  const matches = terms.reduce(
    (total, term) => (term && haystack.includes(term) ? total + 1 : total),
    0
  );
  return Math.min(1, matches / 3);
}

function communityOf(post, comms) {
  if (!post?.communityId) return null;
  return (comms || []).find((item) => item.id === post.communityId) || null;
}

// Conexões = autoria seguida, comunidades em comum e gente próxima que já
// comentou/participou da publicação.
export function connectionScore(post, ctx) {
  const follows = ctx?.follows || [];
  let score = 0;
  if (follows.includes(post?.by) || post?.by === ctx?.meId) score += 1;
  const community = communityOf(post, ctx?.comms);
  if (community?.joined) score += 0.7;
  const voices = [
    ...safeRows(post).map((row) => row.by),
    ...(post?.comments || []).map((comment) => comment.by),
  ].filter((id) => id && id !== post?.by);
  const closeVoices = new Set(voices.filter((id) => follows.includes(id)));
  score += Math.min(0.6, closeVoices.size * 0.2);
  return Math.min(2.2, score);
}

function conversationPotential(post, interactive) {
  const comments = (post?.comments || []).length;
  const rows = safeRows(post);
  const answers = rows.filter((row) => row.kind === 'answer').length;
  const votes = rows.filter((row) => row.kind === 'vote').length;
  const joins = rows.filter((row) => row.kind === 'join').length;
  const activity = comments + answers * 1.3 + votes * 0.6 + joins;
  let score = Math.min(1.2, activity / 6);
  if (interactive?.format === 'question') {
    score += answers < 5 ? 0.35 : 0.12;
  } else if (interactive?.format === 'poll' || interactive?.format === 'imageVote') {
    score += votes < 6 ? 0.22 : 0.08;
  } else if (interactive?.format === 'challenge') {
    score += joins < 4 ? 0.26 : 0.1;
  }
  return Math.min(1.6, score);
}

// ONDAS SOCIAIS: participação recente em uma janela curta, comparada com a
// idade da publicação. Publicações pequenas mas acelerando passam na frente de
// conteúdos antigos que só acumularam números.
export function waveOf(post, now = Date.now()) {
  const recentWindow = 6 * HOUR;
  const rows = safeRows(post).filter((row) => row?.kind !== 'view');
  const comments = (post?.comments || []).map((comment) => ({
    by: comment.by,
    kind: 'comment',
    ts: comment.ts,
  }));
  const events = [...rows, ...comments].filter((row) => row?.by);
  const recent = events.filter((row) => now - (row?.ts || 0) <= recentWindow);
  const participantCount = uniqueRows(recent).length;
  const velocity = recent.length / Math.max(0.5, Math.min(6, ageHours(post?.ts, now)));
  const age = ageHours(post?.ts, now);
  let stage = 'quiet';
  if (participantCount >= 5 && velocity >= 2) stage = 'breaking';
  else if (participantCount >= 2 && (velocity >= 0.8 || participantCount >= 3)) stage = 'rising';
  else if (age <= 3 && participantCount >= 1) stage = 'starting';
  const meta = STAGE_META[stage];
  return {
    ...meta,
    stage,
    velocity: Math.round(velocity * 10) / 10,
    participants: participantCount,
    recent: recent.length,
  };
}

function recencyScore(post, now) {
  const hours = ageHours(post?.ts, now);
  return 1 / (1 + hours / 14);
}

function hotness(post, now) {
  const rows = interactionWeights(post);
  const weight = rows.reduce((sum, entry) => sum + entry.weight, 0);
  const comments = (post?.comments || []).length * WEIGHTS.comment;
  const likes = post?.likes || 0;
  return Math.log1p((weight + comments + likes * WEIGHTS.like) / Math.sqrt(ageHours(post?.ts, now)));
}

export function pulseForPost(post, ctx = {}) {
  const now = ctx.now || Date.now();
  const level = ctx.level || 'balanced';
  const interactive = normalizeInteractive(post?.interactive);
  const terms = ctx.terms || [];
  const interest = interestScore(post, terms);
  const connection = connectionScore(post, { ...ctx, now });
  const conversation = conversationPotential(post, interactive);
  const quality = qualityOf(post, now);
  const recency = recencyScore(post, now);
  const hot = hotness(post, now);
  const wave = waveOf(post, now);

  const discovery = level === 'high' ? 1.4 : level === 'low' ? 0.45 : 1;
  const affinityWeight = level === 'low' ? 1.7 : level === 'high' ? 0.75 : 1.15;

  const base =
    connection * affinityWeight * 2.1 +
    interest * 2.4 +
    conversation * 1.5 +
    quality * 1.65 +
    recency * 4 +
    hot * discovery * 0.55;

  const score = base * wave.boost;

  const reasons = [];
  const community = communityOf(post, ctx.comms);
  if (post?.by === ctx.meId) reasons.push('Sua publicação');
  else if (connection >= 1) reasons.push('De alguém da sua conexão');
  else if (community?.joined) reasons.push(`Da comunidade ${community.name}`);
  if (wave.stage !== 'quiet' && wave.stage !== 'starting') reasons.push(wave.label);
  else if (interest > 0.34) reasons.push('Ligado aos seus interesses');
  if (conversation > 0.8) reasons.push('Conversa em potencial');
  if (!reasons.length) reasons.push('Descoberta pelo Fluxo');

  return {
    score: Math.round(score * 1000) / 1000,
    reasons: [...new Set(reasons)].slice(0, 2),
    wave,
    quality,
    interest,
    connection,
    conversation,
  };
}

// Ordena e devolve as publicações com `pulse`, `wave`, `feedReason` e
// `feedReasons`. Não altera a lista original.
export function applyPulse(posts, ctx = {}) {
  const now = ctx.now || Date.now();
  return (posts || [])
    .map((post) => {
      const pulse = pulseForPost(post, { ...ctx, now });
      return {
        ...post,
        pulse,
        wave: pulse.wave,
        feedReasons: pulse.reasons,
        feedReason: ctx.showReasons === false ? null : pulse.reasons[0] || null,
      };
    })
    .sort((a, b) => b.pulse.score - a.pulse.score);
}

// Feed de ondas: só o que está começando/ crescendo, priorizando interesses e
// diversidade de pessoas. A distribuição é ampliada aos poucos conforme a
// participação real aumenta.
export function applyWaves(posts, ctx = {}) {
  const now = ctx.now || Date.now();
  return (posts || [])
    .map((post) => {
      const pulse = pulseForPost(post, { ...ctx, now });
      return { ...post, pulse, wave: pulse.wave };
    })
    .filter((post) => post.wave.stage !== 'quiet')
    .sort((a, b) => {
      const order = { breaking: 3, rising: 2, starting: 1, quiet: 0 };
      return (
        order[b.wave.stage] - order[a.wave.stage] ||
        b.wave.velocity - a.wave.velocity ||
        b.pulse.interest - a.pulse.interest ||
        b.pulse.quality - a.pulse.quality
      );
    })
    .map((post) => ({
      ...post,
      feedReasons: [
        post.wave.label,
        post.pulse.interest > 0.34 ? 'Pessoas com interesses parecidos estão participando' : 'Distribuição ampliada pela participação',
      ],
      feedReason: ctx.showReasons === false ? null : post.wave.label,
    }));
}

export const WAVE_STAGES = STAGE_META;

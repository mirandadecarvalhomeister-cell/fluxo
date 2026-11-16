// Dados e regras do Quiz BOOM! compartilhados pela interface.
// As funções tentam o Supabase e caem para o armazenamento local quando o
// backend ainda não foi migrado (modo demonstração), sem esconder a limitação.

import * as remote from '../../lib/remote';

export const FREE_ROUNDS = 3;
export const BONUS_ROUNDS = 3;
export const REFRESH_HOURS = 3;
export const REFRESH_MAX_PER_DAY = 8;
export const ROUND_SIZES = [10, 20, 30, 50, 100];
export const CLASSIC_FUSE_SECONDS = 15;
export const INSANE_SECONDS_PER_QUESTION = 8;
export const INSANE_MIN_SECONDS = 45;

const WEEK_KEY = 'fluxo.quiz.week';
const ROUNDS_KEY = 'fluxo.quiz.rounds';
const BONUS_KEY = 'fluxo.quiz.bonus';
const MEDALS_KEY = 'fluxo.quiz.medals';
const CHALLENGES_KEY = 'fluxo.quiz.challenges';
const RANK_KEY = 'fluxo.quiz.rank';
const BEST_KEY = 'fluxo.quiz.best';
const INVITE_KEY = 'fluxo.quiz.invitedBy';

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* armazenamento indisponível */
  }
};

export const weekKey = (date = new Date()) => {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day - yearStart) / 86400000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const activeWeek = () => {
  const current = weekKey();
  if (read(WEEK_KEY, '') !== current) {
    write(WEEK_KEY, current);
    write(ROUNDS_KEY, []);
    write(BONUS_KEY, {});
  }
  return current;
};

export const localRoundStatus = () => {
  activeWeek();
  const used = (read(ROUNDS_KEY, []) || []).length;
  const bonus = Number(read(BONUS_KEY, {})?.rounds) || 0;
  const now = new Date();
  const hours = now.getUTCHours();
  const refresh = Math.min(REFRESH_MAX_PER_DAY, Math.floor(hours / REFRESH_HOURS));
  return {
    used,
    bonus,
    free: FREE_ROUNDS,
    refresh,
    refreshIn: REFRESH_HOURS - (hours % REFRESH_HOURS),
    remaining: Math.max(0, FREE_ROUNDS + bonus + refresh - used),
    online: false,
  };
};

export async function roundStatus() {
  const local = localRoundStatus();
  const remoteStatus = await remote.quizRoundStatus?.();
  if (remoteStatus?.online) {
    const refresh = remoteStatus.refresh_rounds || 0;
    const hours = new Date().getUTCHours();
    return {
      ...remoteStatus,
      free: remoteStatus.free_rounds ?? FREE_ROUNDS,
      bonus: remoteStatus.bonus || 0,
      refresh,
      refreshIn: REFRESH_HOURS - (hours % REFRESH_HOURS),
      remaining: remoteStatus.remaining || 0,
      online: true,
    };
  }
  return local;
}

export function registerLocalRound() {
  activeWeek();
  const rounds = read(ROUNDS_KEY, []) || [];
  rounds.push(Date.now());
  write(ROUNDS_KEY, rounds);
}

export async function beginRun(run) {
  const started = await remote.quizBeginRun?.(run);
  if (started?.ok) return { ok: true, online: true };
  if (started?.error && !/offline|function|schema|not_authenticated/i.test(started.error)) {
    return { ok: false, error: started.error, online: true };
  }
  // Fallback local: valida a cota no dispositivo.
  const status = localRoundStatus();
  if (status.remaining <= 0) return { ok: false, error: 'quiz_round_limit', online: false };
  registerLocalRound();
  return { ok: true, online: false };
}

export async function finishRun(runId, result, online) {
  if (online && runId) await remote.quizFinishRun?.(runId, result);
  saveLocalRanking(result);
  const best = Math.max(Number(read(BEST_KEY, 0)) || 0, Number(result.score) || 0);
  write(BEST_KEY, best);
  return best;
}

export const readBest = () => Number(read(BEST_KEY, 0)) || 0;

const PENDING_INVITE_KEY = 'fluxo.quiz.pendingInvite';

export const readPendingInvite = () => read(PENDING_INVITE_KEY, '');
export const clearPendingInvite = () => write(PENDING_INVITE_KEY, '');

export async function claimInvite(inviter) {
  if (!inviter) return false;

  // Só concede bônus a quem tem cadastro (sessão ativa no Supabase).
  // Visitantes não ganham apenas por abrir o link: guardamos o convite como
  // pendente e ele é aplicado assim que a pessoa se cadastrar/entrar.
  const loggedIn = await remote.hasSession?.();
  if (!loggedIn) {
    // Não sobrescreve um convite pendente já guardado.
    if (!read(PENDING_INVITE_KEY, '')) write(PENDING_INVITE_KEY, inviter);
    return false;
  }

  // Evita repetir o mesmo convite para a mesma conta.
  const already = read(INVITE_KEY, '');
  if (already === inviter) return false;

  const remoteOk = await remote.quizClaimInvite?.(inviter);
  if (remoteOk) {
    write(INVITE_KEY, inviter);
    clearPendingInvite();
    return true;
  }

  // Modo demonstração (sem Supabase configurado): sem cadastro real, não há
  // como validar o convidado — também não concede bônus apenas pelo link.
  return false;
}

export async function saveMedal(categoryId, online) {
  if (online) await remote.quizSaveMedal?.(categoryId);
  const medals = read(MEDALS_KEY, []) || [];
  if (!medals.some((item) => item.category === categoryId)) {
    medals.push({ category: categoryId, createdAt: Date.now() });
    write(MEDALS_KEY, medals);
  }
  return medals;
}

export async function loadMedals(online) {
  let rows = [];
  if (online) rows = (await remote.quizLoadMedals?.()) || [];
  const local = read(MEDALS_KEY, []) || [];
  const map = new Map();
  [...local, ...rows].forEach((item) => {
    const category = item.category || item.id;
    if (category) map.set(category, { category, createdAt: item.created_at || item.createdAt });
  });
  return [...map.values()];
}

export async function saveChallenge(challenge, online) {
  saveLocalChallenge(challenge);
  if (online) await remote.quizSaveChallenge?.(challenge);
  return challenge;
}

export async function fetchChallenge(id, online) {
  const local = read(CHALLENGES_KEY, {})?.[id];
  if (local) return local;
  if (!online) return null;
  return remote.quizFetchChallenge?.(id);
}

export function saveLocalChallenge(challenge) {
  if (!challenge?.id) return;
  const all = read(CHALLENGES_KEY, {}) || {};
  all[challenge.id] = challenge;
  write(CHALLENGES_KEY, all);
}

const saveLocalRanking = (result) => {
  if (!result?.userId) return;
  const rows = read(RANK_KEY, []) || [];
  rows.unshift({
    userId: result.userId,
    name: result.name || 'Jogador',
    handle: result.handle || '',
    avatar: result.avatar || null,
    score: Number(result.score) || 0,
    bestCombo: Number(result.bestCombo) || 0,
    category: result.category || 'todas',
    mode: result.mode || 'classic',
    createdAt: Date.now(),
  });
  write(RANK_KEY, rows.slice(0, 60));
}

const rankRows = (rows, limit) => {
  const best = new Map();
  rows.forEach((row) => {
    const current = best.get(row.userId);
    if (!current || Number(row.score) > Number(current.score)) best.set(row.userId, row);
  });
  return [...best.values()]
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, limit)
    .map((row, index) => ({ ...row, position: index + 1, score: Number(row.score) || 0 }));
};

export function localRankings({ follows = [], me = null, limit = 50 } = {}) {
  const rows = read(RANK_KEY, []) || [];
  const global = rankRows(rows, limit);
  const friendsSet = new Set([...(follows || []), me?.id].filter(Boolean));
  const friends = rankRows(
    rows.filter((row) => friendsSet.has(row.userId)),
    limit
  );
  return { global, friends };
}

export async function rankings(context) {
  const local = localRankings(context);
  const remoteRanks = await remote.quizRankings?.(50);
  return {
    global: remoteRanks?.global?.length ? remoteRanks.global : local.global,
    friends: remoteRanks?.friends?.length ? remoteRanks.friends : local.friends,
    online: Boolean(remoteRanks?.global?.length || remoteRanks?.friends?.length),
  };
}

// ---------------------------------------------------------------------------
// Modos, combos e pontuação.
// ---------------------------------------------------------------------------

export const MODES = {
  classic: {
    id: 'classic',
    name: 'Clássico',
    emoji: '⏱️',
    tagline: '15 segundos de pavio para cada pergunta.',
    description:
      'Um pavio por pergunta. Se o tempo acabar, a bomba estoura e a rodada termina.',
  },
  insane: {
    id: 'insane',
    name: 'Insano',
    emoji: '🔥',
    tagline: 'Um único tempo para a partida inteira.',
    description:
      'Um cronômetro total para todas as perguntas. Pense rápido: o tempo não para entre as respostas.',
  },
};

export const modeById = (id) => MODES[id === 'insane' ? 'insane' : 'classic'];

export function runSeconds(modeId, size) {
  if (modeId === 'insane') {
    return Math.max(INSANE_MIN_SECONDS, Math.round((Number(size) || 10) * INSANE_SECONDS_PER_QUESTION));
  }
  return CLASSIC_FUSE_SECONDS;
}

export const COMBO_TIERS = [
  { at: 1, name: 'Good', label: 'Bom', multiplier: 1, color: '#8b5cf6' },
  { at: 2, name: 'Great', label: 'Ótimo', multiplier: 2, color: '#22d3ee' },
  { at: 3, name: 'Excellent', label: 'Excelente', multiplier: 3, color: '#31d158' },
  { at: 4, name: 'Amazing', label: 'Incrível', multiplier: 4, color: '#ffc93c' },
  { at: 5, name: 'Fantastic', label: 'Fantástico', multiplier: 5, color: '#ff8a3c' },
  { at: 6, name: 'Unstoppable', label: 'Imparável', multiplier: 6, color: '#ff5a3c' },
  { at: 7, name: 'Legendary', label: 'Lendário', multiplier: 7, color: '#ff2d87' },
];

const MAX_MULTIPLIER = 7;

export function comboFor(streak) {
  const value = Math.max(0, Number(streak) || 0);
  if (!value) {
    return { name: 'Combo perdido', label: 'Combo perdido', multiplier: 1, color: '#6b7186', next: COMBO_TIERS[0] };
  }
  const index = Math.min(value, COMBO_TIERS.length) - 1;
  const tier = COMBO_TIERS[index];
  const next = COMBO_TIERS[Math.min(index + 1, COMBO_TIERS.length - 1)];
  return {
    ...tier,
    multiplier: Math.min(value, MAX_MULTIPLIER),
    next,
  };
}

// Pontuação: 100 pontos base, multiplicados pelo combo. No Clássico ainda
// existe um bônus pequeno pelo tempo restante do pavio.
export function pointsFor({ streak, mode, timeLeft, perQuestion }) {
  const combo = comboFor(streak);
  const base = 100 * combo.multiplier;
  const timeBonus =
    mode === 'classic'
      ? Math.round(Math.max(0, Math.min(CLASSIC_FUSE_SECONDS, timeLeft)) * 4 * combo.multiplier)
      : Math.round(Math.max(0, perQuestion ? timeLeft / perQuestion : 0) * 6 * combo.multiplier);
  return { points: base + timeBonus, combo };
}

export const MEDAL_NAMES = {
  historia: 'Mestre da História',
  geografia: 'Mestre da Geografia',
  ciencias: 'Mestre da Ciência',
  matematica: 'Mestre da Matemática',
  cinema: 'Mestre do Cinema',
  musica: 'Mestre da Música',
  esportes: 'Mestre dos Esportes',
  tecnologia: 'Mestre da Tecnologia',
  literatura: 'Mestre da Literatura',
  artes: 'Mestre das Artes',
  games: 'Mestre dos Games',
  animes: 'Mestre dos Animes',
  gerais: 'Mestre do Conhecimento',
  todas: 'Mestre do Quiz BOOM',
};

export const medalName = (categoryId) => MEDAL_NAMES[categoryId] || 'Mestre do Quiz BOOM';

// Gera o link de convite no endpoint /convite, que serve tags OG dinâmicas
// para crawlers (WhatsApp/Telegram) e redireciona usuários para o app.
// Também mantemos os parâmetros no hash para o app saber o que abrir.
function shareableLink(kind, id, extra = {}) {
  const base = `${window.location.origin}${window.location.pathname}`;
  const query = new URLSearchParams({ [kind]: id || '', ...extra }).toString();
  return `${base}convite?${query}#conexoes/quiz?${kind}=${encodeURIComponent(id || '')}`;
}

export function inviteLink(userId) {
  return shareableLink('convite', userId || '');
}

export function challengeLink(id, meta = {}) {
  return shareableLink('desafio', id || '', {
    modo: meta.mode || '',
    categoria: meta.categoryName || '',
    de: meta.challengerName || '',
    meta: meta.targetScore ? String(meta.targetScore) : '',
  });
}

export function readQuizParams() {
  const raw = (window.location.hash || '').split('?')[1] || '';
  const params = new URLSearchParams(raw);
  return {
    invite: params.get('convite') || params.get('invite') || '',
    challenge: params.get('desafio') || params.get('challenge') || '',
  };
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../lib/api';
import { quizChallengeLink, quizInviteLink } from '../lib/share';
import type { QuizChallenge, QuizRankingRow, QuizResult } from '../types';
import type { QuizCategory, QuizQuestion } from './bank';

export const FREE_ROUNDS = 3;
export const BONUS_ROUNDS = 3;
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

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function write(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Armazenamento local é um fallback; falhar não pode interromper o quiz.
  }
}

export const weekKey = (date = new Date()) => {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

async function activeWeek() {
  const current = weekKey();
  const saved = await read(WEEK_KEY, '');
  if (saved !== current) {
    await write(WEEK_KEY, current);
    await write(ROUNDS_KEY, []);
    await write(BONUS_KEY, {});
  }
  return current;
}

export type QuizStatus = {
  used: number;
  bonus: number;
  free: number;
  remaining: number;
  online: boolean;
};

export async function localRoundStatus(): Promise<QuizStatus> {
  await activeWeek();
  const used = (await read<number[]>(ROUNDS_KEY, [])).length;
  const bonus = Number((await read<{ rounds?: number }>(BONUS_KEY, {}))?.rounds) || 0;
  return {
    used,
    bonus,
    free: FREE_ROUNDS,
    remaining: Math.max(0, FREE_ROUNDS + bonus - used),
    online: false,
  };
}

export async function roundStatus(): Promise<QuizStatus> {
  const remote = await api.quizRoundStatus();
  if (remote.online) {
    return {
      used: remote.used,
      bonus: remote.bonus,
      free: remote.free_rounds || FREE_ROUNDS,
      remaining: remote.remaining,
      online: true,
    };
  }
  return localRoundStatus();
}

async function registerLocalRound() {
  await activeWeek();
  const rounds = await read<number[]>(ROUNDS_KEY, []);
  rounds.push(Date.now());
  await write(ROUNDS_KEY, rounds);
}

export async function beginRun(run: {
  id: string;
  category: string;
  mode: string;
  total: number;
}): Promise<{ ok: boolean; online: boolean; error?: string }> {
  const remote = await api.quizBeginRun(run);
  if (remote.ok) return { ok: true, online: true };
  if (remote.error && !/offline|function|schema|not_authenticated|permission/i.test(remote.error)) {
    return { ok: false, online: true, error: remote.error };
  }
  const status = await localRoundStatus();
  if (status.remaining <= 0) return { ok: false, online: false, error: 'quiz_round_limit' };
  await registerLocalRound();
  return { ok: true, online: false };
}

export async function finishRun(runId: string, result: QuizResult, online: boolean) {
  if (online && runId) await api.quizFinishRun(runId, result);
  await saveLocalRanking(result);
  const best = Math.max(Number(await read(BEST_KEY, 0)) || 0, Number(result.score) || 0);
  await write(BEST_KEY, best);
  return best;
}

export const readBest = async () => Number(await read(BEST_KEY, 0)) || 0;

export async function claimInvite(inviter: string) {
  if (!inviter) return false;
  const already = await read(INVITE_KEY, '');
  if (already === inviter) return false;
  await write(INVITE_KEY, inviter);
  const remoteOk = await api.quizClaimInvite(inviter);
  if (remoteOk) return true;
  await activeWeek();
  const bonus = await read<{ rounds?: number }>(BONUS_KEY, {});
  bonus.rounds = (Number(bonus.rounds) || 0) + BONUS_ROUNDS;
  await write(BONUS_KEY, bonus);
  return true;
}

export async function saveMedal(categoryId: string, online: boolean) {
  if (online) await api.quizSaveMedal(categoryId);
  const medals = await read<{ category: string; createdAt?: number }[]>(MEDALS_KEY, []);
  if (!medals.some((item) => item.category === categoryId)) {
    medals.push({ category: categoryId, createdAt: Date.now() });
    await write(MEDALS_KEY, medals);
  }
  return medals;
}

export async function loadMedals(online: boolean) {
  const remote = online ? await api.quizLoadMedals() : [];
  const local = await read<{ category: string; createdAt?: number }[]>(MEDALS_KEY, []);
  const map = new Map<string, { category: string; createdAt?: number }>();
  [...local, ...remote].forEach((item) => {
    const category = item.category;
    if (!category) return;
    const raw = item as { category: string; createdAt?: number; created_at?: string };
    const createdAt = raw.createdAt ?? (raw.created_at ? new Date(raw.created_at).getTime() : undefined);
    map.set(category, { category, createdAt });
  });
  return [...map.values()];
}

export async function saveChallenge(challenge: QuizChallenge, online: boolean) {
  const all = await read<Record<string, QuizChallenge>>(CHALLENGES_KEY, {});
  all[challenge.id] = challenge;
  await write(CHALLENGES_KEY, all);
  if (online) await api.quizSaveChallenge(challenge);
  return challenge;
}

export async function fetchChallenge(id: string, online: boolean): Promise<QuizChallenge | null> {
  const all = await read<Record<string, QuizChallenge>>(CHALLENGES_KEY, {});
  if (all[id]) return all[id];
  if (!online) return null;
  return api.quizFetchChallenge(id);
}

async function saveLocalRanking(result: QuizResult) {
  if (!result?.userId) return;
  const rows = await read<any[]>(RANK_KEY, []);
  rows.unshift({
    userId: result.userId,
    name: result.name || 'Jogador',
    handle: result.handle || '',
    avatar: result.avatar || null,
    score: Number(result.score) || 0,
    bestCombo: Number(result.bestCombo) || 0,
    category: result.categoryId || 'todas',
    mode: result.mode || 'classic',
    createdAt: Date.now(),
  });
  await write(RANK_KEY, rows.slice(0, 60));
}

const rankRows = (rows: any[], limit: number): QuizRankingRow[] => {
  const best = new Map<string, any>();
  rows.forEach((row) => {
    const current = best.get(row.userId);
    if (!current || Number(row.score) > Number(current.score)) best.set(row.userId, row);
  });
  return [...best.values()]
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, limit)
    .map((row, index) => ({
      position: index + 1,
      userId: String(row.userId),
      name: String(row.name || 'Jogador'),
      handle: String(row.handle || ''),
      avatar: row.avatar || null,
      score: Number(row.score) || 0,
      rounds: Number(row.rounds) || 0,
      bestCombo: Number(row.bestCombo) || 0,
    }));
};

export async function localRankings({
  follows = [],
  me = null,
  limit = 50,
}: {
  follows?: string[];
  me?: { id?: string } | null;
  limit?: number;
}) {
  const rows = await read<any[]>(RANK_KEY, []);
  const friendsSet = new Set([...(follows || []), me?.id].filter(Boolean));
  return {
    global: rankRows(rows, limit),
    friends: rankRows(rows.filter((row) => friendsSet.has(row.userId)), limit),
  };
}

export async function rankings(context: {
  follows?: string[];
  me?: { id?: string } | null;
  limit?: number;
}) {
  const local = await localRankings(context);
  const remote = await api.quizRankings(context.limit || 50);
  return {
    global: remote.global.length ? remote.global : local.global,
    friends: remote.friends.length ? remote.friends : local.friends,
    online: Boolean(remote.global.length || remote.friends.length),
  };
}

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
} as const;

export const modeById = (id: string) => (id === 'insane' ? MODES.insane : MODES.classic);

export function runSeconds(modeId: string, size: number) {
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

export function comboFor(streak: number) {
  const value = Math.max(0, Number(streak) || 0);
  if (!value) {
    return {
      name: 'Combo perdido',
      label: 'Combo perdido',
      multiplier: 1,
      color: '#6b7186',
      next: COMBO_TIERS[0],
    };
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

export function pointsFor({
  streak,
  mode,
  timeLeft,
  perQuestion,
}: {
  streak: number;
  mode: string;
  timeLeft: number;
  perQuestion: number;
}) {
  const combo = comboFor(streak);
  const base = 100 * combo.multiplier;
  const timeBonus =
    mode === 'classic'
      ? Math.round(Math.max(0, Math.min(CLASSIC_FUSE_SECONDS, timeLeft)) * 4 * combo.multiplier)
      : Math.round(Math.max(0, perQuestion ? timeLeft / perQuestion : 0) * 6 * combo.multiplier);
  return { points: base + timeBonus, combo };
}

export const MEDAL_NAMES: Record<string, string> = {
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

export const medalName = (categoryId: string) => MEDAL_NAMES[categoryId] || 'Mestre do Quiz BOOM';

export const inviteLink = (userId: string) => quizInviteLink(userId);
export const challengeLink = (id: string) => quizChallengeLink(id);

export type { QuizCategory, QuizQuestion };

import { PUZZLES } from './puzzles.js';

export const SAVE_KEY = 'fluxo.enigmas.save.v1';
export const RANK_KEY = 'fluxo.enigmas.rank.v1';
export const TOTAL_LEVELS = PUZZLES.length;
export const POINTS_PER_LEVEL = 100;
export const POINTS_PER_HINT = 20;

export function newSave() {
  return {
    level: 1,
    score: 0,
    hints: 0,
    attempts: 0,
    finished: false,
    runId: String(Date.now()),
  };
}

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save || !Number.isFinite(save.level)) return null;
    return {
      level: Math.min(Math.max(1, Math.floor(save.level)), TOTAL_LEVELS),
      score: Number(save.score) || 0,
      hints: Number(save.hints) || 0,
      attempts: Number(save.attempts) || 0,
      finished: !!save.finished,
      runId: save.runId || String(Date.now()),
    };
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* armazenamento indisponível */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}

// Maiúsculas/minúsculas, acentos e espaços repetidos não alteram a resposta.
export function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function isCorrect(input, puzzle) {
  const given = normalizeAnswer(input);
  if (!given) return false;
  const answers = [puzzle.answer, ...(puzzle.alt || [])].map(normalizeAnswer);
  return answers.includes(given);
}

export function pointsForLevel(hintsUsed) {
  return Math.max(20, POINTS_PER_LEVEL - hintsUsed * POINTS_PER_HINT);
}

export function levelAt(index) {
  return PUZZLES[index] || null;
}

export function readRank() {
  try {
    const raw = localStorage.getItem(RANK_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeRank(list) {
  try {
    localStorage.setItem(RANK_KEY, JSON.stringify(list));
  } catch {
    /* armazenamento indisponível */
  }
}

// Registra/atualiza a melhor marca de uma partida no ranking local.
export function recordScore({ runId, name, level, score, hints }) {
  const list = readRank();
  const entry = {
    runId: runId || String(Date.now()),
    name: String(name || 'Você').slice(0, 24),
    level: Math.max(1, Math.floor(level) || 1),
    score: Math.max(0, Math.round(score) || 0),
    hints: Math.max(0, Math.round(hints) || 0),
    ts: Date.now(),
  };
  const index = list.findIndex((item) => item.runId === entry.runId);
  if (index >= 0) {
    const current = list[index];
    if (entry.level < current.level || (entry.level === current.level && entry.score <= current.score)) {
      return list;
    }
    list[index] = { ...entry, runId: current.runId };
  } else {
    list.push(entry);
  }
  list.sort((a, b) => b.level - a.level || b.score - a.score || a.hints - b.hints);
  const top = list.slice(0, 20);
  writeRank(top);
  return top;
}

export function medalFor(position) {
  return position === 0 ? '🥇' : position === 1 ? '🥈' : position === 2 ? '🥉' : '';
}

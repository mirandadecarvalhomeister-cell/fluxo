import { PUZZLES } from './puzzles.js';

export const SAVE_KEY = 'fluxo.enigmas.save.v1';
export const TOTAL_LEVELS = PUZZLES.length;
export const POINTS_PER_LEVEL = 100;
export const POINTS_PER_HINT = 20;

export function newSave() {
  return { level: 1, score: 0, hints: 0, attempts: 0, finished: false };
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

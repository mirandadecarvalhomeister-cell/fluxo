// Banco oficial do Quiz BOOM! compartilhado com o site. O Metro inclui a pasta
// src/ do projeto web via watchFolders, então as 1.300 perguntas são as mesmas.
// @ts-ignore - arquivo JavaScript compartilhado com o app web.
import {
  ALL_CATEGORY,
  CATEGORIES,
  buildRound,
  categoryById,
  poolFor,
} from '../../../src/games/quiz/bank.js';

export { ALL_CATEGORY, CATEGORIES, buildRound, categoryById, poolFor };

export type QuizCategory = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  questions: { question: string; correct: string; wrong: string[] }[];
};

export type QuizQuestion = {
  id: string;
  question: string;
  correct: string;
  wrong: string[];
  category: string;
  emoji: string;
  color: string;
  options: string[];
  answer: number;
};

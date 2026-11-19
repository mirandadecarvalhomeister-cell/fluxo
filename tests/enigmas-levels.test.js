import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLES } from '../src/games/enigmas/puzzles.js';
import {
  TOTAL_LEVELS,
  isCorrect,
  medalFor,
  normalizeAnswer,
  pointsForLevel,
} from '../src/games/enigmas/enigmasData.js';

test('o jogo tem exatamente 100 níveis em ordem sequencial', () => {
  assert.equal(PUZZLES.length, 100);
  assert.equal(TOTAL_LEVELS, 100);
  PUZZLES.forEach((puzzle, index) => assert.equal(puzzle.n, index + 1));
});

test('cada charada tem título, enunciado, resposta e dica', () => {
  for (const puzzle of PUZZLES) {
    assert.ok(puzzle.title && puzzle.title.length > 2);
    assert.ok(puzzle.text && puzzle.text.length > 10);
    assert.ok(puzzle.answer && puzzle.answer.length > 0);
    assert.ok(puzzle.hints.length >= 1);
    assert.ok(puzzle.hints.every((hint) => hint.length > 1));
  }
});

test('não há enunciados repetidos', () => {
  const texts = PUZZLES.map((puzzle) => normalizeAnswer(puzzle.text));
  assert.equal(new Set(texts).size, texts.length);
});

test('a validação ignora caixa, acento e espaços', () => {
  assert.equal(normalizeAnswer('  SÉXTA-FEIRA '), 'sextafeira');
  assert.equal(isCorrect('  RELÓGIO ', { answer: 'relógio' }), true);
  assert.equal(isCorrect('dezembro', { answer: 'Dezembro' }), true);
  assert.equal(isCorrect('17', { answer: 'dezessete', alt: ['17'] }), true);
  assert.equal(isCorrect('16', { answer: '17' }), false);
});

test('medalhas de ranking por posição', () => {
  assert.equal(medalFor(0), '🥇');
  assert.equal(medalFor(1), '🥈');
  assert.equal(medalFor(2), '🥉');
  assert.equal(medalFor(3), '');
});

test('dicas reduzem a pontuação do nível', () => {
  assert.equal(pointsForLevel(0), 100);
  assert.equal(pointsForLevel(1), 80);
  assert.equal(pointsForLevel(3), 40);
  assert.equal(pointsForLevel(10), 20);
});

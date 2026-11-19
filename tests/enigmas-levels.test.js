import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLES } from '../src/games/enigmas/puzzles.js';
import {
  TOTAL_LEVELS,
  isCorrect,
  normalizeAnswer,
  pointsForLevel,
} from '../src/games/enigmas/enigmasData.js';

test('o jogo tem exatamente 100 níveis em ordem sequencial', () => {
  assert.equal(PUZZLES.length, 100);
  assert.equal(TOTAL_LEVELS, 100);
  PUZZLES.forEach((puzzle, index) => assert.equal(puzzle.n, index + 1));
});

test('cada enigma tem título, enunciado, resposta e três dicas', () => {
  for (const puzzle of PUZZLES) {
    assert.ok(puzzle.title && puzzle.title.length > 2);
    assert.ok(puzzle.text && puzzle.text.length > 10);
    assert.ok(puzzle.answer && puzzle.answer.length > 0);
    assert.equal(puzzle.hints.length, 3);
    assert.ok(puzzle.hints.every((hint) => hint.length > 1));
  }
});

test('não há enunciados repetidos', () => {
  const texts = PUZZLES.map((puzzle) => normalizeAnswer(puzzle.text));
  assert.equal(new Set(texts).size, texts.length);
});

test('a validação ignora caixa, acento e espaços', () => {
  assert.equal(normalizeAnswer('  SÉXTA-FEIRA '), 'sexta-feira');
  assert.equal(isCorrect('  RELÓGIO ', { answer: 'relógio' }), true);
  assert.equal(isCorrect('dezembro', { answer: 'Dezembro' }), true);
  assert.equal(isCorrect('17', { answer: 'dezessete', alt: ['17'] }), true);
  assert.equal(isCorrect('16', { answer: '17' }), false);
});

test('dicas reduzem a pontuação do nível', () => {
  assert.equal(pointsForLevel(0), 100);
  assert.equal(pointsForLevel(1), 80);
  assert.equal(pointsForLevel(3), 40);
  assert.equal(pointsForLevel(10), 20);
});

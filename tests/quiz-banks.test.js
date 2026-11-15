import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES } from '../src/games/quiz/banks/index.js';

const allQuestions = CATEGORIES.flatMap((category) =>
  category.questions.map((item) => ({ ...item, category: category.id }))
);

test('o quiz tem 13 categorias com 100 perguntas cada', () => {
  assert.equal(CATEGORIES.length, 13);
  for (const category of CATEGORIES) {
    assert.equal(category.questions.length, 100, `${category.name} deveria ter 100 perguntas`);
  }
});

test('a categoria Animes está registrada', () => {
  const animes = CATEGORIES.find((category) => category.id === 'animes');
  assert.ok(animes);
  assert.equal(animes.name, 'Animes');
  assert.equal(animes.questions.length, 100);
});

test('não há perguntas repetidas entre as categorias', () => {
  const seen = new Set();
  for (const item of allQuestions) {
    assert.ok(item.question, 'pergunta vazia');
    assert.equal(seen.has(item.question), false, `pergunta repetida: ${item.question}`);
    seen.add(item.question);
  }
});

test('cada pergunta tem uma resposta certa e três erradas, todas distintas', () => {
  for (const item of allQuestions) {
    assert.ok(item.correct, `resposta certa vazia em ${item.question}`);
    assert.equal(item.wrong.length, 3, `alternativas erradas em ${item.question}`);
    const options = [item.correct, ...item.wrong];
    assert.equal(new Set(options).size, 4, `alternativas repetidas em ${item.question}`);
  }
});

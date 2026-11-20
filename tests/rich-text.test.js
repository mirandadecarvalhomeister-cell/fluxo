import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRichText, tokenize } from '../src/lib/richText.js';

test('negrito e itálico são tokenizados sem HTML', () => {
  const tokens = tokenize('olá **mundo** e *fluxo*');
  assert.equal(tokens.some((token) => token.type === 'bold' && token.value === 'mundo'), true);
  assert.equal(tokens.some((token) => token.type === 'italic' && token.value === 'fluxo'), true);
  assert.equal(tokens.some((token) => token.value.includes('<')), false);
});

test('script injetado permanece como texto simples', () => {
  const tokens = tokenize('<script>alert(1)</script>');
  assert.deepEqual(tokens, [{ type: 'text', value: '<script>alert(1)</script>' }]);
});

test('links, menções e hashtags são reconhecidos', () => {
  const tokens = tokenize('veja https://fluxo.com #vibe @ana');
  assert.equal(tokens.filter((token) => token.type === 'link').length, 1);
  assert.equal(tokens.filter((token) => token.type === 'tag').length, 2);
});

test('listas e quebras de linha são preservadas', () => {
  const lines = parseRichText('primeira\n- item um\n- item dois\núltima');
  assert.equal(lines.length, 4);
  assert.equal(lines[1].list, true);
  assert.equal(lines[2].list, true);
  assert.equal(lines[3].list, false);
});

test('formatação aninhada é tokenizada recursivamente', () => {
  const tokens = tokenize('**negrito com #tag**');
  const bold = tokens.find((token) => token.type === 'bold');
  assert.ok(bold);
  assert.equal(bold.children.some((child) => child.type === 'tag'), true);
});

test('texto vazio não gera tokens', () => {
  assert.deepEqual(tokenize(''), []);
});

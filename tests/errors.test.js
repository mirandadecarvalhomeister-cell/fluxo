import test from 'node:test';
import assert from 'node:assert/strict';
import { friendlyError } from '../src/lib/errors.js';

test('erro de rede ganha mensagem compreensível', () => {
  assert.match(friendlyError(new Error('Failed to fetch')), /Sem conexão/);
});

test('sessão expirada é explicada ao usuário', () => {
  assert.match(friendlyError({ message: 'JWT expired' }), /sessão expirou/);
});

test('permissão negada é explicada ao usuário', () => {
  assert.match(friendlyError('permission denied'), /permissão/);
});

test('erro desconhecido usa fallback', () => {
  assert.equal(friendlyError(new Error('coisa estranha'), 'Falha. Tente de novo.'), 'Falha. Tente de novo.');
});

test('erro vazio usa fallback', () => {
  assert.equal(friendlyError(null, 'Tente novamente'), 'Tente novamente');
});

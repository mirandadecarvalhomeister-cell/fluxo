import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPulse,
  applyWaves,
  qualityOf,
  waveOf,
} from '../src/lib/pulse.js';

const now = Date.UTC(2026, 0, 1, 18, 0, 0);
const HOUR = 3_600_000;

const vote = (by, optionId = 'opt-1') => ({
  id: `${by}:vote`,
  by,
  kind: 'vote',
  optionId,
  ts: now - 10 * 60_000,
});
const answer = (by, text) => ({
  id: `${by}:answer`,
  by,
  kind: 'answer',
  text,
  ts: now - 20 * 60_000,
});
const comment = (by, text) => ({ id: `${by}:c`, by, text, ts: now - 15 * 60_000 });

test('Pulso prioriza conversa de conexões em vez de curtidas vazias', () => {
  const connected = {
    id: 'a',
    by: 'friend',
    ts: now - HOUR,
    text: 'Qual a melhor forma de participar de uma votação?',
    media: [],
    likes: 2,
    interactions: [vote('u1'), vote('u2'), vote('u3')],
    comments: [comment('u1', 'Boa pergunta'), comment('u2', 'Quero saber também')],
  };
  const popular = {
    id: 'b',
    by: 'stranger',
    ts: now - 2 * HOUR,
    text: 'Foto do dia',
    media: [{ kind: 'photo', seed: 'x' }],
    likes: 400,
    interactions: [],
    comments: [],
  };
  const ranked = applyPulse([popular, connected], {
    now,
    follows: ['friend'],
    terms: ['votação'],
    comms: [],
    meId: 'me',
  });
  assert.equal(ranked[0].id, 'a');
  assert.equal(ranked[0].feedReason, 'De alguém da sua conexão');
  assert.ok(ranked[0].pulse.score > ranked[1].pulse.score);
});

test('Pulso não altera as publicações originais e é determinístico', () => {
  const posts = [
    {
      id: 'p1',
      by: 'friend',
      ts: now - 2 * HOUR,
      text: 'Pergunta sobre música',
      media: [],
      likes: 1,
      interactions: [answer('u1', 'Resposta')],
      comments: [],
    },
  ];
  const context = { now, follows: ['friend'], terms: ['música'], comms: [], meId: 'me' };
  const first = applyPulse(posts, context);
  const second = applyPulse(posts, context);
  assert.deepEqual(
    first.map((post) => post.pulse.score),
    second.map((post) => post.pulse.score)
  );
  assert.equal(posts[0].pulse, undefined);
});

test('Ondas detectam participação recente e ignoram publicação parada', () => {
  const breaking = {
    id: 'w1',
    by: 'author',
    ts: now - HOUR,
    interactions: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((by) => vote(by)),
    comments: [],
  };
  const quiet = {
    id: 'w2',
    by: 'author',
    ts: now - 30 * HOUR,
    interactions: [],
    comments: [],
  };
  assert.equal(waveOf(breaking, now).stage, 'breaking');
  assert.equal(waveOf(quiet, now).stage, 'quiet');
});

test('feed de ondas remove publicações paradas e coloca a onda forte primeiro', () => {
  const breaking = {
    id: 'w1',
    by: 'author',
    ts: now - HOUR,
    interactions: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((by) => vote(by)),
    comments: [],
    media: [],
    text: 'Enquete movimentada',
  };
  const rising = {
    id: 'w2',
    by: 'author',
    ts: now - 2 * HOUR,
    interactions: [vote('u7'), vote('u8'), vote('u9')],
    comments: [],
    media: [],
    text: 'Pergunta crescendo',
  };
  const quiet = {
    id: 'w3',
    by: 'author',
    ts: now - 40 * HOUR,
    interactions: [],
    comments: [],
    media: [],
    text: 'Publicação parada',
  };
  const list = applyWaves([quiet, rising, breaking], {
    now,
    follows: [],
    terms: [],
    comms: [],
    meId: 'me',
  });
  assert.deepEqual(
    list.map((post) => post.id),
    ['w1', 'w2']
  );
  assert.ok(list[0].feedReason);
});

test('qualidade cai com respostas repetidas e sobe com diversidade', () => {
  const distinct = {
    id: 'd',
    by: 'author',
    ts: now - HOUR,
    media: [],
    text: 'Pergunta aberta para a comunidade',
    interactions: [
      answer('u1', 'Uma ideia diferente'),
      answer('u2', 'Outra opinião valiosa'),
      answer('u3', 'Mais um ponto de vista'),
      answer('u4', 'Contribuição variada'),
    ],
    comments: [],
  };
  const repeated = {
    ...distinct,
    id: 'r',
    interactions: [
      answer('u1', 'Igual'),
      answer('u2', 'igual'),
      answer('u3', 'Igual'),
      answer('u4', 'Igual'),
    ],
  };
  assert.ok(qualityOf(distinct, now) > qualityOf(repeated, now));
});

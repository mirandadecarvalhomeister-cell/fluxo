import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERACTIVE_FORMATS,
  MAX_SCHEDULE_MINUTES,
  SCHEDULABLE_FORMATS,
  livePollStatus,
  normalizeInteractive,
  resultsReleased,
  scheduleFromDraft,
  scheduleInfo,
  scheduleOf,
  schedulePhase,
} from '../src/lib/interactive.js';

test('o formato Pergunta não é mais oferecido nem agendável', () => {
  assert.equal(INTERACTIVE_FORMATS.some((item) => item.id === 'question'), false);
  assert.equal(SCHEDULABLE_FORMATS.includes('question'), false);
});

test('publicação programada calcula prazo e liberação dos resultados', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const schedule = scheduleFromDraft(
    {
      mode: 'scheduled',
      durationValue: 2,
      durationUnit: 'hours',
      releaseMinutes: 15,
    },
    now
  );
  assert.equal(schedule.mode, 'scheduled');
  assert.equal(schedule.durationMinutes, 120);
  assert.equal(new Date(schedule.closesAt).getTime(), now + 120 * 60_000);
  assert.equal(new Date(schedule.resultsAt).getTime(), now + 135 * 60_000);
});

test('prazo nunca passa de 24 horas, mesmo em minutos ou horas', () => {
  const now = Date.now();
  const hours = scheduleFromDraft(
    { mode: 'scheduled', durationValue: 48, durationUnit: 'hours' },
    now
  );
  assert.equal(hours.durationMinutes, MAX_SCHEDULE_MINUTES);
  const minutes = scheduleFromDraft(
    { mode: 'scheduled', durationValue: 5000, durationUnit: 'minutes' },
    now
  );
  assert.equal(minutes.durationMinutes, MAX_SCHEDULE_MINUTES);
});

test('publicação comum não cria agendamento', () => {
  assert.equal(scheduleFromDraft({ mode: 'now' }), null);
  assert.equal(scheduleOf({}), null);
});

test('fases: aberta, encerrada aguardando resultados e resultados liberados', () => {
  const base = Date.UTC(2026, 0, 1, 12, 0, 0);
  const interactive = {
    format: 'poll',
    schedule: {
      mode: 'scheduled',
      durationMinutes: 60,
      releaseMinutes: 30,
      closesAt: new Date(base + 60 * 60_000).toISOString(),
      resultsAt: new Date(base + 90 * 60_000).toISOString(),
    },
  };
  assert.equal(schedulePhase(interactive, base), 'open');
  assert.equal(resultsReleased(interactive, base), false);
  assert.equal(schedulePhase(interactive, base + 61 * 60_000), 'closed');
  assert.equal(resultsReleased(interactive, base + 61 * 60_000), false);
  assert.equal(schedulePhase(interactive, base + 91 * 60_000), 'results');
  assert.equal(resultsReleased(interactive, base + 91 * 60_000), true);
});

test('scheduleInfo expõe contagem regressiva coerente', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const interactive = {
    format: 'question',
    schedule: {
      mode: 'scheduled',
      durationMinutes: 30,
      releaseMinutes: 0,
      closesAt: new Date(now + 30 * 60_000).toISOString(),
      resultsAt: new Date(now + 30 * 60_000).toISOString(),
    },
  };
  const info = scheduleInfo(interactive, now);
  assert.equal(info.scheduled, true);
  assert.equal(info.phase, 'open');
  assert.equal(info.closesIn, 30 * 60_000);
  assert.match(info.label, /Fecha em/);
});

test('normalizeInteractive aceita JSON, limita opções e preserva vínculo com a live', () => {
  const raw = JSON.stringify({
    format: 'poll',
    options: Array.from({ length: 10 }, (_, index) => ({ label: `Opção ${index}` })),
    schedule: {
      mode: 'scheduled',
      durationMinutes: 20,
      releaseMinutes: 0,
      closesAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      resultsAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    },
    live: { channelId: 'canal-1', pollId: 'enquete-1', onlyChat: false, title: 'Live' },
  });
  const interactive = normalizeInteractive(raw);
  assert.equal(interactive.format, 'poll');
  assert.equal(interactive.options.length, 6);
  assert.equal(interactive.live.channelId, 'canal-1');
  assert.equal(interactive.live.pollId, 'enquete-1');
  assert.equal(interactive.schedule.mode, 'scheduled');
});

test('enquete da live fecha pelo status ou pelo prazo', () => {
  const now = Date.now();
  assert.equal(livePollStatus(null, now), 'closed');
  assert.equal(livePollStatus({ status: 'open' }, now), 'open');
  assert.equal(
    livePollStatus({ status: 'open', closesAt: now + 60_000 }, now),
    'open'
  );
  assert.equal(
    livePollStatus({ status: 'open', closesAt: now - 1 }, now),
    'closed'
  );
  assert.equal(livePollStatus({ status: 'closed' }, now), 'closed');
});

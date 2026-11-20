import test from 'node:test';
import assert from 'node:assert/strict';
import {
  voiceReducer,
  initialVoiceState,
  gestureFromDelta,
  voiceSelectors,
  VOICE_STATE as S,
  VOICE_EVENT as E,
  CANCEL_THRESHOLD,
  LOCK_THRESHOLD,
} from '../src/lib/voiceRecording.js';

const run = (events, start = initialVoiceState()) =>
  events.reduce((state, event) => voiceReducer(state, event), start);

const press = () => ({ type: E.PRESS });
const move = (dx, dy) => ({ type: E.MOVE, dx, dy });
const release = () => ({ type: E.RELEASE });

test('1. pressionar inicia a gravação', () => {
  const state = voiceReducer(initialVoiceState(), press());
  assert.equal(state.status, S.RECORDING);
  assert.equal(state.session, 1);
  assert.equal(voiceSelectors.isRecording(state), true);
});

test('2. arrastar para a esquerda entra em CANCEL_PENDING', () => {
  const state = run([press(), move(-CANCEL_THRESHOLD - 4, 0)]);
  assert.equal(state.status, S.CANCEL_PENDING);
  assert.equal(state.cancelProgress, 1);
});

test('3. retornar o dedo antes de soltar desiste do cancelamento', () => {
  const state = run([
    press(),
    move(-CANCEL_THRESHOLD - 10, 0),
    move(-10, 0),
  ]);
  assert.equal(state.status, S.RECORDING);
  assert.equal(state.cancelProgress, 10 / CANCEL_THRESHOLD);
});

test('4. soltar dentro da lixeira descarta e volta ao IDLE', () => {
  const state = run([
    press(),
    move(-CANCEL_THRESHOLD - 10, 0),
    release(),
  ]);
  assert.equal(state.status, S.IDLE);
  assert.equal(state.session, 2);
});

test('5. arrastar para cima bloqueia a gravação', () => {
  const state = run([press(), move(0, -LOCK_THRESHOLD - 6)]);
  assert.equal(state.status, S.LOCKED_RECORDING);
  assert.equal(voiceSelectors.isLocked(state), true);
});

test('6. soltar o dedo com cadeado continua gravando', () => {
  const state = run([press(), move(0, -LOCK_THRESHOLD - 6), release()]);
  assert.equal(state.status, S.LOCKED_RECORDING);
});

test('7. definir stop na gravação bloqueada leva à REVIEW', () => {
  const state = run([
    press(),
    move(0, -LOCK_THRESHOLD - 6),
    release(),
    { type: E.TICK, elapsed: 12 },
    { type: E.STOP },
  ]);
  assert.equal(state.status, S.REVIEW);
  assert.equal(state.duration, 12);
});

test('8. soltar a gravação comum vai para REVIEW (nunca envia sozinha)', () => {
  const state = run([
    press(),
    { type: E.TICK, elapsed: 5 },
    release(),
  ]);
  assert.equal(state.status, S.REVIEW);
  assert.notEqual(state.status, S.UPLOADING);
});

test('9. enviar depende de ação explícita na REVIEW', () => {
  const reviewed = run([press(), release()]);
  assert.equal(voiceSelectors.canSend(reviewed), true);
  const uploading = voiceReducer(reviewed, { type: E.SEND });
  assert.equal(uploading.status, S.UPLOADING);
  assert.equal(voiceReducer(uploading, { type: E.SEND }).status, S.UPLOADING);
});

test('10. upload bem-sucedido chega a SENT', () => {
  const state = run([press(), release(), { type: E.SEND }, { type: E.UPLOAD_OK }]);
  assert.equal(state.status, S.SENT);
});

test('11. falha de upload é recuperável', () => {
  let state = run([press(), { type: E.TICK, elapsed: 3 }, release(), { type: E.SEND }]);
  state = voiceReducer(state, { type: E.UPLOAD_FAIL, error: 'sem rede' });
  assert.equal(state.status, S.ERROR);
  assert.equal(state.error, 'sem rede');
  state = voiceReducer(state, { type: E.RETRY });
  assert.equal(state.status, S.REVIEW);
  assert.equal(state.error, null);
});

test('12. permissão negada não deixa microfone ativo', () => {
  const pressed = voiceReducer(initialVoiceState(), press());
  const state = voiceReducer(pressed, {
    type: E.RECORD_FAILED,
    session: pressed.session,
    error: 'permissão negada',
  });
  assert.equal(state.status, S.ERROR);
  assert.equal(voiceSelectors.isRecording(state), false);
  assert.equal(voiceReducer(state, { type: E.CANCEL }).status, S.IDLE);
});

test('13. interrupção (pointercancel) descarta e gera nova sessão', () => {
  const pressed = voiceReducer(initialVoiceState(), press());
  const state = voiceReducer(pressed, { type: E.CANCEL });
  assert.equal(state.status, S.IDLE);
  assert.equal(state.session, pressed.session + 1);
});

test('14. evento assíncrono de sessão antiga é ignorado (corrida)', () => {
  const first = voiceReducer(initialVoiceState(), press());
  const second = voiceReducer(first, { type: E.CANCEL });
  const third = voiceReducer(second, press());
  const stale = voiceReducer(third, {
    type: E.RECORD_FAILED,
    session: first.session,
    error: 'antigo',
  });
  assert.equal(stale, third);
  assert.equal(stale.status, S.RECORDING);
});

test('15. áudio descartado não pode ser enviado', () => {
  const discarded = run([press(), move(-CANCEL_THRESHOLD - 4, 0), release()]);
  assert.equal(voiceReducer(discarded, { type: E.SEND }), discarded);
  assert.equal(voiceReducer(discarded, { type: E.STOP }), discarded);
});

test('16. duplo PRESS não cria gravação sobreposta', () => {
  const first = voiceReducer(initialVoiceState(), press());
  const second = voiceReducer(first, press());
  assert.equal(second, first);
  assert.equal(second.session, 1);
});

test('17. reset não interrompe upload em andamento', () => {
  const uploading = run([press(), release(), { type: E.SEND }]);
  assert.equal(voiceReducer(uploading, { type: E.RESET }), uploading);
});

test('18. cadeado tem prioridade em gesto diagonal', () => {
  assert.equal(gestureFromDelta(-CANCEL_THRESHOLD, -LOCK_THRESHOLD), 'cancel');
  assert.equal(gestureFromDelta(-1, -LOCK_THRESHOLD), 'lock');
  const state = run([press(), move(-1, -LOCK_THRESHOLD - 2)]);
  assert.equal(state.status, S.LOCKED_RECORDING);
});

test('19. mover durante LOCKED_RECORDING não altera o estado', () => {
  const locked = run([press(), move(0, -LOCK_THRESHOLD - 2)]);
  assert.equal(voiceReducer(locked, move(-CANCEL_THRESHOLD - 4, 0)), locked);
});

test('20. ciclo completo de gravação bloqueada', () => {
  const state = run([
    press(),
    move(0, -LOCK_THRESHOLD - 2),
    release(),
    { type: E.TICK, elapsed: 30 },
    { type: E.STOP },
    { type: E.SEND },
    { type: E.UPLOAD_OK },
  ]);
  assert.equal(state.status, S.SENT);
});

test('21. RESET limpa erros e prepara nova gravação', () => {
  const errored = run([
    press(),
    { type: E.RECORD_FAILED, session: 1, error: 'falha' },
  ]);
  const reset = voiceReducer(errored, { type: E.RESET });
  assert.equal(reset.status, S.IDLE);
  assert.equal(reset.error, null);
  assert.equal(reset.session, errored.session + 1);
});

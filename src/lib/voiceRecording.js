/**
 * Máquina de estados do gravador de voz VibeFluxo.
 *
 * Módulo PURO (sem React, sem DOM) para que todas as transições sejam
 * determinísticas e testáveis com `node --test`. A UI (VoiceRecorder.jsx)
 * apenas traduz eventos de ponteiro/MediaRecorder em ações despachadas aqui.
 *
 * Estados (contrato da missão):
 *   IDLE             aguardando gravação
 *   RECORDING        gravando com o botão pressionado
 *   CANCEL_PENDING   gesto de cancelamento em andamento (arraste à esquerda)
 *   LOCKED_RECORDING gravação livre, cadeado ativo, dedo pode ser solto
 *   REVIEW           gravada, aguardando revisão explícita
 *   UPLOADING        enviando
 *   SENT             enviada com sucesso
 *   ERROR            falha recuperável
 */

export const VOICE_STATE = Object.freeze({
  IDLE: 'IDLE',
  RECORDING: 'RECORDING',
  CANCEL_PENDING: 'CANCEL_PENDING',
  LOCKED_RECORDING: 'LOCKED_RECORDING',
  PAUSED: 'PAUSED',
  REVIEW: 'REVIEW',
  UPLOADING: 'UPLOADING',
  SENT: 'SENT',
  ERROR: 'ERROR',
});

export const VOICE_EVENT = Object.freeze({
  PRESS: 'PRESS',
  MOVE: 'MOVE',
  RELEASE: 'RELEASE',
  CANCEL: 'CANCEL',
  PAUSE: 'PAUSE',
  STOP: 'STOP',
  RESUME: 'RESUME',
  SEND: 'SEND',
  RETRY: 'RETRY',
  RECORD_STARTED: 'RECORD_STARTED',
  RECORD_FAILED: 'RECORD_FAILED',
  UPLOAD_OK: 'UPLOAD_OK',
  UPLOAD_FAIL: 'UPLOAD_FAIL',
  TICK: 'TICK',
  SET_DURATION: 'SET_DURATION',
  RESET: 'RESET',
});

// Distâncias em px para dispositivos com densidade variada. No mobile o
// componente multiplica por um fator de escala antes de despachar MOVE.
export const CANCEL_THRESHOLD = 96;
export const LOCK_THRESHOLD = 92;
export const MIN_DURATION_MS = 700;
export const MAX_DURATION_MS = 120_000;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function initialVoiceState() {
  return {
    status: VOICE_STATE.IDLE,
    // Token de geração: toda nova gravação incrementa. Eventos assíncronos
    // (getUserMedia/onstop/upload) com session diferente são ignorados.
    session: 0,
    elapsed: 0,
    dragX: 0,
    dragY: 0,
    cancelProgress: 0,
    lockProgress: 0,
    error: null,
    // Duração congelada no momento da parada (usada na revisão).
    duration: 0,
  };
}

const isLive = (status) =>
  status === VOICE_STATE.RECORDING ||
  status === VOICE_STATE.CANCEL_PENDING ||
  status === VOICE_STATE.LOCKED_RECORDING;

/** Prévia do gesto: calcula os progressos sem alterar o status. */
function dragMetrics(dx, dy) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  return {
    dragX: x,
    dragY: y,
    // Arrastar para a esquerda (dx negativo) aproxima da lixeira.
    cancelProgress: clamp01(-x / CANCEL_THRESHOLD),
    // Arrastar para cima (dy negativo) aproxima do cadeado.
    lockProgress: clamp01(-y / LOCK_THRESHOLD),
  };
}

/**
 * Redutor principal. Nunca lança exceção: eventos inválidos são no-ops.
 * @param {object} state estado atual
 * @param {object} event evento despachado
 */
export function voiceReducer(state, event) {
  if (!state || !event) return state || initialVoiceState();
  const { status, session } = state;
  const type = event.type;

  switch (type) {
    case VOICE_EVENT.RESET:
      // Só descarta se não houver upload em andamento (evita perder o envio).
      if (status === VOICE_STATE.UPLOADING) return state;
      return { ...initialVoiceState(), session: session + 1 };

    case VOICE_EVENT.PRESS: {
      // Pressionar durante qualquer gravação/revisão é ignorado: impede
      // gravações sobrepostas e toques repetidos (corrida de ponteiros).
      if (status !== VOICE_STATE.IDLE && status !== VOICE_STATE.SENT && status !== VOICE_STATE.ERROR) {
        return state;
      }
      return {
        ...initialVoiceState(),
        session: session + 1,
        status: VOICE_STATE.RECORDING,
      };
    }

    case VOICE_EVENT.RECORD_STARTED:
      // Confirmação do MediaRecorder. Só conta se pertencer à sessão atual.
      if (event.session !== undefined && event.session !== session) return state;
      if (!isLive(status)) return state;
      return { ...state, error: null };

    case VOICE_EVENT.RECORD_FAILED: {
      if (event.session !== undefined && event.session !== session) return state;
      if (!isLive(status)) return state;
      return {
        ...state,
        status: VOICE_STATE.ERROR,
        error: event.error || 'Não foi possível acessar o microfone.',
      };
    }

    case VOICE_EVENT.TICK: {
      if (!isLive(status)) return state;
      const seconds = Math.max(0, Math.floor(Number(event.elapsed) || 0));
      if (seconds === state.elapsed) return state;
      return { ...state, elapsed: seconds };
    }

    case VOICE_EVENT.SET_DURATION: {
      if (!isLive(status) && status !== VOICE_STATE.REVIEW && status !== VOICE_STATE.PAUSED) return state;
      const seconds = Math.max(0, Math.floor(Number(event.duration) || 0));
      return { ...state, elapsed: seconds, duration: seconds };
    }

    case VOICE_EVENT.MOVE: {
      if (status !== VOICE_STATE.RECORDING && status !== VOICE_STATE.CANCEL_PENDING) {
        // Durante LOCKED_RECORDING o dedo pode se mover livremente sem afetar.
        return state;
      }
      const metrics = dragMetrics(event.dx, event.dy);
      const reachedCancel = metrics.cancelProgress >= 1;
      const reachedLock = metrics.lockProgress >= 1 && !reachedCancel;

      // Cadeado tem prioridade sobre o cancelamento ao cruzar ambos os limites
      // no mesmo evento (gesto diagonal): evita estado ambíguo.
      if (reachedLock) {
        return {
          ...state,
          ...metrics,
          status: VOICE_STATE.LOCKED_RECORDING,
          cancelProgress: 0,
          dragX: 0,
          dragY: 0,
        };
      }
      if (reachedCancel) {
        return { ...state, ...metrics, status: VOICE_STATE.CANCEL_PENDING };
      }
      // Voltar o dedo à origem antes de soltar desiste do cancelamento.
      return { ...state, ...metrics, status: VOICE_STATE.RECORDING };
    }

    case VOICE_EVENT.RELEASE: {
      if (status === VOICE_STATE.CANCEL_PENDING) {
        // Soltar dentro da área da lixeira descarta e libera o microfone.
        return { ...initialVoiceState(), session: session + 1 };
      }
      if (status === VOICE_STATE.RECORDING) {
        // Segurar e soltar: envio imediato (sem prévia). A prévia fica só
        // para o fluxo com cadeado + pausa.
        return {
          ...state,
          status: VOICE_STATE.UPLOADING,
          duration: state.elapsed,
          dragX: 0,
          dragY: 0,
          cancelProgress: 0,
          lockProgress: 0,
        };
      }
      // LOCKED_RECORDING: soltar o dedo NÃO interrompe a gravação.
      return state;
    }

    case VOICE_EVENT.CANCEL:
      // pointercancel, troca de aba ou botão excluir: descarta sempre.
      if (status === VOICE_STATE.IDLE || status === VOICE_STATE.UPLOADING) return state;
      return { ...initialVoiceState(), session: session + 1 };

    case VOICE_EVENT.PAUSE:
      // Pausa nativa do MediaRecorder: mantém o mesmo blob e permite retomar.
      if (!isLive(status)) return state;
      return { ...state, status: VOICE_STATE.PAUSED, dragX: 0, dragY: 0, cancelProgress: 0, lockProgress: 0 };

    case VOICE_EVENT.STOP:
      if (!isLive(status) && status !== VOICE_STATE.PAUSED) return state;
      // Encerra e abre a prévia dentro da própria barra.
      return {
        ...state,
        status: VOICE_STATE.REVIEW,
        duration: state.elapsed,
        dragX: 0,
        dragY: 0,
        cancelProgress: 0,
        lockProgress: 0,
      };

    case VOICE_EVENT.RESUME:
      if (status !== VOICE_STATE.PAUSED) return state;
      return { ...state, status: VOICE_STATE.LOCKED_RECORDING, error: null };

    case VOICE_EVENT.SEND:
      // Garante que áudio descartado nunca sobe.
      if (status !== VOICE_STATE.REVIEW && status !== VOICE_STATE.PAUSED) return state;
      return { ...state, status: VOICE_STATE.UPLOADING, error: null };

    case VOICE_EVENT.UPLOAD_OK:
      if (status !== VOICE_STATE.UPLOADING) return state;
      return { ...state, status: VOICE_STATE.SENT, error: null };

    case VOICE_EVENT.UPLOAD_FAIL:
      if (status !== VOICE_STATE.UPLOADING) return state;
      return {
        ...state,
        status: VOICE_STATE.ERROR,
        error: event.error || 'Falha no envio. Tente novamente.',
      };

    case VOICE_EVENT.RETRY:
      if (status !== VOICE_STATE.ERROR) return state;
      // Volta para a prévia (pausada) para ouvir/reescrever antes de reenviar.
      return {
        ...state,
        status: state.duration ? VOICE_STATE.REVIEW : VOICE_STATE.RECORDING,
        error: null,
      };

    default:
      return state;
  }
}

/** Seletores usados pela UI. */
export const voiceSelectors = {
  isRecording: (state) => isLive(state.status),
  isLocked: (state) => state.status === VOICE_STATE.LOCKED_RECORDING,
  isCanceling: (state) => state.status === VOICE_STATE.CANCEL_PENDING,
  isReviewing: (state) =>
    state.status === VOICE_STATE.REVIEW || state.status === VOICE_STATE.PAUSED,
  isPaused: (state) => state.status === VOICE_STATE.PAUSED,
  isUploading: (state) => state.status === VOICE_STATE.UPLOADING,
  canSend: (state) =>
    state.status === VOICE_STATE.REVIEW || state.status === VOICE_STATE.PAUSED,
  canStop: (state) => isLive(state.status) || state.status === VOICE_STATE.PAUSED,
};

/**
 * Resultado dos gestos, extraído para facilitar testes de fronteira.
 * @returns {'cancel'|'lock'|null}
 */
export function gestureFromDelta(dx, dy) {
  const metrics = dragMetrics(dx, dy);
  if (metrics.cancelProgress >= 1) return 'cancel';
  if (metrics.lockProgress >= 1) return 'lock';
  return null;
}

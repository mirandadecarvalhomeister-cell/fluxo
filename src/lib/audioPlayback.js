/**
 * Coordena a reprodução de áudio em toda a aplicação.
 * Garante que no máximo um áudio toque por vez (chat, comunidade, prévia).
 */

let current = null;

export function claimPlayback(element) {
  if (!element) return;
  if (current && current !== element && !current.paused) {
    try {
      current.pause();
    } catch {
      /* elemento já removido */
    }
  }
  current = element;
}

export function releasePlayback(element) {
  if (current === element) current = null;
}

export function stopAllPlayback() {
  if (current && !current.paused) {
    try {
      current.pause();
    } catch {
      /* ignore */
    }
  }
  current = null;
}

const KEY = 'fluxo.enigmas.save.v1';

/** Lê o progresso salvo do NÍVEL ZERO para exibir a ação "Continuar". */
export function readEnigmaProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    const level = Number(save?.level);
    if (!Number.isFinite(level)) return null;
    return {
      level: Math.min(100, Math.max(1, Math.floor(level))),
      score: Number(save?.score) || 0,
      finished: !!save?.finished,
    };
  } catch {
    return null;
  }
}

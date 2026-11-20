// Reprodução exclusiva de áudio no aplicativo: no máximo um player ativo.
type Player = { pause: () => void };

let current: Player | null = null;

export function claimMobilePlayback(player: Player) {
  if (current && current !== player) {
    try { current.pause(); } catch {}
  }
  current = player;
}

export function releaseMobilePlayback(player: Player) {
  if (current === player) current = null;
}

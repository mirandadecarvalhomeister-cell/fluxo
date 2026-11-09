let audioContext = null;

function context() {
  if (typeof window === 'undefined') return null;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioContext) audioContext = new AudioCtor();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

export function playMessageSound() {
  try {
    const ctx = context();
    if (!ctx) return;
    const now = ctx.currentTime;
    [
      { at: 0, hz: 659.25 },
      { at: 0.11, hz: 987.77 },
    ].forEach(({ at, hz }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, now + at);
      gain.gain.setValueAtTime(0, now + at);
      gain.gain.linearRampToValueAtTime(0.07, now + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.24);
    });
  } catch {
    /* audio is best-effort */
  }
}

export function playSentSound() {
  try {
    const ctx = context();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(740, now + 0.08);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  } catch {
    /* audio is best-effort */
  }
}

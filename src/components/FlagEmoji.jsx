import { flagCode } from '../lib/animatedEmoji';

// Bandeiras do Noto Emoji servidas como SVG local. Algumas fontes do sistema
// mostram apenas as iniciais (BR, US…) em vez da bandeira; o SVG resolve isso.
export default function FlagEmoji({ emoji, size = 26, className = '' }) {
  const code = flagCode(emoji);
  if (!code) {
    return <span className={`flag-emoji-fallback ${className}`}>{emoji}</span>;
  }
  return (
    <img
      className={`flag-emoji ${className}`}
      src={`/emoji/flags/${code}.svg`}
      alt={emoji}
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  );
}

import { CONFETTI, fxFor } from '../lib/reactionFx';
import AnimatedEmoji from './AnimatedEmoji';

/**
 * Overlay de reação: "estorra" o emoji no centro do post por ~1,5s com uma
 * animação diferente por tipo de reação. Usa animações Lottie do Noto Emoji
 * quando disponíveis; senão cai para o Unicode com animação CSS.
 */
export default function ReactionFx({ emoji, fx }) {
  if (!emoji) return null;
  const kind = fx || fxFor(emoji);
  const Main = () => <AnimatedEmoji emoji={emoji} size={96} />;

  if (kind === 'party') {
    return (
      <div className="rfx rfx-party" aria-hidden="true">
        <span className="rfx-main rfx-pop-party"><Main /></span>
        <span className="rfx-confetti">
          {CONFETTI.map((c, i) => (
            <span key={i} style={{ '--i': i }}>{c}</span>
          ))}
        </span>
      </div>
    );
  }

  if (kind === 'clap') {
    return (
      <div className="rfx rfx-clap" aria-hidden="true">
        <span className="rfx-main rfx-clap-hands"><Main /></span>
        <span className="rfx-spark s1">✦</span>
        <span className="rfx-spark s2">✦</span>
      </div>
    );
  }

  if (kind === 'fire') {
    return (
      <div className="rfx rfx-fire" aria-hidden="true">
        <span className="rfx-main rfx-flame"><Main /></span>
        <span className="rfx-spark s1">✦</span>
        <span className="rfx-spark s2">✦</span>
        <span className="rfx-spark s3">✦</span>
      </div>
    );
  }

  if (kind === 'heart') {
    return (
      <div className="rfx rfx-heart" aria-hidden="true">
        <span className="rfx-main rfx-heartbeat"><Main /></span>
        <span className="rfx-heart-mini m1"><AnimatedEmoji emoji={emoji} size={44} /></span>
        <span className="rfx-heart-mini m2"><AnimatedEmoji emoji={emoji} size={44} /></span>
      </div>
    );
  }

  return (
    <div className={`rfx rfx-${kind}`} aria-hidden="true">
      <span className="rfx-main rfx-pop"><Main /></span>
    </div>
  );
}

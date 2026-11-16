import { CONFETTI, fxFor } from '../lib/reactionFx';

/**
 * Overlay de reação: "estorra" o emoji no centro do post por ~1,5s com uma
 * animação diferente por tipo de reação. Fica acima do conteúdo, mas não
 * intercepta cliques (pointer-events:none).
 */
export default function ReactionFx({ emoji, fx }) {
  if (!emoji) return null;
  const kind = fx || fxFor(emoji);

  if (kind === 'party') {
    return (
      <div className="rfx rfx-party" aria-hidden="true">
        <span className="rfx-main rfx-pop-party">{emoji}</span>
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
        <span className="rfx-main rfx-clap-hands">{emoji}</span>
        <span className="rfx-spark s1">✦</span>
        <span className="rfx-spark s2">✦</span>
      </div>
    );
  }

  if (kind === 'fire') {
    return (
      <div className="rfx rfx-fire" aria-hidden="true">
        <span className="rfx-main rfx-flame">{emoji}</span>
        <span className="rfx-spark s1">✦</span>
        <span className="rfx-spark s2">✦</span>
        <span className="rfx-spark s3">✦</span>
      </div>
    );
  }

  if (kind === 'heart') {
    return (
      <div className="rfx rfx-heart" aria-hidden="true">
        <span className="rfx-main rfx-heartbeat">{emoji}</span>
        <span className="rfx-heart-mini m1">{emoji}</span>
        <span className="rfx-heart-mini m2">{emoji}</span>
      </div>
    );
  }

  return (
    <div className={`rfx rfx-${kind}`} aria-hidden="true">
      <span className="rfx-main rfx-pop">{emoji}</span>
    </div>
  );
}

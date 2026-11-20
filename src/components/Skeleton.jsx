/**
 * Esqueletos de carregamento padronizados.
 * Respeitam prefers-reduced-motion via CSS e nunca simulam dados reais.
 */
export function Skeleton({ width, height = 14, radius = 8, className = '' }) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius }}
    />
  );
}

export function PostSkeleton() {
  return (
    <div className="card post-skeleton" aria-hidden="true">
      <div className="skeleton-head">
        <Skeleton width={40} height={40} radius={20} />
        <div className="skeleton-lines">
          <Skeleton width="42%" />
          <Skeleton width="26%" height={10} />
        </div>
      </div>
      <Skeleton height={12} />
      <Skeleton width="82%" height={12} />
      <Skeleton width="100%" height={190} radius={14} />
      <div className="skeleton-actions">
        <Skeleton width={70} height={10} />
        <Skeleton width={70} height={10} />
        <Skeleton width={70} height={10} />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 3 }) {
  return (
    <div className="posts" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <PostSkeleton key={index} />
      ))}
    </div>
  );
}

export default Skeleton;

export const SkeletonCards = ({ count = 6 }: { count?: number }) => (
  <div className="grid-cards" aria-busy="true" aria-label="Carregando">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card skeleton-card">
        <div className="skeleton skeleton-line" style={{ width: '60%' }} />
        <div className="skeleton skeleton-line" style={{ width: '90%' }} />
        <div className="skeleton skeleton-line" style={{ width: '40%' }} />
      </div>
    ))}
  </div>
);

export const SkeletonRows = ({ count = 4 }: { count?: number }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} aria-busy="true">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="skeleton skeleton-row" />
    ))}
  </div>
);

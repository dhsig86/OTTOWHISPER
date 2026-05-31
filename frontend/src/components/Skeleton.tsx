/**
 * Skeleton — Componente de loading shimmer reutilizável
 * 
 * Uso:
 *   <Skeleton variant="line" />           → linha de texto
 *   <Skeleton variant="line" width="60%" /> → linha de texto menor
 *   <Skeleton variant="circle" size={48} /> → avatar/ícone
 *   <Skeleton variant="card" />           → card completo
 *   <SkeletonPage />                      → página inteira
 */

interface SkeletonProps {
  variant?: 'line' | 'circle' | 'card' | 'block';
  width?: string;
  height?: string;
  size?: number;
  className?: string;
  count?: number;
}

export function Skeleton({
  variant = 'line',
  width,
  height,
  size = 40,
  className = '',
  count = 1,
}: SkeletonProps) {
  const baseClass = 'animate-pulse bg-slate-200 rounded';

  if (variant === 'circle') {
    return (
      <div
        className={`${baseClass} rounded-full shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (variant === 'card') {
    return (
      <div className={`${baseClass} rounded-2xl ${className}`} style={{ width: width || '100%', height: height || '120px' }} />
    );
  }

  if (variant === 'block') {
    return (
      <div className={`${baseClass} rounded-xl ${className}`} style={{ width: width || '100%', height: height || '80px' }} />
    );
  }

  // line (default)
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${baseClass} rounded-md`}
          style={{
            width: width || (i === count - 1 && count > 1 ? '70%' : '100%'),
            height: height || '14px',
          }}
        />
      ))}
    </div>
  );
}

/**
 * SkeletonPage — Loading state para página inteira de módulo
 * Simula um layout com header, cards e linhas de texto.
 */
export function SkeletonPage({ className = '' }: { className?: string }) {
  return (
    <div className={`w-full space-y-6 p-4 sm:p-6 animate-in fade-in duration-300 ${className}`}>
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" size={40} />
        <div className="flex-1 space-y-2">
          <Skeleton width="50%" height="16px" />
          <Skeleton width="30%" height="12px" />
        </div>
      </div>

      {/* Card skeletons */}
      <div className="space-y-4">
        <Skeleton variant="card" height="100px" className="rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton variant="card" height="80px" className="rounded-xl" />
          <Skeleton variant="card" height="80px" className="rounded-xl" />
        </div>
      </div>

      {/* Text lines */}
      <div className="space-y-3">
        <Skeleton count={3} />
        <Skeleton width="60%" />
      </div>

      {/* Action button skeleton */}
      <Skeleton variant="block" height="48px" className="rounded-xl" />
    </div>
  );
}

/**
 * SkeletonList — Loading state para lista de itens
 */
export function SkeletonList({ items = 4, className = '' }: { items?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100">
          <Skeleton variant="circle" size={36} />
          <div className="flex-1 space-y-1.5">
            <Skeleton width="65%" height="13px" />
            <Skeleton width="40%" height="11px" />
          </div>
          <Skeleton width="48px" height="24px" className="rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * SkeletonCalc — Loading state para calculadoras (CALC-HUB pattern)
 */
export function SkeletonCalc({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-5 p-4 animate-in fade-in duration-300 ${className}`}>
      {/* Title */}
      <Skeleton width="70%" height="20px" />
      <Skeleton width="90%" height="12px" />

      {/* Form fields */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton width="40%" height="12px" />
          <Skeleton variant="block" height="44px" className="rounded-lg" />
        </div>
      ))}

      {/* Submit button */}
      <Skeleton variant="block" height="48px" className="rounded-xl" />
    </div>
  );
}

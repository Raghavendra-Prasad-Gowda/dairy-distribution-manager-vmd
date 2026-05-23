/**
 * BrandedLoader — VMD's branded loading indicator.
 *
 * Replaces generic spinner circles in full-page, full-overlay, and section-level
 * loading states. Built around the milk-glass brand mark with a soft pulsing
 * halo, the business name, and a customisable status label.
 *
 * Modes:
 *   <BrandedLoader />                     centered in its parent container
 *   <BrandedLoader overlay />             fixed full-screen with backdrop
 *   <BrandedLoader label="Saving…" />     custom status label (uppercased)
 *   <BrandedLoader hideBrand />           drop the "Vikas Milk Dairy" line
 *   <BrandedLoader size="sm" />           smaller emoji + tighter spacing
 *   <BrandedLoader tone="brand" />        brand gradient background (overlay only)
 *
 * For tiny in-button spinners, keep using Loader2 — this loader is for moments
 * the user is waiting on the screen, not micro-interactions.
 */

const SIZE = {
  sm: { emoji: 'text-4xl', ring: 'w-20 h-20', title: 'text-base', label: 'text-[10px]' },
  md: { emoji: 'text-6xl', ring: 'w-32 h-32', title: 'text-lg',   label: 'text-xs' },
  lg: { emoji: 'text-7xl', ring: 'w-40 h-40', title: 'text-xl',   label: 'text-xs' },
};

function LoaderCore({ label, hideBrand, size = 'md', light = false }) {
  const s = SIZE[size] ?? SIZE.md;
  const titleColor = light ? 'text-white' : 'text-slate-800';
  const labelColor = light ? 'text-white/70' : 'text-slate-500';
  const ringTint   = light ? 'bg-white/15' : 'bg-emerald-100';

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex items-center justify-center">
        {/* Soft pulsing halo behind the glass */}
        <span
          aria-hidden="true"
          className={`absolute inline-block rounded-full ${ringTint} ${s.ring} animate-ping opacity-60`}
          style={{ animationDuration: '2.2s' }}
        />
        <span
          aria-hidden="true"
          className={`absolute inline-block rounded-full ${ringTint} ${s.ring} opacity-50`}
        />
        {/* Brand mark */}
        <span className={`relative ${s.emoji} leading-none select-none`} role="img" aria-label="Vikas Milk Dairy">
          🥛
        </span>
      </div>

      {!hideBrand && (
        <h2 className={`font-bold ${titleColor} ${s.title} leading-tight`}>Vikas Milk Dairy</h2>
      )}
      {label && (
        <p className={`font-semibold tracking-[0.18em] uppercase ${labelColor} ${s.label}`}>
          {label}
        </p>
      )}
    </div>
  );
}

export default function BrandedLoader({
  overlay      = false,
  open         = true,
  label        = 'Loading…',
  hideBrand    = false,
  size         = 'md',
  tone         = 'card',  // 'card' | 'brand' | 'transparent' — overlay only
  inlinePadY   = 'py-16',
}) {
  if (overlay && !open) return null;

  if (overlay) {
    if (tone === 'brand') {
      return (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800"
        >
          <LoaderCore label={label} hideBrand={hideBrand} size={size === 'md' ? 'lg' : size} light />
        </div>
      );
    }
    if (tone === 'transparent') {
      return (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <LoaderCore label={label} hideBrand={hideBrand} size={size} light />
        </div>
      );
    }
    // Default overlay — white card on dim backdrop
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      >
        <div className="bg-white rounded-3xl shadow-2xl px-10 py-8">
          <LoaderCore label={label} hideBrand={hideBrand} size={size} />
        </div>
      </div>
    );
  }

  // Inline mode — centered in current container
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-center ${inlinePadY}`}>
      <LoaderCore label={label} hideBrand={hideBrand} size={size} />
    </div>
  );
}

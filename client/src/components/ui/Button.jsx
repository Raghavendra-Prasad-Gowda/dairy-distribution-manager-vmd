import { Loader2 } from 'lucide-react';

const VARIANT_CLASSES = {
  primary:   'bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white border border-transparent shadow-sm',
  secondary: 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700',
  ghost:     'bg-transparent border border-slate-200 hover:bg-slate-50 text-slate-700',
  danger:    'bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white border border-transparent shadow-sm',
};

const SIZE_CLASSES = {
  sm: 'px-3 py-2 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-5 py-3 text-sm rounded-xl gap-2',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon = null,
  iconRight = false,
  children,
  className = '',
  type = 'button',
  ...rest
}) {
  const variantCls = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary;
  const sizeCls    = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const iconSize   = size === 'sm' ? 14 : 16;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed ${sizeCls} ${variantCls} ${className}`}
      {...rest}
    >
      {loading
        ? <Loader2 size={iconSize} className="animate-spin" />
        : Icon && !iconRight ? <Icon size={iconSize} /> : null}
      {children}
      {!loading && Icon && iconRight ? <Icon size={iconSize} /> : null}
    </button>
  );
}

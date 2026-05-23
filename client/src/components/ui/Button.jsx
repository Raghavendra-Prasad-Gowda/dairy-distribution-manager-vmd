import { Loader2 } from 'lucide-react';

const VARIANT_CLASSES = {
  primary:   'bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white border border-transparent shadow-sm',
  secondary: 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700',
  ghost:     'bg-transparent border border-slate-200 hover:bg-slate-50 text-slate-700',
  danger:    'bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white border border-transparent shadow-sm',
  success:   'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white border border-transparent shadow-sm',
  // Soft pill variants — light tinted background, colored text, no shadow.
  // For small inline status/action chips (e.g. "Lock", "Unlock", "Submitted").
  'soft-info':    'bg-blue-50    hover:bg-blue-100    text-blue-700    border border-blue-100',
  'soft-danger':  'bg-red-50     hover:bg-red-100     text-red-600     border border-red-100',
  'soft-warning': 'bg-amber-50   hover:bg-amber-100   text-amber-700   border border-amber-100',
  'soft-success': 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100',
  'soft-slate':   'bg-slate-100  hover:bg-slate-200   text-slate-600   border border-slate-200',
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

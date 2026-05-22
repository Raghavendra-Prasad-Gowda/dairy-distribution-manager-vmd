import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

const VARIANTS = {
  error:   { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     iconColor: 'text-red-500',     icon: AlertCircle },
  warning: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   iconColor: 'text-amber-500',   icon: AlertTriangle },
  info:    { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    iconColor: 'text-blue-500',    icon: Info },
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', iconColor: 'text-emerald-600', icon: CheckCircle2 },
};

export default function Alert({
  variant = 'info',
  title,
  children,
  className = '',
}) {
  const v = VARIANTS[variant] ?? VARIANTS.info;
  const Icon = v.icon;
  return (
    <div
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      className={`flex items-start gap-3 ${v.bg} border ${v.border} ${v.text} px-4 py-3 rounded-xl ${className}`}
    >
      <Icon size={18} className={`${v.iconColor} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0 text-sm">
        {title && <p className="font-semibold leading-tight">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}

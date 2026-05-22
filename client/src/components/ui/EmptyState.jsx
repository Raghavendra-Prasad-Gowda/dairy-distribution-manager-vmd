import { Inbox } from 'lucide-react';

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action = null,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-10 ${className}`}>
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
        <Icon size={22} />
      </div>
      {title && <p className="text-sm font-semibold text-slate-700 leading-tight">{title}</p>}
      {description && <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { getPrevDate, getNextDate, getIndiaDate } from '../utils/dateUtils';

function fmtCompact(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // e.g. "Mon, 14 Apr"
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function DateSelector({ date, onChange, showNavigation = true }) {
  const today   = getIndiaDate();
  const isToday = date === today;

  return (
    <div className="flex items-center gap-1">
      {showNavigation && (
        <button
          onClick={() => onChange(getPrevDate(date))}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
          title="Previous day"
        >
          <ChevronLeft size={17} />
        </button>
      )}

      {/* Clickable date label — wraps hidden native input */}
      <label className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-emerald-300 cursor-pointer transition select-none group">
        <Calendar size={14} className="text-slate-400 group-hover:text-emerald-500 transition flex-shrink-0" />
        <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">
          {fmtCompact(date)}
        </span>
        <input
          type="date"
          value={date}
          onChange={e => e.target.value && onChange(e.target.value)}
          max={today}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          tabIndex={-1}
        />
      </label>

      {showNavigation && (
        <button
          onClick={() => onChange(getNextDate(date))}
          disabled={isToday}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
          title="Next day"
        >
          <ChevronRight size={17} />
        </button>
      )}

      {!isToday && (
        <button
          onClick={() => onChange(today)}
          className="ml-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 px-2 py-1.5 rounded-lg hover:bg-emerald-50 transition whitespace-nowrap"
        >
          Today
        </button>
      )}
    </div>
  );
}

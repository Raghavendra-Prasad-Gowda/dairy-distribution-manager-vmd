import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { getPrevDate, getNextDate, getIndiaDate, getTomorrow } from '../utils/dateUtils';

function fmtCompact(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // e.g. "Mon, 14 Apr"
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function DateSelector({ date, onChange, showNavigation = true, dark = false }) {
  const today   = getIndiaDate();
  const maxDate = getTomorrow(); // stock entry allowed for today or tomorrow, never further out
  const isToday = date === today;
  const isAtMax = date === maxDate;

  const navBtn  = dark
    ? 'p-2 rounded-lg text-white/70 hover:bg-emerald-700 hover:text-white transition'
    : 'p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition';
  const pill    = dark
    ? 'relative flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700/50 border border-emerald-600 hover:border-emerald-400 cursor-pointer transition select-none group'
    : 'relative flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-emerald-300 cursor-pointer transition select-none group';
  const calIcon = dark ? 'text-emerald-300 flex-shrink-0' : 'text-slate-400 group-hover:text-emerald-500 transition flex-shrink-0';
  const dateText = dark ? 'text-sm font-semibold text-white whitespace-nowrap' : 'text-sm font-semibold text-slate-700 whitespace-nowrap';
  const todayBtn = dark
    ? 'ml-1 text-xs font-semibold text-emerald-200 hover:text-white px-2 py-1.5 rounded-lg hover:bg-emerald-700 transition whitespace-nowrap'
    : 'ml-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 px-2 py-1.5 rounded-lg hover:bg-emerald-50 transition whitespace-nowrap';

  return (
    <div className="flex items-center gap-1">
      {showNavigation && (
        <button onClick={() => onChange(getPrevDate(date))} className={navBtn} title="Previous day" aria-label="Previous day">
          <ChevronLeft size={17} />
        </button>
      )}

      {/* Clickable date label — wraps hidden native input */}
      <label className={pill}>
        <Calendar size={14} className={calIcon} />
        <span className={dateText}>{fmtCompact(date)}</span>
        <input
          type="date"
          value={date}
          onChange={e => e.target.value && onChange(e.target.value)}
          max={maxDate}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          tabIndex={-1}
        />
      </label>

      {showNavigation && (
        <button
          onClick={() => onChange(getNextDate(date))}
          disabled={isAtMax}
          className={`${navBtn} disabled:opacity-30 disabled:cursor-not-allowed`}
          title="Next day"
          aria-label="Next day"
        >
          <ChevronRight size={17} />
        </button>
      )}

      {!isToday && (
        <button onClick={() => onChange(today)} className={todayBtn}>
          Today
        </button>
      )}
    </div>
  );
}

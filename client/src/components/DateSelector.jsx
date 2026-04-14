import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getPrevDate, getNextDate, getIndiaDate } from '../utils/dateUtils';

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DateSelector({ date, onChange, showNavigation = true }) {
  const today = getIndiaDate();
  const isToday = date === today;

  return (
    <div className="flex items-center gap-2">
      {showNavigation && (
        <button
          onClick={() => onChange(getPrevDate(date))}
          className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
          title="Previous day"
        >
          <ChevronLeft size={16} />
        </button>
      )}

      <label className="relative flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2.5 min-w-[200px] justify-center cursor-pointer hover:border-indigo-300 transition">
        <span className="text-sm font-medium text-slate-700 select-none">
          {formatDateDisplay(date)}
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => onChange(e.target.value)}
          max={today}
          className="absolute inset-0 opacity-0 cursor-pointer w-full"
        />
      </label>

      {showNavigation && (
        <button
          onClick={() => onChange(getNextDate(date))}
          disabled={isToday}
          className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
          title="Next day"
        >
          <ChevronRight size={16} />
        </button>
      )}

      {!isToday && (
        <button
          onClick={() => onChange(today)}
          className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition"
        >
          Today
        </button>
      )}
    </div>
  );
}

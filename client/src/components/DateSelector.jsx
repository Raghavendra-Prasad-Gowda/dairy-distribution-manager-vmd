import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateDisplay, getPrevDate, getNextDate, getIndiaDate } from '../utils/dateUtils';

export default function DateSelector({ date, onChange, showNavigation = true }) {
  const today = getIndiaDate();
  const isToday = date === today;

  return (
    <div className="flex items-center gap-2">
      {showNavigation && (
        <button
          onClick={() => onChange(getPrevDate(date))}
          className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition"
          title="Previous day"
        >
          <ChevronLeft size={16} />
        </button>
      )}

      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 min-w-[200px] justify-center">
        <input
          type="date"
          value={date}
          onChange={(e) => onChange(e.target.value)}
          max={today}
          className="text-sm font-medium text-gray-700 focus:outline-none bg-transparent cursor-pointer"
        />
      </div>

      {showNavigation && (
        <button
          onClick={() => onChange(getNextDate(date))}
          disabled={isToday}
          className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
          title="Next day"
        >
          <ChevronRight size={16} />
        </button>
      )}

      {!isToday && (
        <button
          onClick={() => onChange(today)}
          className="text-xs text-teal-600 hover:text-teal-700 font-medium px-2 py-1.5 rounded-lg hover:bg-teal-50 transition"
        >
          Today
        </button>
      )}
    </div>
  );
}

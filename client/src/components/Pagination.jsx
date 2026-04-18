import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ currentPage, totalPages, startIndex, endIndex, total, onPageChange }) {
  if (total === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">
        Showing <span className="font-semibold text-slate-700">{startIndex + 1}</span>–
        <span className="font-semibold text-slate-700">{endIndex}</span> of{' '}
        <span className="font-semibold text-slate-700">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        <span className="text-sm text-slate-600 font-medium">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

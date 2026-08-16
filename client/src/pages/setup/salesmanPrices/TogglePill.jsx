export default function TogglePill({ enabled, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0 ${
        enabled ? 'bg-emerald-500' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

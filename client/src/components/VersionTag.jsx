import { APP_VERSION_LABEL, APP_BUILT_AT_LABEL } from '../utils/appVersion';

/** Build label: "v1.0.0 · a3f9c21" with the build date and time (IST) underneath. */
export default function VersionTag({ className = '' }) {
  return (
    <div className={`font-mono text-[11px] leading-snug ${className}`} data-testid="app-version">
      <p>{APP_VERSION_LABEL}</p>
      {APP_BUILT_AT_LABEL && <p className="opacity-80" data-testid="app-built-at">Built {APP_BUILT_AT_LABEL}</p>}
    </div>
  );
}

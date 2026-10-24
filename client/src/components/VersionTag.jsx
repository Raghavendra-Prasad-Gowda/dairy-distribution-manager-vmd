import { APP_VERSION_LABEL, APP_BUILT_AT } from '../utils/appVersion';

/** Small monospace build label, e.g. "v1.4.0 · a3f9c21"; hover shows the build time. */
export default function VersionTag({ className = '' }) {
  return (
    <p
      className={`font-mono text-[11px] leading-none ${className}`}
      title={APP_BUILT_AT ? `Built ${APP_BUILT_AT}` : undefined}
      data-testid="app-version"
    >
      {APP_VERSION_LABEL}
    </p>
  );
}

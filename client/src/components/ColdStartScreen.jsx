import { useEffect, useState } from 'react';
import { subscribe } from '../api/coldStart';
import BrandedLoader from './ui/BrandedLoader';

/**
 * Brand-gradient overlay shown only during the login → dashboard transition
 * when the server is cold (Render free-tier sleeps after 15 min idle, and
 * the first request can take 30-50s to wake). Armed by Login.jsx via
 * armForLogin(); auto-disarms once the screen hides, so ordinary slow
 * requests later in the session don't re-trigger it.
 */
export default function ColdStartScreen() {
  const [waking, setWaking] = useState(false);

  useEffect(() => subscribe(setWaking), []);

  if (!waking) return null;

  return (
    <BrandedLoader
      overlay
      tone="brand"
      label="Loading…"
    />
  );
}

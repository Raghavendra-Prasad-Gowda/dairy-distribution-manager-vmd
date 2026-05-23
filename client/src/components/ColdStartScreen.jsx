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
  const [longWait, setLongWait] = useState(false);

  useEffect(() => subscribe(setWaking), []);

  // After 8s of waking, escalate the message so the user knows we haven't crashed
  useEffect(() => {
    if (!waking) { setLongWait(false); return; }
    const t = setTimeout(() => setLongWait(true), 8000);
    return () => clearTimeout(t);
  }, [waking]);

  if (!waking) return null;

  return (
    <BrandedLoader
      overlay
      tone="brand"
      label={longWait ? 'Almost there — first request after sleep takes ~30s' : 'Server is waking up…'}
    />
  );
}

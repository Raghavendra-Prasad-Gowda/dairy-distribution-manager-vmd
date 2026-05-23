import { useEffect, useState } from 'react';
import { subscribe } from '../api/coldStart';
import BrandedLoader from './ui/BrandedLoader';

/**
 * Full-screen overlay that appears whenever any API request hangs past 2s
 * (Render cold-start). The brand-gradient BrandedLoader overlay is shown
 * until the request completes (success or failure). The label switches
 * after 8s to acknowledge that this is the cold-start, not a hang.
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

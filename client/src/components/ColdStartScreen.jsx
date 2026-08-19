import { useEffect, useState } from 'react';
import { subscribe } from '../api/coldStart';
import BrandedLoader from './ui/BrandedLoader';

const DOTS = ['', '.', '..', '...'];

export default function ColdStartScreen() {
  const [waking, setWaking]   = useState(false);
  const [dotIdx, setDotIdx]   = useState(0);

  useEffect(() => subscribe(setWaking), []);

  useEffect(() => {
    if (!waking) return;
    const t = setInterval(() => setDotIdx(i => (i + 1) % DOTS.length), 600);
    return () => { clearInterval(t); setDotIdx(0); };
  }, [waking]);

  if (!waking) return null;

  return (
    <BrandedLoader
      overlay
      tone="brand"
      label={`Loading${DOTS[dotIdx]}`}
    />
  );
}

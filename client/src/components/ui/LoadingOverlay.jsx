import BrandedLoader from './BrandedLoader';

/**
 * Full-screen blocker shown during saves / submits. Delegates to BrandedLoader
 * so we have one source of truth for the loading look.
 */
export default function LoadingOverlay({ open = true, message = 'Working…' }) {
  return <BrandedLoader overlay open={open} label={message} size="sm" />;
}

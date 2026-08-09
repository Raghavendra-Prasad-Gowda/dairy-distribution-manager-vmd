import { Component } from 'react';
import api from '../api/axios';

// How long the app must run without crashing before a tab's one-shot
// auto-reload guard (below) is considered "spent and safe to re-arm".
const REARM_DELAY_MS = 5000;

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, chunkError: false };
  }

  static getDerivedStateFromError(error) {
    const chunkError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('is not a valid JavaScript MIME type');
    return { hasError: true, chunkError };
  }

  // A stale-chunk error (this tab's JS references an asset hash a newer
  // deploy has already replaced) gets ONE automatic reload — see
  // componentDidCatch. That guard is a sessionStorage flag, so it used to be
  // a single lifetime attempt per browser tab: once spent (even by an
  // unrelated deploy hours earlier), every later stale-chunk hit in that same
  // tab skipped straight to the crash-report path instead of self-healing.
  //
  // Re-arm it once the app has been running cleanly for a few seconds after
  // any fresh mount (a real page load, including the one the auto-reload
  // itself triggers) — long enough to know the reload actually fixed things,
  // short enough that a genuine rapid second failure still hits the guard and
  // reports instead of looping.
  componentDidMount() {
    this._rearmTimer = setTimeout(() => {
      sessionStorage.removeItem('chunk-reload');
    }, REARM_DELAY_MS);
  }

  componentWillUnmount() {
    clearTimeout(this._rearmTimer);
  }

  componentDidCatch(error, info) {
    if (this.state.chunkError && !sessionStorage.getItem('chunk-reload')) {
      sessionStorage.setItem('chunk-reload', '1');
      window.location.reload();
      return;
    }
    // Report through the singleton axios instance so we inherit baseURL + auth
    // interceptors, per CLAUDE.md. Errors here are swallowed because the user
    // is already seeing the fallback UI — nothing useful to do if reporting fails.
    api.post('/errors/client', {
      message: error?.message ?? String(error),
      stack:   (error?.stack ?? '') + '\n\nComponent stack:' + (info?.componentStack ?? ''),
      page:    window.location.pathname,
    }).catch(() => {});
  }

  render() {
    // Once caught, never re-render the children that just threw — a
    // lazy-loaded chunk that failed once will fail identically on every
    // subsequent render. For the auto-reload path this fallback is normally
    // never seen (the page navigates away within the same tick in a real
    // browser); for the "this tab already used its one reload" path it's
    // what actually gets shown, and matters: falling through to
    // `this.props.children` here used to re-render the same broken subtree,
    // which threw again immediately, which this boundary caught again,
    // reported again, rendered again — a tight synchronous loop with no
    // circuit breaker, instead of the clean "reload" screen below.
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-red-200 p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
            <p className="text-slate-500 text-sm">An unexpected error occurred. Please reload the page.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-emerald-700 text-white rounded-xl text-sm font-semibold hover:bg-emerald-800 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

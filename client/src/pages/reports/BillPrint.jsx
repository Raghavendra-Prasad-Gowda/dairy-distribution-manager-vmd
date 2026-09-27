import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { useNotification } from '../../context/NotificationContext';
import BillSheet from '../../components/BillSheet';
import { renderBillPdf, shareBillPdf } from '../../utils/billPdf';

export default function BillPrint() {
  const { notify } = useNotification();
  const [params] = useSearchParams();
  const id = params.get('id') ?? '';

  const [bill, setBill] = useState(null);
  const [fetchError, setFetchError] = useState('');
  const [sharing, setSharing] = useState(false);
  // Holds the in-flight/resolved render so a click can reuse it instead of
  // starting a fresh one — see the pre-warming effect below.
  const renderPromiseRef = useRef(null);
  // A missing id is derivable from the URL, so it's computed here rather than
  // pushed into state from the effect below.
  const error = id ? fetchError : 'No bill specified';

  useEffect(() => {
    if (!id) return;
    api.get(`/bills/${id}`)
      .then((r) => setBill(r.data.data))
      .catch((e) => setFetchError(e.response?.data?.error ?? 'Failed to load bill'));
  }, [id]);

  // No auto-print-on-load here (unlike the other *Print.jsx pages) — this
  // page's whole point is handing the bill to a salesperson to send on, and
  // an OS print dialog popping up unasked is exactly what left them unsure
  // what to do next. Sharing and printing are both one explicit tap away
  // instead, with sharing as the obvious first move.

  // Pre-renders the share PDF in the background as soon as the bill data
  // loads, instead of waiting for the tap. iOS Safari ties navigator.share()
  // to the click that triggered it and silently refuses it (canShare comes
  // back false) once anything slower than a microtask runs first — jsPDF's
  // own dynamic import plus drawing a long bill can take a moment. Starting
  // the render early means the click handler usually just awaits an
  // already-resolved promise, so the share-sheet call stays inside the
  // gesture.
  useEffect(() => {
    if (!bill) return;
    const promise = renderBillPdf(bill);
    renderPromiseRef.current = promise;
    promise.catch(() => {
      if (renderPromiseRef.current === promise) renderPromiseRef.current = null;
    });
  }, [bill]);

  async function shareOnWhatsApp() {
    if (!bill) return;
    setSharing(true);
    await shareBillPdf({ bill, pdfPromise: renderPromiseRef.current, notify });
    setSharing(false);
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1a6e; background: #fff; }
        @media print {
          /* A4, not the pad's own small A5 slip — the bill now lists every
             product actually supplied instead of six pre-printed rows, so
             its length varies with how much was dispatched and needs the
             extra room; a long bill flows onto further A4 pages normally. */
          @page { margin: 12mm 14mm; size: A4 portrait; }
          .no-print { display: none !important; }
          .dm-bill-sheet { max-width: none; width: 100%; margin: 0; }
          /* Repeats once per printed page like a letterhead, instead of the
             screen/capture behaviour of sitting once inside the sheet. */
          .dm-bill-sheet .watermark { position: fixed; }
        }
        /* Top margin clears the fixed action bar. */
        .dm-bill-sheet { max-width: 760px; margin: 56px auto 0; }
        .actions { position: fixed; top: 12px; right: 16px; z-index: 2; display: flex; gap: 8px; }
        .action-btn { border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px;
                      font-weight: 600; cursor: pointer; font-family: Arial, Helvetica, sans-serif; }
        .action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .whatsapp-btn { background: #25d366; color: #fff; }
        .whatsapp-btn:hover:not(:disabled) { background: #1fb957; }
        .print-btn { background: #fff; color: #1a1a6e; border: 1px solid #c7cbe8 !important; }
        .print-btn:hover { background: #f4f5fb; }
        .msg { padding: 24px; text-align: center; color: #6b7280; font-family: Arial, sans-serif; }
      `}</style>

      <div className="no-print actions">
        <button className="action-btn whatsapp-btn" onClick={shareOnWhatsApp} disabled={!bill || sharing}>
          {sharing ? 'Preparing…' : '📤 Share on WhatsApp'}
        </button>
        <button className="action-btn print-btn" onClick={() => window.print()} disabled={!bill}>
          Print / Save PDF
        </button>
      </div>

      {error && <p className="msg" style={{ color: '#dc2626' }}>{error}</p>}
      {!bill && !error && <p className="msg">Loading…</p>}

      {bill && <BillSheet bill={bill} />}
    </>
  );
}

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { formatCurrency } from '../../utils/dateUtils';

const BUSINESS = 'Vikas Milk Dairy';

function fmtCrates(qty, upc) {
  const c = upc ? qty / upc : qty;
  return Number.isInteger(c) ? String(c) : c.toFixed(1);
}

function fmtPrice(p) {
  if (!p) return '—';
  return `₹${p % 1 === 0 ? p : Number(p).toFixed(2)}`;
}

function fmtLiters(qty, unitSize) {
  if (!unitSize) return null;
  const l = (qty * unitSize) / 1000;
  return Number.isInteger(l) ? String(l) : l.toFixed(2);
}

function fmtKgs(qty, unitSizeGrams) {
  if (!unitSizeGrams) return null;
  const k = (qty * unitSizeGrams) / 1000;
  return Number.isInteger(k) ? String(k) : k.toFixed(2);
}

export default function StockSummaryPrint() {
  const [params] = useSearchParams();
  const from    = params.get('from')    ?? '';
  const to      = params.get('to')      ?? '';
  const brandId = params.get('brandId') ?? '';
  const routeId = params.get('routeId') ?? '';

  const [data,  setData]  = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = [
      brandId ? `&brandId=${brandId}` : '',
      routeId ? `&routeId=${routeId}` : '',
    ].join('');
    api.get(`/reports/stock-summary?from=${from}&to=${to}${q}`)
      .then(r => setData(r.data.data))
      .catch(() => setError('Failed to load report'));
  }, []);

  useEffect(() => {
    if (data) setTimeout(() => window.print(), 400);
  }, [data]);

  const productSummary = useMemo(() => {
    if (!data?.rows) return [];
    const brandMap = new Map();

    const ensureProd = (brandName, brandDisplayOrder, catName, catDisplayOrder, productName) => {
      if (!brandMap.has(brandName)) brandMap.set(brandName, { brandDisplayOrder, categories: new Map() });
      const bm = brandMap.get(brandName);
      if (!bm.categories.has(catName)) bm.categories.set(catName, { categoryDisplayOrder: catDisplayOrder, products: new Map() });
      const cm = bm.categories.get(catName);
      if (!cm.products.has(productName)) cm.products.set(productName, { qty: 0, value: 0, upc: null, containerType: null, unitSize: null, unitSizeGrams: null, costPrice: null, displayOrder: 0 });
      return cm.products.get(productName);
    };

    for (const row of data.rows) {
      for (const r of row.receipts) {
        const cat  = r.category ?? 'General';
        const prod = ensureProd(r.brandName, r.brandDisplayOrder ?? 0, cat, r.categoryDisplayOrder ?? 999, r.productName);
        prod.qty   += r.quantity;
        prod.value += r.amount;
        if (!prod.upc && r.unitsPerContainer)         prod.upc = r.unitsPerContainer;
        if (!prod.containerType && r.containerType)   prod.containerType = r.containerType;
        if (!prod.unitSize && r.unitSize)             prod.unitSize = r.unitSize;
        if (!prod.unitSizeGrams && r.unitSizeGrams)   prod.unitSizeGrams = r.unitSizeGrams;
        if (!prod.costPrice && r.costPrice)           prod.costPrice = r.costPrice;
        if (r.displayOrder != null)           prod.displayOrder = r.displayOrder;
      }
    }

    return Array.from(brandMap.entries())
      .sort(([, a], [, b]) => a.brandDisplayOrder - b.brandDisplayOrder)
      .map(([brandName, bdata]) => {
        const categories = Array.from(bdata.categories.entries())
          .sort(([, a], [, b]) => a.categoryDisplayOrder - b.categoryDisplayOrder)
          .map(([catName, cdata]) => ({
            name: catName,
            products: Array.from(cdata.products.entries())
              .sort(([, a], [, b]) => a.displayOrder - b.displayOrder)
              .map(([productName, pd]) => {
                const isCrate = pd.containerType === 'crate';
                return {
                  productName,
                  upc:        pd.upc,
                  unitSize:   pd.unitSize,
                  unitPrice:  pd.costPrice ?? 0,
                  totalQty:   pd.qty,
                  totalValue: pd.value,
                  totalCrates: fmtCrates(pd.qty, pd.upc),
                  totalLiters: isCrate && pd.unitSize ? (pd.qty * pd.unitSize) / 1000 : null,
                  totalKgs:    isCrate && pd.unitSizeGrams ? (pd.qty * pd.unitSizeGrams) / 1000 : null,
                };
              }),
          }));

        const totalQty    = categories.reduce((s, c) => s + c.products.reduce((ss, p) => ss + p.totalQty,   0), 0);
        const totalValue  = categories.reduce((s, c) => s + c.products.reduce((ss, p) => ss + p.totalValue, 0), 0);
        const totalCrates = categories.reduce((s, c) => s + c.products.reduce((ss, p) => ss + (p.upc ? p.totalQty / p.upc : p.totalQty), 0), 0);
        const allProducts = categories.flatMap(c => c.products);
        const totalLiters = allProducts.some(p => p.totalLiters != null)
          ? allProducts.reduce((s, p) => s + (p.totalLiters ?? 0), 0)
          : null;
        const totalKgs = allProducts.some(p => p.totalKgs != null)
          ? allProducts.reduce((s, p) => s + (p.totalKgs ?? 0), 0)
          : null;
        const productCount = categories.reduce((s, c) => s + c.products.length, 0);
        return { brandName, categories, totalQty, totalValue, totalCrates, totalLiters, totalKgs, productCount };
      });
  }, [data]);

  const grandTotalCrates = productSummary.reduce((s, b) => s + b.totalCrates, 0);
  const grandTotalKgs = productSummary.some(b => b.totalKgs != null)
    ? productSummary.reduce((s, b) => s + (b.totalKgs ?? 0), 0)
    : null;
  const dateLabel = from === to ? from : `${from} to ${to}`;
  const printedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #fff; }
        @media print {
          @page { margin: 12mm 14mm; size: A4 portrait; }
          body { font-size: 9.5px; }
          .no-print { display: none !important; }
        }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; font-size: 9px; font-weight: 700; text-transform: uppercase;
             letter-spacing: 0.05em; padding: 6px 8px; border: 1px solid #d1d5db; }
        td { padding: 5px 8px; border: 1px solid #e5e7eb; vertical-align: middle; }
        tr:nth-child(even) td { background: #f9fafb; }
        .brand-row td { background: #374151 !important; color: #fff; font-weight: 700;
                        font-size: 10px; border-color: #4b5563; }
        .cat-row td   { background: #f0f0f0 !important; font-weight: 700; color: #374151;
                        font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; border-color: #d1d5db; }
        .total-row td { background: #1e293b !important; color: #fff; font-weight: 700; border-color: #334155; }
        .right { text-align: right; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
        .title  { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
        .sub    { font-size: 11px; color: #6b7280; }
        .meta   { text-align: right; font-size: 11px; line-height: 1.7; }
        .meta strong { font-weight: 700; }
        hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
        .print-btn { position: fixed; top: 12px; right: 16px; background: #059669; color: #fff;
                     border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px;
                     font-weight: 600; cursor: pointer; }
        .print-btn:hover { background: #047857; }
      `}</style>

      <button className="no-print print-btn" onClick={() => window.print()}>Print / Save PDF</button>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px' }}>

        {/* Header */}
        <div className="header">
          <div>
            <div className="title">Stock Summary Report</div>
            <div className="sub">{BUSINESS}</div>
            <div className="sub">{dateLabel}</div>
            {routeId && params.get('routeNumber') && (
              <div className="sub" style={{ fontWeight: 600, color: '#059669' }}>
                Route: {params.get('routeNumber')}
              </div>
            )}
          </div>
          <div className="meta">
            <div>Total Received: <strong>{formatCurrency(data?.grandTotalReceived ?? 0)}</strong></div>
            <div>Total Dispatched: <strong>{formatCurrency(data?.grandTotalDispatched ?? 0)}</strong></div>
            <div>Net: <strong>{formatCurrency((data?.grandTotalReceived ?? 0) - (data?.grandTotalDispatched ?? 0))}</strong></div>
          </div>
        </div>
        <hr />

        {error && <p style={{ color: 'red', padding: 12 }}>{error}</p>}
        {!data && !error && <p style={{ padding: 12, color: '#6b7280' }}>Loading…</p>}

        {data && (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', width: '30%' }}>Product</th>
                <th className="right">Qty Received</th>
                <th className="right">Liters</th>
                <th className="right">Kgs</th>
                <th className="right">Crates</th>
                <th className="right">Unit Price (₹)</th>
                <th className="right">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {productSummary.map(brand => {
                const multiCat = brand.categories.length > 1;
                return [
                  <tr key={`brand-${brand.brandName}`} className="brand-row">
                    <td colSpan={2}>
                      {brand.brandName}&nbsp;
                      <span style={{ fontWeight: 400, fontSize: 9, opacity: 0.8 }}>({brand.productCount} items)</span>
                    </td>
                    <td className="right">{brand.totalLiters != null ? (Number.isInteger(brand.totalLiters) ? brand.totalLiters : brand.totalLiters.toFixed(2)) : '—'}</td>
                    <td className="right">{brand.totalKgs != null ? (Number.isInteger(brand.totalKgs) ? brand.totalKgs : brand.totalKgs.toFixed(2)) : '—'}</td>
                    <td className="right">{Number.isInteger(brand.totalCrates) ? brand.totalCrates : brand.totalCrates.toFixed(1)}</td>
                    <td />
                    <td className="right">{formatCurrency(brand.totalValue)}</td>
                  </tr>,

                  ...brand.categories.flatMap(cat => [
                    multiCat && (
                      <tr key={`cat-${brand.brandName}-${cat.name}`} className="cat-row">
                        <td colSpan={7}>{cat.name}</td>
                      </tr>
                    ),
                    ...cat.products.map(p => (
                      <tr key={`${brand.brandName}-${cat.name}-${p.productName}`}>
                        <td>{p.productName}</td>
                        <td className="right">{p.totalQty % 1 === 0 ? p.totalQty : p.totalQty.toFixed(2)}</td>
                        <td className="right">{p.totalLiters != null ? (Number.isInteger(p.totalLiters) ? p.totalLiters : p.totalLiters.toFixed(2)) : '—'}</td>
                        <td className="right">{p.totalKgs != null ? (Number.isInteger(p.totalKgs) ? p.totalKgs : p.totalKgs.toFixed(2)) : '—'}</td>
                        <td className="right">{p.totalCrates}</td>
                        <td className="right">{fmtPrice(p.unitPrice)}</td>
                        <td className="right">{formatCurrency(p.totalValue)}</td>
                      </tr>
                    )),
                  ].filter(Boolean)),
                ];
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td>GRAND TOTAL</td>
                <td className="right">{productSummary.reduce((s, b) => s + b.totalQty, 0).toFixed(2)}</td>
                <td className="right">
                  {(() => {
                    const gl = productSummary.some(b => b.totalLiters != null)
                      ? productSummary.reduce((s, b) => s + (b.totalLiters ?? 0), 0)
                      : null;
                    return gl != null ? (Number.isInteger(gl) ? gl : gl.toFixed(2)) : '—';
                  })()}
                </td>
                <td className="right">
                  {grandTotalKgs != null ? (Number.isInteger(grandTotalKgs) ? grandTotalKgs : grandTotalKgs.toFixed(2)) : '—'}
                </td>
                <td className="right">{Number.isInteger(grandTotalCrates) ? grandTotalCrates : grandTotalCrates.toFixed(1)}</td>
                <td />
                <td className="right">{formatCurrency(data.grandTotalReceived)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af' }}>
          <span>{window.location.hostname}</span>
          <span>Printed: {printedAt}</span>
        </div>
      </div>
    </>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, LayoutGrid, Save, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import BrandedLoader from '../../components/ui/BrandedLoader';
import BrandTabs from '../../components/BrandTabs';
import api from '../../api/axios';

// ── Category row with up/down buttons ─────────────────────────────────────────
function CategoryRow({ category, isExpanded, onToggleExpand, onMoveUp, onMoveDown, isFirst, isLast, children }) {
  return (
    <div>
      <div
        className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 cursor-pointer select-none"
        onClick={onToggleExpand}
      >
        <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="text-slate-400 hover:text-emerald-600 disabled:opacity-20 disabled:cursor-not-allowed p-0.5 leading-none"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="text-slate-400 hover:text-emerald-600 disabled:opacity-20 disabled:cursor-not-allowed p-0.5 leading-none"
          >
            <ChevronDown size={14} />
          </button>
        </div>
        <span className="flex-1 text-sm font-bold text-slate-700">{category.name}</span>
        <span className="text-xs text-slate-400 ml-1">{isExpanded ? '▲' : '▼'}</span>
      </div>
      {isExpanded && (
        <div className="ml-6 mt-1 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Sortable product row ───────────────────────────────────────────────────────
function SortableProductRow({ product }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `prod-${product.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2"
    >
      <button
        {...attributes}
        {...listeners}
        style={{ touchAction: 'none' }}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing p-0.5 flex-shrink-0"
      >
        <GripVertical size={14} />
      </button>
      <span className="flex-1 text-sm text-slate-700">{product.name}</span>
      <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
        {product.unitType === 'ml'
          ? `${product.unitSize ?? '?'}ml`
          : product.unitType === 'gram'
          ? `${product.unitSize ?? '?'}g`
          : 'piece'}
      </span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LayoutSettings({ shellActiveBrandId, shellBrands } = {}) {
  const inShell = shellActiveBrandId != null;
  const { notify } = useNotification();
  const [brands, setBrands]           = useState(shellBrands ?? []);
  const [activeBrandId, setActiveBrandId] = useState(shellActiveBrandId ?? null);
  const [categories, setCategories]   = useState([]);   // [{ id, name, displayOrder }]
  const [products, setProducts]       = useState([]);   // [{ id, name, category, displayOrder, showInStockReceipt, ... }]
  const [expanded, setExpanded]       = useState({});   // { categoryName: bool }
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [dirty, setDirty]             = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    if (inShell) return;
    api.get('/brands').then(r => {
      const b = r.data.data ?? [];
      setBrands(b);
      if (b.length) setActiveBrandId(b[0].id);
    }).catch(() => notify('Failed to load brands', 'error'));
  }, []);

  useEffect(() => {
    if (inShell) { setActiveBrandId(shellActiveBrandId); setBrands(shellBrands ?? []); }
  }, [shellActiveBrandId]);

  // Load categories + products for active brand
  useEffect(() => {
    if (!activeBrandId) return;
    setLoading(true);
    Promise.all([
      api.get(`/categories?brandId=${activeBrandId}`),
      api.get(`/products?brandId=${activeBrandId}&all=true`),
    ]).then(([catRes, prodRes]) => {
      const cats = catRes.data.data ?? [];
      const prods = (prodRes.data.data ?? []).filter(p => p.isActive && p.showInStockReceipt);
      setCategories(cats);
      setProducts(prods);
      // Expand all categories by default
      const exp = {};
      cats.forEach(c => { exp[c.name] = true; });
      setExpanded(exp);
      setDirty(false);
    }).catch(() => notify('Failed to load data', 'error'))
      .finally(() => setLoading(false));
  }, [activeBrandId]);

  // Products grouped by category, sorted by the current index in the categories array
  const grouped = React.useMemo(() => {
    const catIndex = Object.fromEntries(categories.map((c, i) => [c.name, i]));
    const map = {};
    for (const p of products) {
      const key = p.category || 'Other';
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return Object.entries(map).sort(([a], [b]) => {
      const oa = catIndex[a] ?? 9999;
      const ob = catIndex[b] ?? 9999;
      return oa !== ob ? oa - ob : a.localeCompare(b);
    });
  }, [categories, products]);

  // ── Category move up/down ────────────────────────────────────────────────────
  const moveCategory = useCallback((fromVisibleIdx, direction) => {
    const toVisibleIdx = fromVisibleIdx + direction;
    const fromName = grouped[fromVisibleIdx]?.[0];
    const toName   = grouped[toVisibleIdx]?.[0];
    if (!fromName || !toName) return;
    setCategories(prev => {
      const fromIdx = prev.findIndex(c => c.name === fromName);
      const toIdx   = prev.findIndex(c => c.name === toName);
      if (fromIdx === -1 || toIdx === -1) return prev;
      return arrayMove(prev, fromIdx, toIdx);
    });
    setDirty(true);
  }, [grouped]);

  // ── Product drag-and-drop within a category ──────────────────────────────────
  const handleProductDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return;
    setProducts(prev => {
      const activeIdx = prev.findIndex(p => `prod-${p.id}` === String(active.id));
      const overIdx   = prev.findIndex(p => `prod-${p.id}` === String(over.id));
      if (activeIdx === -1 || overIdx === -1) return prev;
      return arrayMove(prev, activeIdx, overIdx);
    });
    setDirty(true);
  }, []);

  // ── Save layout ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        api.patch('/categories/reorder', categories.map((c, i) => ({ id: c.id, displayOrder: i }))),
        api.patch('/products/reorder', products.map((p, i) => ({ id: p.id, displayOrder: i }))),
      ]);
      notify('Layout saved successfully!', 'success');
      setDirty(false);
    } catch {
      notify('Failed to save layout', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-100">

      {/* ── Saving overlay ───────────────────────────────────────────────────── */}
      <LoadingOverlay open={saving} message="Saving layout…" />

      {/* ── Page header — hidden in shell mode ───────────────────────────────── */}
      {!inShell && (
        <div className="flex items-center gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
          <LayoutGrid size={17} className="text-emerald-300 flex-shrink-0" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Layout Settings</h1>
            <p className="text-emerald-300 text-xs">Drag to reorder categories and visible products.</p>
          </div>
        </div>
      )}

      {/* ── Brand selector — hidden in shell mode ────────────────────────────── */}
      {!inShell && brands.length > 0 && (
        <div className="bg-white border-b border-slate-200 px-4 pt-3 pb-0 flex-shrink-0">
          <BrandTabs brands={brands} activeBrandId={activeBrandId} onChange={setActiveBrandId} />
          <div className="h-3" />
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-2">
        {loading ? (
          <BrandedLoader />
        ) : (
          <div className="space-y-2">
            {grouped.map(([catName, catProducts], catIdx) => {
              const cat = categories.find(c => c.name === catName);
              if (!cat) return null;
              return (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  isExpanded={expanded[catName] ?? true}
                  onToggleExpand={() =>
                    setExpanded(prev => ({ ...prev, [catName]: !prev[catName] }))
                  }
                  onMoveUp={() => moveCategory(catIdx, -1)}
                  onMoveDown={() => moveCategory(catIdx, 1)}
                  isFirst={catIdx === 0}
                  isLast={catIdx === grouped.length - 1}
                >
                  {/* ── Product drag-and-drop within this category ── */}
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleProductDragEnd}>
                    <SortableContext
                      items={catProducts.map(p => `prod-${p.id}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      {catProducts.map(p => (
                        <SortableProductRow
                          key={p.id}
                          product={p}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </CategoryRow>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer / Save bar ────────────────────────────────────────────────── */}
      {!loading && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
          {dirty && (
            <p className="flex-1 text-xs text-amber-600 font-medium">Unsaved changes</p>
          )}
          {!dirty && <div className="flex-1" />}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-5 py-2.5 rounded-xl transition text-sm shadow-sm"
          >
            {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
            {saving ? 'Saving…' : 'Save Layout'}
          </button>
        </div>
      )}
    </div>
  );
}

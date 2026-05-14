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
import api from '../../api/axios';

// ── Brand row with up/down arrows ─────────────────────────────────────────────
function BrandOrderRow({ brand, onMoveUp, onMoveDown, isFirst, isLast }) {
  return (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="flex flex-col gap-0.5">
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
      <span className="flex-1 text-sm font-bold text-slate-800">{brand.name}</span>
      <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
        Position {brand._order + 1}
      </span>
    </div>
  );
}

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
export default function LayoutSettings() {
  const { notify } = useNotification();
  const [brands, setBrands]               = useState([]);   // [{ id, name, displayOrder, _order }]
  const [activeBrandId, setActiveBrandId] = useState(null);
  const [categories, setCategories]       = useState([]);   // [{ id, name, displayOrder }]
  const [products, setProducts]           = useState([]);   // [{ id, name, category, displayOrder, ... }]
  const [expanded, setExpanded]           = useState({});   // { categoryName: bool }
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [dirty, setDirty]                 = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Load brands (sorted by displayOrder)
  useEffect(() => {
    api.get('/brands').then(r => {
      const b = (r.data.data ?? []).map((br, i) => ({ ...br, _order: i }));
      setBrands(b);
      if (b.length) setActiveBrandId(b[0].id);
    }).catch(() => notify('Failed to load brands', 'error'));
  }, []);

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

  // ── Brand move up/down ───────────────────────────────────────────────────────
  const moveBrand = useCallback((fromIdx, direction) => {
    const toIdx = fromIdx + direction;
    setBrands(prev => {
      const next = arrayMove(prev, fromIdx, toIdx).map((b, i) => ({ ...b, _order: i }));
      return next;
    });
    setDirty(true);
  }, []);

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
      const brandOrders    = brands.map((b, i) => ({ id: b.id, displayOrder: i }));
      const categoryOrders = categories.map((c, i) => ({ id: c.id, displayOrder: i }));
      const productOrders  = products.map((p, i) => ({ id: p.id, displayOrder: i }));

      await Promise.all([
        api.patch('/brands/reorder', brandOrders),
        api.patch('/categories/reorder', categoryOrders),
        api.patch('/products/reorder', productOrders),
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
      {saving && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Saving layout…</p>
          </div>
        </div>
      )}

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <LayoutGrid size={17} className="text-emerald-300 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Layout Settings</h1>
          <p className="text-emerald-300 text-xs">Configure display order for brands, categories, and products.</p>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">

        {/* ── Brand order section ──────────────────────────────────────────── */}
        {brands.length > 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1">Brand Order</span>
              <span className="text-[11px] text-slate-400">Drag ↕ arrows to reorder</span>
            </div>
            <div className="p-3 space-y-2">
              {brands.map((brand, idx) => (
                <BrandOrderRow
                  key={brand.id}
                  brand={brand}
                  onMoveUp={() => moveBrand(idx, -1)}
                  onMoveDown={() => moveBrand(idx, 1)}
                  isFirst={idx === 0}
                  isLast={idx === brands.length - 1}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Category & product order per brand ───────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1">Categories &amp; Products</span>
            <span className="text-[11px] text-slate-400">↕ arrows for categories · drag for products</span>
          </div>

          {/* Brand tabs */}
          {brands.length > 1 && (
            <div className="flex gap-2 px-4 pt-3 pb-1 border-b border-slate-100 overflow-x-auto">
              {brands.map(b => (
                <button
                  key={b.id}
                  onClick={() => setActiveBrandId(b.id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition flex-shrink-0 ${
                    activeBrandId === b.id
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}

          <div className="p-3 space-y-2">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
              </div>
            ) : grouped.length === 0 ? (
              <p className="py-8 text-center text-slate-400 text-sm">No products configured for this brand.</p>
            ) : (
              grouped.map(([catName, catProducts], catIdx) => {
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
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleProductDragEnd}>
                      <SortableContext
                        items={catProducts.map(p => `prod-${p.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        {catProducts.map(p => (
                          <SortableProductRow key={p.id} product={p} />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </CategoryRow>
                );
              })
            )}
          </div>
        </div>
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

import React, { useState, useEffect, useMemo } from 'react';
import { Save, IndianRupee, Search, X, Globe, Edit2, Copy, AlertCircle, Clock, Eye, Trash2, Loader2, Package, ChevronDown, ChevronUp } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import Pagination from '../../components/Pagination';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import BrandedLoader from '../../components/ui/BrandedLoader';
import { useNotification } from '../../context/NotificationContext';
import { getIndiaDate, formatDateShort } from '../../utils/dateUtils';
import api from '../../api/axios';

const ITEMS_PER_PAGE = 10;
const GLOBAL_ID = 'global';

function TogglePill({ enabled, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0 ${
        enabled ? 'bg-emerald-500' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function SalesmanPricesSetup() {
  const { notify } = useNotification();
  const [salespeople, setSalespeople]       = useState([]);
  const [selectedSpId, setSelectedSpId]     = useState('');
  const [brands, setBrands]                 = useState([]);
  const [activeBrandId, setActiveBrandId]   = useState(null);

  // Per-person state
  const [prices, setPrices]                 = useState([]);
  const [dirtyToggles, setDirtyToggles]     = useState({});
  // Product-centric view state
  const [productView, setProductView]       = useState([]);
  // Per-row price edit modal
  const [editingPrice, setEditingPrice]     = useState(null); // { productId, productName, currentPrice }
  const [priceForm, setPriceForm]           = useState({ sellingPrice: '', effectiveFrom: getIndiaDate() });
  const [savingPrice, setSavingPrice]       = useState(false);
  // Price history modal
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  // Copy prices modal
  const [copyFromSpId, setCopyFromSpId]     = useState('');
  const [showCopyModal, setShowCopyModal]   = useState(false);
  const [copyingPrices, setCopyingPrices]   = useState(false);
  const [copyPricesSearch, setCopyPricesSearch] = useState('');
  // Bulk update prices modal
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);
  const [bulkUpdateForm, setBulkUpdateForm] = useState({
    selectedSalesmen: new Set(),
    productPrices: [], // Array of { productId, productName, sellingPrice }
    effectiveFrom: getIndiaDate(),
  });
  const [updatingBulkPrices, setUpdatingBulkPrices] = useState(false);
  const [bulkUpdateProductSearch, setBulkUpdateProductSearch] = useState('');
  const [bulkUpdateSalesmenSearch, setBulkUpdateSalesmenSearch] = useState('');
  const [pendingProductSelection, setPendingProductSelection] = useState(''); // Temp for selecting product to add
  // Clear custom prices
  const [clearingProductId, setClearingProductId] = useState(null);

  // Global state
  const [globalProducts, setGlobalProducts] = useState([]);
  const [dirtyGlobal, setDirtyGlobal]       = useState({});
  const [dirtyGlobalPrices, setDirtyGlobalPrices] = useState({});
  // View all salesmen prices modal
  const [showAllSalesmenPrices, setShowAllSalesmenPrices] = useState(false);
  // Clear all salesman prices
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [clearingAllPrices, setClearingAllPrices] = useState(false);

  // Bulk enable/disable products
  const [showBulkProductModal, setShowBulkProductModal] = useState(false);
  const [bulkProductForm, setBulkProductForm] = useState({
    selectedSalesmen: new Set(),
    selectedProducts: new Set(),
    action: 'enable',
  });
  const [updatingBulkProducts, setUpdatingBulkProducts] = useState(false);
  const [bulkProductSearch, setBulkProductSearch] = useState('');
  const [expandedBrand, setExpandedBrand] = useState(null);

  const [showEnabledOnly, setShowEnabledOnly] = useState(
    () => localStorage.getItem('sp_showEnabledOnly') !== 'false'
  );
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [spSearch, setSpSearch]             = useState('');  // Salesperson search
  const [search, setSearch]                 = useState('');  // Product search
  const [currentPage, setCurrentPage]       = useState(1);
  const [viewMode, setViewMode]             = useState('salesman'); // 'salesman' or 'product'

  const isGlobal = selectedSpId === GLOBAL_ID;

  useEffect(() => {
    Promise.all([api.get('/salespeople?all=true'), api.get('/brands')])
      .then(([spRes, brandRes]) => {
        const sp = spRes.data.data.filter(s => s.isActive);
        setSalespeople(sp);
        if (sp.length) setSelectedSpId(String(sp[0].id));
        const b = brandRes.data.data;
        setBrands(b);
        if (b.length) setActiveBrandId(b[0].id);
      })
      .catch(() => notify('Failed to load data', 'error'));
  }, []);

  useEffect(() => {
    if (!selectedSpId) return;
    if (isGlobal) {
      fetchGlobal();
      fetchProductView();
    } else {
      fetchPrices();
    }
    setSearch('');
    setCurrentPage(1);
  }, [selectedSpId, activeBrandId]);

  useEffect(() => {
    setSearch('');
    setCurrentPage(1);
  }, [activeBrandId]);

  useEffect(() => { setCurrentPage(1); }, [search]);

  async function fetchPrices() {
    setLoading(true);
    try {
      const r = await api.get(`/salespeople/${selectedSpId}/prices`);
      setPrices(r.data.data);
      setDirtyToggles({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Per-row price edit ────────────────────────────────────────────────────────
  function openPriceEdit(p) {
    setEditingPrice({
      productId:             p.productId,
      productName:           p.productName,
      brandName:             p.brandName,
      category:              p.category,
      currentPrice:          p.sellingPrice,
      currentEffective:      p.effectiveFrom,
      upcomingPrice:         p.upcomingSellingPrice,
      upcomingEffective:     p.upcomingEffectiveFrom,
      dairyCostPrice:        p.dairyCostPrice,
      dairySellingPrice:     p.dairySellingPrice,
      unitType:              p.unitType,
      unitSize:              p.unitSize,
      containerType:         p.containerType,
      unitsPerContainer:     p.unitsPerContainer,
    });
    setPriceForm({
      sellingPrice: p.sellingPrice != null ? String(p.sellingPrice) : '',
      effectiveFrom: getIndiaDate(),
    });
  }
  function closePriceEdit() {
    setEditingPrice(null);
    setSavingPrice(false);
  }
  async function handleSavePrice(e) {
    e.preventDefault();
    const price = parseFloat(priceForm.sellingPrice);
    if (!(price >= 0)) { notify('Enter a valid price', 'warning'); return; }
    setSavingPrice(true);
    notify('Updating price…', 'loading');
    try {
      await api.post(`/salespeople/${selectedSpId}/prices/bulk`, {
        effectiveFrom: priceForm.effectiveFrom,
        prices: [{ productId: editingPrice.productId, sellingPrice: price, effectiveFrom: priceForm.effectiveFrom }],
      });
      notify('Price updated', 'success');
      closePriceEdit();
      fetchPrices();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to save price', 'error');
      setSavingPrice(false);
    }
  }

  async function fetchGlobal() {
    setLoading(true);
    try {
      const r = await api.get('/products/salesperson-global');
      setGlobalProducts(r.data.data);
      setDirtyGlobal({});
      setDirtyGlobalPrices({});
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load global products', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchProductView() {
    setLoading(true);
    try {
      // Fetch all prices for all salespeople for this brand
      const promises = salespeople.map(sp =>
        api.get(`/salespeople/${sp.id}/prices`).then(r => ({ spId: sp.id, spName: sp.name, data: r.data.data }))
      );
      const results = await Promise.all(promises);

      // Reorganize by product
      const productMap = {};
      results.forEach(({ spId, spName, data }) => {
        data.forEach(p => {
          if (p.brandId !== activeBrandId) return;
          if (!productMap[p.productId]) {
            productMap[p.productId] = {
              productId: p.productId,
              productName: p.productName,
              brandId: p.brandId,
              category: p.category,
              categoryDisplayOrder: p.categoryDisplayOrder ?? 999,
              displayOrder: p.displayOrder ?? 999,
              dairyCostPrice: p.dairyCostPrice,
              dairySellingPrice: p.dairySellingPrice,
              salespersonPrices: {},
            };
          }
          productMap[p.productId].salespersonPrices[spId] = {
            spId,
            spName,
            sellingPrice: p.sellingPrice,
            isEnabled: p.isEnabled,
          };
        });
      });

      setProductView(Object.values(productMap).sort((a, b) =>
        a.categoryDisplayOrder - b.categoryDisplayOrder ||
        a.displayOrder - b.displayOrder ||
        a.productName.localeCompare(b.productName)
      ));
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to load product view', 'error');
    } finally {
      setLoading(false);
    }
  }

  const handleToggle = (productId, currentEnabled, isGloballyDisabled) => {
    if (isGloballyDisabled && !currentEnabled) {
      notify('This product is disabled globally. Enable it in Global Settings first.', 'warning');
      return;
    }
    const newValue = !currentEnabled;
    setDirtyToggles(prev => ({ ...prev, [productId]: newValue }));
    setPrices(prev => prev.map(p => p.productId === productId ? { ...p, isEnabled: newValue } : p));
  };

  async function handleCopyPrices() {
    if (!copyFromSpId) { notify('Select a salesman to copy from', 'warning'); return; }
    setCopyingPrices(true);
    notify('Copying prices…', 'loading');
    try {
      await api.post(`/salespeople/${selectedSpId}/prices/copy-from/${copyFromSpId}?brandId=${activeBrandId}`);
      notify('Prices copied successfully', 'success');
      setShowCopyModal(false);
      setCopyFromSpId('');
      fetchPrices();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to copy prices', 'error');
      setCopyingPrices(false);
    }
  }

  const handleGlobalToggle = (productId, currentEnabled) => {
    // Prevent enabling without a default price set
    if (!currentEnabled) {  // Trying to enable
      const product = globalProducts.find(p => p.productId === productId);
      const priceValue = dirtyGlobalPrices[productId] !== undefined
        ? dirtyGlobalPrices[productId]
        : product.salespersonDefaultPrice;

      if (!priceValue || priceValue <= 0) {
        notify('Set a default price before enabling this product', 'warning');
        return;
      }
    }

    const newValue = !currentEnabled;
    setDirtyGlobal(prev => ({ ...prev, [productId]: newValue }));
    setGlobalProducts(prev => prev.map(p => p.productId === productId ? { ...p, salespersonEnabled: newValue } : p));
  };

  const handleGlobalPriceChange = (productId, value) => {
    const price = value === '' ? null : parseFloat(value);
    setDirtyGlobalPrices(prev => ({ ...prev, [productId]: price }));
    setGlobalProducts(prev => prev.map(p =>
      p.productId === productId ? { ...p, salespersonDefaultPrice: price } : p
    ));
  };

  const handleBulkSalesmenToggle = (spId) => {
    setBulkUpdateForm(prev => {
      const newSet = new Set(prev.selectedSalesmen);
      if (newSet.has(spId)) {
        newSet.delete(spId);
      } else {
        newSet.add(spId);
      }
      return { ...prev, selectedSalesmen: newSet };
    });
  };

  const addProductToUpdate = (productId) => {
    const product = globalProducts.find(p => String(p.productId) === String(productId));
    if (!product) return;

    const exists = bulkUpdateForm.productPrices.some(p => String(p.productId) === String(productId));
    if (exists) {
      notify('Product already added', 'warning');
      return;
    }

    setBulkUpdateForm(prev => ({
      ...prev,
      productPrices: [...prev.productPrices, {
        productId: product.productId,
        productName: product.productName,
        category: product.category,
        dairyCostPrice: product.dairyCostPrice,
        dairySellingPrice: product.dairySellingPrice,
        salespersonSellingPrice: '',
      }],
    }));
    setBulkUpdateProductSearch('');
    setPendingProductSelection('');
  };

  const removeProductFromUpdate = (index) => {
    setBulkUpdateForm(prev => ({
      ...prev,
      productPrices: prev.productPrices.filter((_, i) => i !== index),
    }));
  };

  const updateProductPrice = (index, price) => {
    setBulkUpdateForm(prev => {
      const updated = [...prev.productPrices];
      updated[index].salespersonSellingPrice = price;
      return { ...prev, productPrices: updated };
    });
  };

  async function handleBulkUpdate() {
    if (bulkUpdateForm.selectedSalesmen.size === 0) {
      notify('Select at least one salesman', 'warning');
      return;
    }
    if (bulkUpdateForm.productPrices.length === 0) {
      notify('Add at least one product', 'warning');
      return;
    }

    for (const p of bulkUpdateForm.productPrices) {
      if (p.salespersonSellingPrice === '') {
        notify(`Enter salesman price for ${p.productName}`, 'warning');
        return;
      }
      const price = parseFloat(p.salespersonSellingPrice);
      if (!(price >= 0)) {
        notify(`Invalid price for ${p.productName}`, 'warning');
        return;
      }
    }

    setUpdatingBulkPrices(true);
    notify('Updating prices…', 'loading');
    try {
      await api.post('/salespeople/bulk-update', {
        salespersonIds: Array.from(bulkUpdateForm.selectedSalesmen),
        productPrices: bulkUpdateForm.productPrices.map(p => ({
          productId: parseInt(p.productId, 10),
          sellingPrice: parseFloat(p.salespersonSellingPrice),
        })),
        effectiveFrom: bulkUpdateForm.effectiveFrom,
      });
      notify(`Prices updated for ${bulkUpdateForm.selectedSalesmen.size} salesmen and ${bulkUpdateForm.productPrices.length} products`, 'success');
      setShowBulkUpdateModal(false);
      setBulkUpdateForm({
        selectedSalesmen: new Set(),
        productPrices: [],
        effectiveFrom: getIndiaDate(),
      });
      setUpdatingBulkPrices(false);
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to update prices', 'error');
      setUpdatingBulkPrices(false);
    }
  }

  const handleBulkProductUpdate = async () => {
    if (bulkProductForm.selectedSalesmen.size === 0) {
      notify('Select at least one salesman', 'warning');
      return;
    }
    if (bulkProductForm.selectedProducts.size === 0) {
      notify('Select at least one product', 'warning');
      return;
    }

    setUpdatingBulkProducts(true);
    notify('Updating product access…', 'loading');
    try {
      await api.post('/salespeople/products/bulk-update', {
        salespersonIds: Array.from(bulkProductForm.selectedSalesmen),
        products: Array.from(bulkProductForm.selectedProducts).map(prodId => ({
          productId: prodId,
          isEnabled: bulkProductForm.action === 'enable',
        })),
      });

      notify(`Products ${bulkProductForm.action}d for ${bulkProductForm.selectedSalesmen.size} salesman(men)`, 'success');
      setShowBulkProductModal(false);
      setBulkProductForm({
        selectedSalesmen: new Set(),
        selectedProducts: new Set(),
        action: 'enable',
      });
      setBulkProductSearch('');
      setExpandedBrand(null);
      // Refresh the product view
      if (selectedSpId && selectedSpId !== GLOBAL_ID) {
        fetchPrices(selectedSpId);
      } else if (isGlobal) {
        fetchGlobal();
      }
    } catch (err) {
      notify(err.response?.data?.error ?? `Failed to ${bulkProductForm.action} products`, 'error');
    } finally {
      setUpdatingBulkProducts(false);
    }
  };

  const handleSave = async () => {
    if (isGlobal) {
      const changedToggles = Object.keys(dirtyGlobal);
      const changedPrices = Object.keys(dirtyGlobalPrices);
      const allChanged = new Set([...changedToggles, ...changedPrices]);
      if (!allChanged.size) { notify('No changes to save', 'warning'); return; }

      // Validate: enabled products must have valid default prices
      const productsToSave = Array.from(allChanged).map(id => {
        const productId = parseInt(id, 10);
        const obj = { productId };
        if (changedToggles.includes(id)) obj.isEnabled = dirtyGlobal[id];
        if (changedPrices.includes(id)) obj.defaultPrice = dirtyGlobalPrices[id];
        return obj;
      });

      // Check each product being enabled and include its default price
      for (const prod of productsToSave) {
        if (prod.isEnabled === true) {
          const priceValue = prod.defaultPrice !== undefined
            ? prod.defaultPrice
            : globalProducts.find(p => p.productId === prod.productId)?.salespersonDefaultPrice;

          if (!priceValue || priceValue <= 0) {
            notify(`Set a valid default price for product before enabling`, 'error');
            return;
          }
          // Include the price in the payload even if it wasn't changed
          if (prod.defaultPrice === undefined) {
            prod.defaultPrice = priceValue;
          }
        }
      }

      setSaving(true);
      notify('Saving global settings…', 'loading');
      try {
        await api.patch('/products/salesperson-global', {
          products: productsToSave
        });
        notify('Global settings saved', 'success');
        fetchGlobal();
      } catch (e) {
        notify(e.response?.data?.error ?? 'Failed to save', 'error');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Per-person mode now only bulk-saves enable/disable toggles.
    // Price edits go through the per-row pencil modal (handleSavePrice).
    const hasToggleChanges = Object.keys(dirtyToggles).length > 0;
    if (!hasToggleChanges) { notify('No changes to save', 'warning'); return; }

    setSaving(true);
    notify('Saving…', 'loading');
    try {
      await api.post(`/salespeople/${selectedSpId}/products/bulk`, {
        products: Object.keys(dirtyToggles).map(id => ({
          productId: parseInt(id, 10),
          isEnabled: dirtyToggles[id],
        })),
      });
      notify('Saved successfully', 'success');
      fetchPrices();
    } catch (e) {
      notify(e.response?.data?.error ?? 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCustomPrices = async (productId) => {
    const product = globalProducts.find(p => p.productId === productId);
    if (!product) return;

    const confirmed = window.confirm(
      `Clear all custom prices for "${product.productName}"?\n\nAll salesmen will use the global default of ₹${Number(product.salespersonDefaultPrice).toFixed(2)}.`
    );
    if (!confirmed) return;

    setClearingProductId(productId);
    notify('Clearing prices…', 'loading');
    try {
      const response = await api.delete(`/products/${productId}/salesperson-prices`);
      notify(response.data.data.message, 'success');
      fetchGlobal();
    } catch (e) {
      notify(e.response?.data?.data?.message || e.response?.data?.error || 'Failed to clear prices', 'error');
    } finally {
      setClearingProductId(null);
    }
  };

  const handleClearAllSalesmanPrices = async () => {
    setClearingAllPrices(true);
    notify('Clearing all salesman prices…', 'loading');
    try {
      const brandProducts = globalProducts.filter(p => p.brandId === activeBrandId);
      const allClearedSalespersonIds = new Set();

      for (const product of brandProducts) {
        try {
          const response = await api.delete(`/products/${product.productId}/salesperson-prices`);
          const ids = response.data.data.clearedSalespersonIds || [];
          ids.forEach(id => allClearedSalespersonIds.add(id));
        } catch (err) {
          console.error(`Failed to clear prices for product ${product.productId}:`, err);
        }
      }

      const uniqueSalesmenCount = allClearedSalespersonIds.size;
      notify(`Cleared all custom prices for ${uniqueSalesmenCount} unique salesmen across ${brandProducts.length} products`, 'success');
      setShowClearAllConfirm(false);
      fetchGlobal();
      fetchProductView();
    } catch (e) {
      notify('Failed to clear all prices', 'error');
    } finally {
      setClearingAllPrices(false);
    }
  };

  // ── Filter + category-aware pagination ────────────────────────────────────────
  const filteredGrouped = useMemo(() => {
    const source = isGlobal ? globalProducts : prices;
    const brandItems = source
      .filter(p => p.brandId === activeBrandId)
      .filter(p => isGlobal || !showEnabledOnly || p.isEnabled || dirtyToggles[p.productId] !== undefined);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? brandItems.filter(p =>
          p.productName.toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q)
        )
      : brandItems;

    // Sort by layout display order (category order → product order → name)
    const sorted = [...filtered].sort((a, b) =>
      (a.categoryDisplayOrder ?? 999) - (b.categoryDisplayOrder ?? 999) ||
      (a.displayOrder ?? 999) - (b.displayOrder ?? 999) ||
      a.productName.localeCompare(b.productName)
    );

    const grouped = sorted.reduce((acc, p) => {
      const key = p.category || 'Uncategorised';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {});

    return Object.entries(grouped);
  }, [isGlobal, globalProducts, prices, activeBrandId, search, showEnabledOnly, dirtyToggles]);

  const totalFiltered = filteredGrouped.reduce((s, [, arr]) => s + arr.length, 0);

  const pages = useMemo(() => {
    const result = [];
    let page = [];
    let count = 0;
    filteredGrouped.forEach(([cat, items]) => {
      if (count + items.length > ITEMS_PER_PAGE && count > 0) {
        result.push(page); page = []; count = 0;
      }
      page.push([cat, items]);
      count += items.length;
    });
    if (page.length) result.push(page);
    return result;
  }, [filteredGrouped]);

  const totalPages  = Math.max(1, pages.length);
  const pageGroups  = pages[currentPage - 1] ?? [];
  const startIdx    = pages.slice(0, currentPage - 1).reduce((s, p) => s + p.reduce((a, [, it]) => a + it.length, 0), 0);
  const endIdx      = startIdx + pageGroups.reduce((s, [, it]) => s + it.length, 0);

  const handleToggleAllGlobal = (enable) => {
    const brandItems = globalProducts.filter(p => p.brandId === activeBrandId);
    const updates = {};
    brandItems.forEach(p => { updates[p.productId] = enable; });
    setDirtyGlobal(prev => ({ ...prev, ...updates }));
    setGlobalProducts(prev => prev.map(p =>
      p.brandId === activeBrandId ? { ...p, salespersonEnabled: enable } : p
    ));
  };

  const brandGlobalItems  = globalProducts.filter(p => p.brandId === activeBrandId);
  const allBrandEnabled   = brandGlobalItems.length > 0 && brandGlobalItems.every(p => p.salespersonEnabled);
  const allBrandDisabled  = brandGlobalItems.length > 0 && brandGlobalItems.every(p => !p.salespersonEnabled);

  const hasDirty = isGlobal
    ? Object.keys(dirtyGlobal).length > 0 || Object.keys(dirtyGlobalPrices).length > 0
    : Object.keys(dirtyToggles).length > 0;

  const selectedSp = salespeople.find(s => String(s.id) === String(selectedSpId));
  const fmt = v => v > 0 ? `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—';

  const colSpan = isGlobal ? 5 : 10;

  // Filter salespeople for sidebar
  const filteredSalespeople = useMemo(() => {
    const q = spSearch.trim().toLowerCase();
    if (!q) return salespeople;
    return salespeople.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.route ?? '').toLowerCase().includes(q)
    );
  }, [salespeople, spSearch]);

  // Render salesperson row in sidebar
  function SpRow({ sp }) {
    const isSelected = String(sp.id) === String(selectedSpId);
    return (
      <button
        type="button"
        onClick={() => {
          setSelectedSpId(String(sp.id));
          setDirtyToggles({});
          setDirtyGlobal({});
          setDirtyGlobalPrices({});
        }}
        className={`w-full text-left px-3 py-2.5 border-l-4 transition-colors ${
          isSelected
            ? 'bg-emerald-50 border-emerald-600'
            : 'border-transparent hover:bg-slate-50 active:bg-slate-100'
        }`}
      >
        <p className={`text-sm font-semibold leading-tight truncate ${isSelected ? 'text-emerald-800' : 'text-slate-800'}`}>
          {sp.name}
        </p>
        {sp.route && <p className="text-xs text-slate-400 leading-tight mt-0.5">{sp.route}</p>}
      </button>
    );
  }

  return (
    <div className="flex flex-col h-full">

      <LoadingOverlay open={saving} message="Saving…" />

      {/* Page header */}
      <div className="flex items-center gap-2.5 px-4 md:px-6 py-3.5 bg-emerald-800 flex-shrink-0">
        <IndianRupee size={17} className="text-emerald-300 flex-shrink-0" />
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">Products &amp; Prices</h1>
          <p className="text-emerald-300 text-xs">Enable products and set selling prices per salesperson</p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* LEFT PANEL — Salesperson list */}
        <aside className="flex flex-col w-[220px] flex-shrink-0 border-r border-slate-200 bg-white">

          {/* Search */}
          <div className="p-3 border-b border-slate-100 flex-shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={spSearch}
                onChange={e => setSpSearch(e.target.value)}
                placeholder="Search salesperson…"
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              {spSearch && (
                <button onClick={() => setSpSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Salesperson list */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {/* Global Settings option */}
            <button
              type="button"
              onClick={() => {
                setSelectedSpId(GLOBAL_ID);
                setDirtyToggles({});
                setDirtyGlobal({});
                setDirtyGlobalPrices({});
              }}
              className={`w-full text-left px-3 py-2.5 border-l-4 transition-colors flex items-center gap-2 ${
                selectedSpId === GLOBAL_ID
                  ? 'bg-emerald-50 border-emerald-600'
                  : 'border-transparent hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              <Globe size={14} className={selectedSpId === GLOBAL_ID ? 'text-emerald-700' : 'text-slate-500'} />
              <span className={`text-sm font-semibold leading-tight ${selectedSpId === GLOBAL_ID ? 'text-emerald-800' : 'text-slate-800'}`}>
                Global
              </span>
            </button>

            {/* Salesperson list */}
            {filteredSalespeople.length === 0 ? (
              <li className="px-3 py-6 text-center text-slate-400 text-xs">
                {search ? 'No results' : 'No salespeople'}
              </li>
            ) : (
              filteredSalespeople.map(sp => <SpRow key={sp.id} sp={sp} />)
            )}
          </div>
        </aside>

        {/* RIGHT PANEL — Content area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-slate-50">
          {!selectedSpId ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Select a salesperson or global settings
            </div>
          ) : (
            <div className="p-5 md:p-8 max-w-5xl space-y-5">

              {/* Global mode banner */}
              {isGlobal && (
                <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <Globe size={15} className="text-amber-600 flex-shrink-0" />
                  <p className="text-sm text-amber-800">
                    Changes here apply to <span className="font-bold">all salespeople</span>. Disabled products won't appear for any salesperson regardless of their individual settings.
                  </p>
                </div>
              )}

              {brands.length > 0 && (
                <BrandTabs
                  brands={brands}
                  activeBrandId={activeBrandId}
                  onChange={id => setActiveBrandId(id)}
                />
              )}

              {/* Search + Save */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by product name or category…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={14} />
                    </button>
                  )}
                </div>
                {!isGlobal && (
                  <>
                    <button
                      onClick={() => setShowEnabledOnly(v => {
                        localStorage.setItem('sp_showEnabledOnly', String(!v));
                        return !v;
                      })}
                      className={`text-xs font-semibold px-3 py-2 rounded-xl border transition whitespace-nowrap flex-shrink-0 ${
                        showEnabledOnly
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600'
                      }`}
                    >
                      {showEnabledOnly ? 'Enabled only' : 'Show all'}
                    </button>
                    <button
                      onClick={() => setShowCopyModal(true)}
                      className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 transition whitespace-nowrap"
                    >
                      <Copy size={12} /> Copy Prices
                    </button>
                  </>
                )}
                {isGlobal && (
                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <button
                      onClick={() => handleToggleAllGlobal(true)}
                      disabled={allBrandEnabled}
                      className="text-xs font-semibold px-3 py-2 rounded-xl border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                    >
                      Enable All
                    </button>
                    <button
                      onClick={() => handleToggleAllGlobal(false)}
                      disabled={allBrandDisabled}
                      className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                    >
                      Disable All
                    </button>
                    <button
                      onClick={() => setShowBulkUpdateModal(true)}
                      className="text-xs font-semibold px-3 py-2 rounded-xl border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition whitespace-nowrap"
                    >
                      Bulk Update Prices
                    </button>
                    <button
                      onClick={() => setShowBulkProductModal(true)}
                      className="text-xs font-semibold px-3 py-2 rounded-xl border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition whitespace-nowrap flex items-center gap-1.5"
                    >
                      <Package size={14} />
                      Bulk Product Access
                    </button>
                    <button
                      onClick={() => { fetchProductView(); setShowAllSalesmenPrices(true); }}
                      className="text-xs font-semibold px-3 py-2 rounded-xl border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition whitespace-nowrap"
                    >
                      View Price List
                    </button>
                    <button
                      onClick={() => setShowClearAllConfirm(true)}
                      className="text-xs font-semibold px-3 py-2 rounded-xl border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition whitespace-nowrap"
                    >
                      Clear All Salesman Prices
                    </button>
                  </div>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || !hasDirty}
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-4 py-2 rounded-xl transition text-sm shadow-sm whitespace-nowrap"
                >
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>

              <Pagination
                currentPage={currentPage} totalPages={totalPages}
                startIndex={startIdx} endIndex={endIdx} total={totalFiltered}
                onPageChange={setCurrentPage}
              />

              {/* Salesman-centric view table */}
              {!isGlobal && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-emerald-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-28">Dairy Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-28">Dairy Selling</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-white uppercase tracking-wider w-32">Selling Price</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-32">Prices From</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-32">Effective Price</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-amber-200 uppercase tracking-wider w-28">Upcoming</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-amber-200 uppercase tracking-wider w-32">From</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-20">Edit</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-24">Access</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {loading ? (
                        <tr><td colSpan={colSpan}><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></td></tr>
                      ) : pageGroups.length === 0 ? (
                        <tr>
                          <td colSpan={colSpan} className="py-12 text-center text-slate-400 text-sm">
                            {search ? 'No products match your search.' : 'No products for this brand'}
                          </td>
                        </tr>
                      ) : (
                        pageGroups.map(([category, items]) => (
                          <React.Fragment key={category}>
                            <tr className="bg-slate-100 border-l-4 border-emerald-500">
                              <td colSpan={colSpan} className="px-6 py-2 text-left text-xs font-bold text-slate-600 uppercase tracking-widest">
                                {category}
                              </td>
                            </tr>
                            {items.map(p => {
                              if (isGlobal) {
                                const isDirty = dirtyGlobal[p.productId] !== undefined || dirtyGlobalPrices[p.productId] !== undefined;
                                const priceValue = dirtyGlobalPrices[p.productId] !== undefined ? dirtyGlobalPrices[p.productId] : p.salespersonDefaultPrice;
                                const isEnabled = p.salespersonEnabled;
                                const priceInvalid = isEnabled && (!priceValue || priceValue <= 0);

                                return (
                                  <tr
                                    key={p.productId}
                                    className={`transition-colors ${
                                      priceInvalid
                                        ? 'bg-red-50/40 border-l-4 border-red-500'
                                        : !isEnabled
                                        ? 'bg-slate-50/60 opacity-70'
                                        : isDirty
                                        ? 'bg-emerald-50/40'
                                        : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <td className="px-6 py-3.5 align-middle">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-sm font-semibold ${isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                          {p.productName}
                                        </span>
                                        {priceInvalid && <span className="text-[10px] bg-red-200 text-red-700 px-1.5 py-0.5 rounded font-semibold">No price</span>}
                                        {isDirty && !priceInvalid && <span className="text-[10px] text-amber-600 font-bold">unsaved</span>}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                      <span className="text-xs text-slate-400">{fmt(p.dairyCostPrice)}</span>
                                    </td>
                                    <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                      <span className="text-xs text-slate-400">{fmt(p.dairySellingPrice)}</span>
                                    </td>
                                    <td className={`px-4 py-3.5 text-right align-middle ${priceInvalid ? 'bg-red-100/50' : ''}`}>
                                      <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={priceValue ?? ''}
                                          onChange={e => handleGlobalPriceChange(p.productId, e.target.value)}
                                          placeholder="Required"
                                          className={`w-full pl-5 pr-2 py-2 text-xs text-right font-semibold tabular-nums border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent ${
                                            priceInvalid
                                              ? 'border-red-400 bg-red-50 focus:ring-red-400 text-red-700'
                                              : 'border-slate-200 focus:ring-emerald-400'
                                          }`}
                                          required
                                        />
                                      </div>
                                    </td>
                                    <td className="px-6 py-3.5 text-center align-middle">
                                      <div title={priceInvalid ? 'Set default price before enabling' : ''}>
                                        <TogglePill
                                          enabled={isEnabled}
                                          onChange={() => handleGlobalToggle(p.productId, isEnabled)}
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }

                              // Per-person row
                              const hasPrice      = p.sellingPrice !== null;
                              const isToggleDirty = dirtyToggles[p.productId] !== undefined;
                              return (
                                <tr
                                  key={p.productId}
                                  className={`transition-colors ${
                                    !p.isEnabled
                                      ? 'bg-slate-50/60 opacity-70'
                                      : isToggleDirty
                                      ? 'bg-emerald-50/40'
                                      : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <td className="px-6 py-3.5 align-middle">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-sm font-semibold ${p.isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                        {p.productName}
                                      </span>
                                      {!hasPrice && p.isEnabled && (
                                        <span className="badge-amber text-[10px]">No price</span>
                                      )}
                                      {!p.salespersonEnabled && (
                                        <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-semibold">Global off</span>
                                      )}
                                      {isToggleDirty && (
                                        <span className="text-[10px] text-amber-600 font-bold">unsaved</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                    <span className="text-xs text-slate-400">{fmt(p.dairyCostPrice)}</span>
                                  </td>
                                  <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                    <span className="text-xs text-slate-400">{fmt(p.dairySellingPrice)}</span>
                                  </td>
                                  <td className="px-6 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                    {hasPrice
                                      ? <span className="text-sm font-semibold text-slate-800">₹{Number(p.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                      : <span className="text-amber-600 font-semibold text-xs">Not set</span>
                                    }
                                  </td>
                                  <td className="px-4 py-3.5 text-center align-middle whitespace-nowrap">
                                    {p.effectiveFrom
                                      ? <span className="text-xs font-semibold text-amber-600 tabular-nums">{formatDateShort(p.effectiveFrom)}</span>
                                      : <span className="text-xs text-slate-300">—</span>}
                                  </td>
                                  <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                    {p.sellingPrice != null ? (
                                      <span className="text-sm font-bold text-emerald-700">₹{Number(p.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                    ) : (
                                      <span className="text-xs text-slate-400 font-semibold">from global</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                    {p.upcomingSellingPrice != null
                                      ? <span className="text-sm font-semibold text-amber-700">₹{Number(p.upcomingSellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                      : <span className="text-xs text-slate-300">—</span>}
                                  </td>
                                  <td className="px-4 py-3.5 text-center align-middle whitespace-nowrap">
                                    {p.upcomingEffectiveFrom
                                      ? <span className="text-xs font-semibold text-amber-700 tabular-nums">{formatDateShort(p.upcomingEffectiveFrom)}</span>
                                      : <span className="text-xs text-slate-300">—</span>}
                                  </td>
                                  <td className="px-4 py-3.5 text-center align-middle">
                                    <button
                                      onClick={() => openPriceEdit(p)}
                                      className="text-emerald-600 hover:text-emerald-800 transition-colors p-1.5 rounded-lg hover:bg-emerald-50"
                                      title="Edit price"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                  <td className="px-6 py-3.5 text-center align-middle">
                                    <div title={!p.salespersonEnabled ? 'This product is disabled globally' : ''}>
                                      <TogglePill
                                        enabled={p.isEnabled && p.salespersonEnabled}
                                        onChange={() => handleToggle(p.productId, p.isEnabled, !p.salespersonEnabled)}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              {/* Global settings table */}
              {isGlobal && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-emerald-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Product</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-28">Dairy Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-28">Dairy Selling</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-emerald-200 uppercase tracking-wider w-32">Default Price</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-24">Global</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider w-28">Clear Prices</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {loading ? (
                        <tr><td colSpan={6}><BrandedLoader size="sm" hideBrand inlinePadY="py-12" /></td></tr>
                      ) : pageGroups.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">
                            {search ? 'No products match your search.' : 'No products for this brand'}
                          </td>
                        </tr>
                      ) : (
                        pageGroups.map(([category, items]) => (
                          <React.Fragment key={category}>
                            <tr className="bg-slate-100 border-l-4 border-emerald-500">
                              <td colSpan={6} className="px-6 py-2 text-left text-xs font-bold text-slate-600 uppercase tracking-widest">
                                {category}
                              </td>
                            </tr>
                            {items.map(p => {
                              const isDirty = dirtyGlobal[p.productId] !== undefined || dirtyGlobalPrices[p.productId] !== undefined;
                              const priceValue = dirtyGlobalPrices[p.productId] !== undefined ? dirtyGlobalPrices[p.productId] : p.salespersonDefaultPrice;
                              const isEnabled = p.salespersonEnabled;
                              const priceInvalid = isEnabled && (!priceValue || priceValue <= 0);

                              return (
                                <tr
                                  key={p.productId}
                                  className={`transition-colors ${
                                    priceInvalid
                                      ? 'bg-red-50/40 border-l-4 border-red-500'
                                      : !isEnabled
                                      ? 'bg-slate-50/60 opacity-70'
                                      : isDirty
                                      ? 'bg-emerald-50/40'
                                      : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <td className="px-6 py-3.5 align-middle">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-sm font-semibold ${isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                        {p.productName}
                                      </span>
                                      {priceInvalid && <span className="text-[10px] bg-red-200 text-red-700 px-1.5 py-0.5 rounded font-semibold">No price</span>}
                                      {isDirty && !priceInvalid && <span className="text-[10px] text-amber-600 font-bold">unsaved</span>}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                    <span className="text-xs text-slate-400">{fmt(p.dairyCostPrice)}</span>
                                  </td>
                                  <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap tabular-nums">
                                    <span className="text-xs text-slate-400">{fmt(p.dairySellingPrice)}</span>
                                  </td>
                                  <td className={`px-4 py-3.5 text-right align-middle ${priceInvalid ? 'bg-red-100/50' : ''}`}>
                                    <div className="relative">
                                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={priceValue ?? ''}
                                        onChange={e => handleGlobalPriceChange(p.productId, e.target.value)}
                                        placeholder="Required"
                                        className={`w-full pl-5 pr-2 py-2 text-xs text-right font-semibold tabular-nums border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent ${
                                          priceInvalid
                                            ? 'border-red-400 bg-red-50 focus:ring-red-400 text-red-700'
                                            : 'border-slate-200 focus:ring-emerald-400'
                                        }`}
                                        required
                                      />
                                    </div>
                                  </td>
                                  <td className="px-6 py-3.5 text-center align-middle">
                                    <div title={priceInvalid ? 'Set default price before enabling' : ''}>
                                      <TogglePill
                                        enabled={isEnabled}
                                        onChange={() => handleGlobalToggle(p.productId, isEnabled)}
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5 text-center align-middle">
                                    <button
                                      onClick={() => handleClearCustomPrices(p.productId)}
                                      disabled={clearingProductId === p.productId}
                                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
                                      title="Clear all custom prices for this product — all salesmen will use this global default"
                                    >
                                      {clearingProductId === p.productId ? 'Clearing…' : 'Clear'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Per-row price edit modal */}
      {editingPrice && (() => {
        const unitLabel = editingPrice.unitType === 'ml' && editingPrice.unitSize
          ? `${editingPrice.unitSize} ml`
          : editingPrice.unitType === 'gram' && editingPrice.unitSize
          ? `${editingPrice.unitSize} g`
          : editingPrice.unitType ?? '—';
        const containerLabel = editingPrice.containerType && editingPrice.unitsPerContainer
          ? `${editingPrice.unitsPerContainer} / ${editingPrice.containerType}`
          : null;
        return (
          <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={closePriceEdit}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Emerald header bar — matches the app's page-header chrome */}
              <div className="bg-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl">
                <div className="flex items-center gap-3 min-w-0">
                  <Edit2 size={18} className="text-emerald-200 flex-shrink-0" />
                  <div>
                    <h3 className="text-base font-bold text-white leading-tight">Edit Price</h3>
                    <p className="text-[11px] text-emerald-200 mt-0.5">Update salesperson selling price</p>
                  </div>
                </div>
                <button onClick={closePriceEdit} className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-600 rounded-lg transition">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSavePrice} className="px-5 py-5 space-y-5">

                {/* Product details — read only */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900 leading-tight">{editingPrice.productName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {editingPrice.brandName && (
                        <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{editingPrice.brandName}</span>
                      )}
                      {editingPrice.category && (
                        <span className="text-[10px] font-semibold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{editingPrice.category}</span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                    <div>
                      <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Unit</p>
                      <p className="text-slate-700 font-semibold tabular-nums">{unitLabel}</p>
                    </div>
                    {containerLabel && (
                      <div>
                        <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Pack</p>
                        <p className="text-slate-700 font-semibold tabular-nums">{containerLabel}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Dairy Cost</p>
                      <p className="text-slate-700 font-semibold tabular-nums">{fmt(editingPrice.dairyCostPrice)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Dairy Selling</p>
                      <p className="text-slate-700 font-semibold tabular-nums">{fmt(editingPrice.dairySellingPrice)}</p>
                    </div>
                    {editingPrice.currentPrice != null && (
                      <div className="col-span-2 pt-2 border-t border-slate-200">
                        <p className="text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Current Price</p>
                        <div className="flex items-baseline justify-between">
                          <p className="text-sm text-emerald-700 font-bold tabular-nums">{fmt(editingPrice.currentPrice)}</p>
                          {editingPrice.currentEffective && (
                            <p className="text-[10px] text-slate-500 tabular-nums">since {formatDateShort(editingPrice.currentEffective)}</p>
                          )}
                        </div>
                      </div>
                    )}
                    {editingPrice.upcomingPrice != null && (
                      <div className="col-span-2 pt-2 border-t border-amber-200 bg-amber-50/40 -mx-4 -mb-4 px-4 py-2 rounded-b-xl">
                        <p className="text-amber-600 uppercase tracking-wider font-semibold mb-0.5">Upcoming · saving will replace this</p>
                        <div className="flex items-baseline justify-between">
                          <p className="text-sm text-amber-700 font-bold tabular-nums">{fmt(editingPrice.upcomingPrice)}</p>
                          {editingPrice.upcomingEffective && (
                            <p className="text-[10px] text-amber-700/80 tabular-nums">from {formatDateShort(editingPrice.upcomingEffective)}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Editable: Selling Price */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    New Selling Price (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                    <input
                      autoFocus
                      type="number" step="0.0001" min="0"
                      value={priceForm.sellingPrice}
                      onChange={e => setPriceForm(f => ({ ...f, sellingPrice: e.target.value }))}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2.5 text-sm text-right font-semibold tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                {/* Editable: Effective From — today or any future date.
                    Past dates are blocked via min so admin can't accidentally
                    back-date a change that would either be invisible or
                    re-bill old transactions. */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Prices From
                  </label>
                  <input
                    type="date"
                    value={priceForm.effectiveFrom}
                    onChange={e => setPriceForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                    min={getIndiaDate()}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Pick today to make it the current price, or a future date to schedule the change.
                  </p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowPriceHistory(true)} className="px-4 py-2.5 text-sm font-semibold bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl transition">
                    History
                  </button>
                  <button type="button" onClick={closePriceEdit} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingPrice} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm">
                    {savingPrice ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    {savingPrice ? 'Saving…' : 'Save Price'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Price History Modal */}
      {showPriceHistory && editingPrice && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPriceHistory(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl sticky top-0 z-10">
              <div className="flex items-center gap-3 min-w-0">
                <Clock size={18} className="text-emerald-200 flex-shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">Price Schedule</h3>
                  <p className="text-[11px] text-emerald-200 mt-0.5">{editingPrice.productName}</p>
                </div>
              </div>
              <button onClick={() => setShowPriceHistory(false)} className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-600 rounded-lg transition">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Current price */}
              {editingPrice.currentPrice != null && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Current Price</p>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-semibold">Active</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-900 tabular-nums">
                    ₹{Number(editingPrice.currentPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {editingPrice.currentEffective && (
                    <p className="text-xs text-emerald-600 mt-2">since {new Date(editingPrice.currentEffective + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  )}
                </div>
              )}

              {/* Upcoming price */}
              {editingPrice.upcomingPrice != null && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Upcoming Price</p>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded font-semibold">Scheduled</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-900 tabular-nums">
                    ₹{Number(editingPrice.upcomingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {editingPrice.upcomingEffective && (
                    <p className="text-xs text-amber-600 mt-2">from {new Date(editingPrice.upcomingEffective + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  )}
                </div>
              )}

              {/* No prices scheduled */}
              {editingPrice.currentPrice == null && editingPrice.upcomingPrice == null && (
                <div className="text-center py-6 text-slate-400">
                  <p className="text-sm">No prices scheduled for this product</p>
                </div>
              )}

              {/* Info note */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Prices marked as "Current" are in effect today. Prices marked as "Scheduled" will become active on their specified date.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPriceHistory(false)}
                className="w-full px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Prices Modal */}
      {showCopyModal && (
        <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => {
          setShowCopyModal(false);
          setCopyFromSpId('');
          setCopyPricesSearch('');
        }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="bg-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3 min-w-0">
                <Copy size={18} className="text-emerald-200 flex-shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">Copy Prices</h3>
                  <p className="text-[11px] text-emerald-200 mt-0.5">Copy prices from another salesman for this brand</p>
                </div>
              </div>
              <button onClick={() => {
                setShowCopyModal(false);
                setCopyFromSpId('');
                setCopyPricesSearch('');
              }} className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-600 rounded-lg transition">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Copy from</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search salespeople…"
                    value={copyPricesSearch}
                    onChange={e => setCopyPricesSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                  />
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                  {salespeople
                    .filter(sp => String(sp.id) !== String(selectedSpId))
                    .filter(sp => {
                      const q = copyPricesSearch.toLowerCase();
                      return !q || sp.name.toLowerCase().includes(q) || (sp.route?.toLowerCase().includes(q));
                    })
                    .map(sp => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => {
                          setCopyFromSpId(String(sp.id));
                          setCopyPricesSearch('');
                        }}
                        className={`w-full text-left px-3 py-2.5 text-sm border-b border-slate-100 hover:bg-emerald-50 transition ${
                          copyFromSpId === String(sp.id)
                            ? 'bg-emerald-100 border-l-4 border-l-emerald-600'
                            : ''
                        }`}
                      >
                        <div className="font-medium text-slate-900">{sp.name}</div>
                        {sp.route && <div className="text-xs text-slate-500">{sp.route}</div>}
                      </button>
                    ))}
                  {salespeople
                    .filter(sp => String(sp.id) !== String(selectedSpId))
                    .filter(sp => {
                      const q = copyPricesSearch.toLowerCase();
                      return !q || sp.name.toLowerCase().includes(q) || (sp.route?.toLowerCase().includes(q));
                    }).length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-slate-400">
                      {copyPricesSearch ? 'No salespeople found' : 'No other salespeople'}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  All prices for {brands.find(b => b.id === activeBrandId)?.name || 'this brand'} will be copied.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCopyModal(false);
                    setCopyFromSpId('');
                    setCopyPricesSearch('');
                  }}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCopyPrices}
                  disabled={copyingPrices || !copyFromSpId}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                >
                  {copyingPrices ? <Loader2 className="animate-spin" size={14} /> : <Copy size={14} />}
                  {copyingPrices ? 'Copying…' : 'Copy Prices'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Update Prices Modal */}
      {showBulkUpdateModal && (
        <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => {
          setShowBulkUpdateModal(false);
          setBulkUpdateProductSearch('');
          setBulkUpdateSalesmenSearch('');
        }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl sticky top-0 z-10">
              <div className="flex items-center gap-3 min-w-0">
                <IndianRupee size={18} className="text-emerald-200 flex-shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">Bulk Update Prices</h3>
                  <p className="text-[11px] text-emerald-200 mt-0.5">Apply the same price to multiple salespeople</p>
                </div>
              </div>
              <button onClick={() => {
                setShowBulkUpdateModal(false);
                setBulkUpdateProductSearch('');
                setBulkUpdateSalesmenSearch('');
              }} className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-600 rounded-lg transition">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-5">
              {/* Product Selection and Addition */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Add Products</label>
                  {(() => {
                    const availableProducts = globalProducts.filter(p => p.brandId === activeBrandId && p.salespersonEnabled)
                      .filter(p => !bulkUpdateForm.productPrices.some(pp => String(pp.productId) === String(p.productId)));
                    return availableProducts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          for (const p of availableProducts) {
                            addProductToUpdate(String(p.productId));
                          }
                        }}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
                      >
                        Select All
                      </button>
                    );
                  })()}
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search products to add…"
                    value={bulkUpdateProductSearch}
                    onChange={e => setBulkUpdateProductSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                  />
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                  {globalProducts
                    .filter(p => p.brandId === activeBrandId && p.salespersonEnabled)
                    .filter(p => {
                      const added = bulkUpdateForm.productPrices.some(pp => String(pp.productId) === String(p.productId));
                      const q = bulkUpdateProductSearch.toLowerCase();
                      return !added && (!q || p.productName.toLowerCase().includes(q) || (p.category?.toLowerCase().includes(q)));
                    })
                    .map(p => (
                      <button
                        key={p.productId}
                        type="button"
                        onClick={() => addProductToUpdate(String(p.productId))}
                        className="w-full text-left px-3 py-2.5 text-sm border-b border-slate-100 hover:bg-emerald-50 transition"
                      >
                        <div className="font-medium text-slate-900">{p.productName}</div>
                        {p.category && <div className="text-xs text-slate-500">{p.category}</div>}
                      </button>
                    ))}
                  {globalProducts
                    .filter(p => p.brandId === activeBrandId && p.salespersonEnabled)
                    .filter(p => {
                      const added = bulkUpdateForm.productPrices.some(pp => String(pp.productId) === String(p.productId));
                      const q = bulkUpdateProductSearch.toLowerCase();
                      return !added && (!q || p.productName.toLowerCase().includes(q) || (p.category?.toLowerCase().includes(q)));
                    }).length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-slate-400">
                      {bulkUpdateProductSearch ? 'No products found' : 'No enabled products or all added'}
                    </div>
                  )}
                </div>
              </div>

              {/* Products Table */}
              {bulkUpdateForm.productPrices.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Selected Products ({bulkUpdateForm.productPrices.length})
                  </label>
                  <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Product</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">Dairy Cost</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">Dairy Selling</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-emerald-600 whitespace-nowrap">Salesman Price (₹)</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-10 whitespace-nowrap">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bulkUpdateForm.productPrices.map((p, idx) => {
                          const salespersonVal = parseFloat(p.salespersonSellingPrice);
                          const salespersonInvalid = p.salespersonSellingPrice !== '' && !(salespersonVal >= 0);
                          return (
                            <tr key={idx} className={salespersonInvalid ? 'bg-red-50/50' : ''}>
                              <td className="px-3 py-2.5 min-w-max">
                                <div className="font-medium text-slate-700">{p.productName}</div>
                                {p.category && <div className="text-xs text-slate-500">{p.category}</div>}
                              </td>
                              <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums text-xs whitespace-nowrap">
                                ₹{Number(p.dairyCostPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums text-xs whitespace-nowrap">
                                ₹{Number(p.dairySellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2.5 min-w-fit">
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">₹</span>
                                  <input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    value={p.salespersonSellingPrice}
                                    onChange={e => {
                                      const updated = [...bulkUpdateForm.productPrices];
                                      updated[idx].salespersonSellingPrice = e.target.value;
                                      setBulkUpdateForm(prev => ({ ...prev, productPrices: updated }));
                                    }}
                                    placeholder="0.00"
                                    className={`w-28 pl-6 pr-2 py-1.5 text-xs text-right font-semibold tabular-nums border rounded focus:outline-none focus:ring-2 focus:border-transparent ${
                                      salespersonInvalid
                                        ? 'border-red-300 bg-red-50 focus:ring-red-400'
                                        : 'border-slate-200 focus:ring-emerald-400'
                                    }`}
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeProductFromUpdate(idx)}
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                  title="Remove"
                                >
                                  <X size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Effective From */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Prices From
                </label>
                <input
                  type="date"
                  value={bulkUpdateForm.effectiveFrom}
                  onChange={e => setBulkUpdateForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                  min={getIndiaDate()}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Pick today to make it the current price, or a future date to schedule the change.
                </p>
              </div>

              {/* Salesmen Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Apply to Salespeople ({bulkUpdateForm.selectedSalesmen.size} selected)
                  </label>
                  {salespeople.length > 0 && (
                    <div className="flex items-center gap-2">
                      {bulkUpdateForm.selectedSalesmen.size === salespeople.length ? (
                        <button
                          type="button"
                          onClick={() => setBulkUpdateForm(f => ({ ...f, selectedSalesmen: new Set() }))}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition"
                        >
                          Deselect All
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setBulkUpdateForm(f => ({ ...f, selectedSalesmen: new Set(salespeople.map(sp => sp.id)) }))}
                          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
                        >
                          Select All
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search salespeople…"
                    value={bulkUpdateSalesmenSearch}
                    onChange={e => setBulkUpdateSalesmenSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                  />
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
                  {salespeople
                    .filter(sp => {
                      const q = bulkUpdateSalesmenSearch.toLowerCase();
                      return !q || sp.name.toLowerCase().includes(q) || (sp.route?.toLowerCase().includes(q));
                    })
                    .length === 0 ? (
                    <p className="text-xs text-slate-400">No salespeople found</p>
                  ) : (
                    salespeople
                      .filter(sp => {
                        const q = bulkUpdateSalesmenSearch.toLowerCase();
                        return !q || sp.name.toLowerCase().includes(q) || (sp.route?.toLowerCase().includes(q));
                      })
                      .map(sp => (
                        <label key={sp.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 rounded transition">
                          <input
                            type="checkbox"
                            checked={bulkUpdateForm.selectedSalesmen.has(sp.id)}
                            onChange={() => handleBulkSalesmenToggle(sp.id)}
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-700 truncate">{sp.name}</div>
                            {sp.route && <div className="text-xs text-slate-500 truncate">{sp.route}</div>}
                          </div>
                        </label>
                      ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBulkUpdateModal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpdate}
                  disabled={updatingBulkPrices || bulkUpdateForm.selectedSalesmen.size === 0 || bulkUpdateForm.productPrices.length === 0}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                >
                  {updatingBulkPrices ? <Loader2 className="animate-spin" size={14} /> : <IndianRupee size={14} />}
                  {updatingBulkPrices ? 'Updating…' : `Update (${bulkUpdateForm.selectedSalesmen.size} salesmen, ${bulkUpdateForm.productPrices.length} products)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View All Salesmen Prices Modal */}
      {showAllSalesmenPrices && (
        <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAllSalesmenPrices(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="bg-emerald-700 px-5 py-4 flex items-center justify-between rounded-t-2xl flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <Eye size={18} className="text-emerald-200 flex-shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">Salesperson Price List</h3>
                  <p className="text-[11px] text-emerald-200 mt-0.5">View all salespeople's prices for each product</p>
                </div>
              </div>
              <button onClick={() => setShowAllSalesmenPrices(false)} className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-600 rounded-lg transition">
                <X size={16} />
              </button>
            </div>

            {/* Single overflow-auto container — both axes in one scroller so sticky thead/col work */}
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-cyan-700 sticky top-0 z-20">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-white uppercase tracking-wider min-w-[180px] sticky left-0 z-30 bg-cyan-700 border-r border-cyan-600">Product</th>
                    {salespeople.filter(s => s.isActive).map(sp => (
                      <th key={sp.id} className="px-3 py-3 text-center text-xs font-bold text-emerald-200 uppercase tracking-wider whitespace-nowrap">
                        {sp.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                      {productView.length === 0 ? (
                        <tr>
                          <td colSpan={salespeople.filter(s => s.isActive).length + 1} className="py-12 text-center text-slate-400 text-sm">
                            No products for this brand
                          </td>
                        </tr>
                      ) : (
                        (() => {
                          const rows = [];
                          let lastCat = null;
                          const activeSp = salespeople.filter(s => s.isActive);
                          for (const product of productView) {
                            const cat = product.category || 'Uncategorised';
                            if (cat !== lastCat) {
                              rows.push(
                                <tr key={`cat-${cat}`} className="bg-slate-100 border-l-4 border-emerald-500">
                                  <td className="px-6 py-2 text-left text-xs font-bold text-slate-600 uppercase tracking-widest sticky left-0 z-10 bg-slate-100 min-w-[180px]">
                                    {cat}
                                  </td>
                                  <td colSpan={activeSp.length} className="bg-slate-100" />
                                </tr>
                              );
                              lastCat = cat;
                            }
                            rows.push(
                              <tr key={product.productId} className="hover:bg-slate-50 group">
                                <td className="px-6 py-3 align-middle min-w-[180px] sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200">
                                  <p className="text-sm font-semibold text-slate-800">{product.productName}</p>
                                </td>
                                {activeSp.map(sp => {
                                  const priceInfo = product.salespersonPrices[sp.id];
                                  return (
                                    <td key={sp.id} className="px-3 py-3 text-center align-middle">
                                      {priceInfo ? (
                                        <div className="flex flex-col items-center gap-1">
                                          <span className={`text-xs font-semibold tabular-nums ${priceInfo.isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                            {priceInfo.sellingPrice != null ? `₹${Number(priceInfo.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Not set'}
                                          </span>
                                          {!priceInfo.isEnabled && <span className="text-[9px] bg-slate-200 text-slate-500 px-1 py-0.5 rounded">disabled</span>}
                                        </div>
                                      ) : (
                                        <span className="text-xs text-slate-300">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          }
                          return rows;
                        })()
                      )}
                </tbody>
              </table>
            </div>
            {/* Close button — pinned at bottom, never scrolls */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAllSalesmenPrices(false)}
                className="w-full px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Salesman Prices Confirmation Modal */}
      {showClearAllConfirm && (
        <div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowClearAllConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="bg-red-700 px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3 min-w-0">
                <Trash2 size={18} className="text-red-200 flex-shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">Clear All Salesman Prices?</h3>
                  <p className="text-[11px] text-red-200 mt-0.5">This action cannot be undone</p>
                </div>
              </div>
              <button onClick={() => setShowClearAllConfirm(false)} className="p-1.5 text-red-200 hover:text-white hover:bg-red-600 rounded-lg transition">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-900 font-semibold mb-2">Warning</p>
                <p className="text-sm text-red-700 leading-relaxed">
                  This will delete all custom salesman prices for all products in <span className="font-semibold">{brands.find(b => b.id === activeBrandId)?.name || 'this brand'}</span>. All salesmen will use the global default prices instead.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-xs text-slate-600 font-semibold mb-1">Products affected:</p>
                <p className="text-sm text-slate-900 font-bold">
                  {globalProducts.filter(p => p.brandId === activeBrandId).length} products
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowClearAllConfirm(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAllSalesmanPrices}
                  disabled={clearingAllPrices}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-700 hover:bg-red-800 disabled:bg-red-300 text-white rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
                >
                  {clearingAllPrices ? <Loader2 className="animate-spin" size={14} /> : <AlertCircle size={14} />}
                  {clearingAllPrices ? 'Clearing…' : 'Clear All Prices'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Enable/Disable Products Modal */}
      {showBulkProductModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Package size={20} className="text-emerald-600" />
              Bulk Enable/Disable Products
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Salesmen Selection */}
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
                    Select Salesmen ({bulkProductForm.selectedSalesmen.size})
                  </span>
                  <button
                    onClick={() => {
                      if (bulkProductForm.selectedSalesmen.size === salespeople.length) {
                        setBulkProductForm(f => ({ ...f, selectedSalesmen: new Set() }));
                      } else {
                        setBulkProductForm(f => ({ ...f, selectedSalesmen: new Set(salespeople.map(sp => sp.id)) }));
                      }
                    }}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    {bulkProductForm.selectedSalesmen.size === salespeople.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {salespeople.length === 0 ? (
                    <p className="text-sm text-slate-400">No salesmen available</p>
                  ) : (
                    salespeople.map(sp => (
                      <label key={sp.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded">
                        <input
                          type="checkbox"
                          checked={bulkProductForm.selectedSalesmen.has(sp.id)}
                          onChange={() => {
                            const updated = new Set(bulkProductForm.selectedSalesmen);
                            if (updated.has(sp.id)) {
                              updated.delete(sp.id);
                            } else {
                              updated.add(sp.id);
                            }
                            setBulkProductForm(f => ({ ...f, selectedSalesmen: updated }));
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                        />
                        <span className="text-sm font-medium text-slate-700">{sp.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Products Selection */}
              <div className="bg-slate-50 rounded-lg p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
                    Select Products ({bulkProductForm.selectedProducts.size})
                  </span>
                  <button
                    onClick={() => {
                      if (bulkProductForm.selectedProducts.size === globalProducts.length) {
                        setBulkProductForm(f => ({ ...f, selectedProducts: new Set() }));
                      } else {
                        setBulkProductForm(f => ({ ...f, selectedProducts: new Set(globalProducts.map(p => p.productId)) }));
                      }
                    }}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    {bulkProductForm.selectedProducts.size === globalProducts.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Search products..."
                  value={bulkProductSearch}
                  onChange={e => setBulkProductSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                  {globalProducts.length === 0 ? (
                    <p className="text-sm text-slate-400">No products available</p>
                  ) : (
                    (() => {
                      const q = bulkProductSearch.toLowerCase();
                      // Filter to only show products from the selected brand
                      const brandProducts = globalProducts.filter(p => p.brandId === activeBrandId);
                      const filtered = q ? brandProducts.filter(p => p.productName.toLowerCase().includes(q)) : brandProducts;

                      return filtered.length === 0 ? (
                        <p className="text-sm text-slate-400">No products found</p>
                      ) : (
                        <div className="space-y-0.5">
                          {filtered.map(prod => (
                            <label key={prod.productId} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded">
                              <input
                                type="checkbox"
                                checked={bulkProductForm.selectedProducts.has(prod.productId)}
                                onChange={() => {
                                  const updated = new Set(bulkProductForm.selectedProducts);
                                  if (updated.has(prod.productId)) {
                                    updated.delete(prod.productId);
                                  } else {
                                    updated.add(prod.productId);
                                  }
                                  setBulkProductForm(f => ({ ...f, selectedProducts: updated }));
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                              />
                              <span className="text-sm text-slate-700">{prod.productName}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>

            {/* Action Selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">
                Action
              </label>
              <select
                value={bulkProductForm.action}
                onChange={e => setBulkProductForm(f => ({ ...f, action: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="enable">Enable for selected salesmen</option>
                <option value="disable">Disable for selected salesmen</option>
              </select>
            </div>

            {/* Buttons */}
            <div className="border-t border-slate-200 pt-4 flex gap-3">
              <button
                onClick={() => setShowBulkProductModal(false)}
                disabled={updatingBulkProducts}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkProductUpdate}
                disabled={updatingBulkProducts || bulkProductForm.selectedSalesmen.size === 0 || bulkProductForm.selectedProducts.size === 0}
                className="flex-1 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {updatingBulkProducts && <Loader2 size={16} className="animate-spin" />}
                {updatingBulkProducts ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

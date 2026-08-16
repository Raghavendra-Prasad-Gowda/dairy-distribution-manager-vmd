import { useState, useEffect, useMemo, useCallback } from 'react';
import { IndianRupee, Globe } from 'lucide-react';
import BrandTabs from '../../components/BrandTabs';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { getIndiaDate } from '../../utils/dateUtils';
import api from '../../api/axios';
import SalespersonSidebar from './salesmanPrices/SalespersonSidebar';
import PriceToolbar from './salesmanPrices/PriceToolbar';
import PriceTable from './salesmanPrices/PriceTable';
import PriceEditModal from './salesmanPrices/PriceEditModal';
import PriceHistoryModal from './salesmanPrices/PriceHistoryModal';
import CopyPricesModal from './salesmanPrices/CopyPricesModal';
import BulkUpdatePricesModal from './salesmanPrices/BulkUpdatePricesModal';
import AllSalesmenPricesModal from './salesmanPrices/AllSalesmenPricesModal';
import ClearAllConfirmModal from './salesmanPrices/ClearAllConfirmModal';
import BulkProductAccessModal from './salesmanPrices/BulkProductAccessModal';
import ExceptionManagerModal from './salesmanPrices/ExceptionManagerModal';

const ITEMS_PER_PAGE = 10;
const GLOBAL_ID = 'global';

export default function SalesmanPricesSetup() {
  const { notify } = useNotification();
  const { user: me } = useAuth();

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
  // Temp for selecting product to add — the setter is used to reset this after
  // adding a product to the bulk-update list; nothing currently reads the value.
  const [_pendingProductSelection, setPendingProductSelection] = useState('');
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
  // The setter is used to reset this after a bulk product action completes;
  // nothing currently reads the value.
  const [_expandedBrand, setExpandedBrand] = useState(null);

  const [showEnabledOnly, setShowEnabledOnly] = useState(
    () => localStorage.getItem('sp_showEnabledOnly') !== 'false'
  );

  // Exception Manager — superadmin only
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionForm, setExceptionForm] = useState({
    selectedProducts: new Set(),
    selectedSalesmen: new Set(),
    action: 'enable',
    prices: {},        // { [productId]: string }
    effectiveFrom: getIndiaDate(),
  });
  const [savingExceptions, setSavingExceptions] = useState(false);
  const [exProductSearch, setExProductSearch]   = useState('');
  const [exSpSearch, setExSpSearch]             = useState('');

  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [spSearch, setSpSearch]             = useState('');  // Salesperson search
  const [search, setSearch]                 = useState('');  // Product search
  const [currentPage, setCurrentPage]       = useState(1);

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
  }, [notify]);

  const fetchPrices = useCallback(async () => {
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
  }, [selectedSpId, notify]);

  const fetchGlobal = useCallback(async () => {
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
  }, [notify]);

  const fetchProductView = useCallback(async () => {
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
  }, [salespeople, activeBrandId, notify]);

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
  }, [selectedSpId, activeBrandId, isGlobal, fetchGlobal, fetchProductView, fetchPrices]);

  useEffect(() => {
    setSearch('');
    setCurrentPage(1);
  }, [activeBrandId]);

  useEffect(() => { setCurrentPage(1); }, [search]);

  // ── Salesperson selection (sidebar) ─────────────────────────────────────────
  const handleSelectSp = (id) => {
    setSelectedSpId(String(id));
    setDirtyToggles({});
    setDirtyGlobal({});
    setDirtyGlobalPrices({});
  };

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

  const handleToggle = (productId, currentEnabled, isGloballyDisabled) => {
    // Globally-disabled products can still be individually enabled for a specific
    // salesperson — this is how you opt in 3 salespeople without enabling globally.
    // Toggling ON for a globally-disabled product creates an exception row; the
    // "Global off" badge stays visible to remind the admin of the exception.
    const newValue = !currentEnabled;
    if (isGloballyDisabled && newValue) {
      notify('Enabling as exception — this product is still off globally for all other salespeople.', 'info');
    }
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
    } catch {
      notify('Failed to clear all prices', 'error');
    } finally {
      setClearingAllPrices(false);
    }
  };

  // ── Exception Manager (superadmin only) ──────────────────────────────────────
  // Enables or disables a globally-disabled product for a specific set of
  // salespeople without touching the global flag. Optionally sets prices too.
  const handleSaveExceptions = async () => {
    const productIds = Array.from(exceptionForm.selectedProducts);
    const spIds      = Array.from(exceptionForm.selectedSalesmen);
    if (!productIds.length) { notify('Select at least one product', 'warning'); return; }
    if (!spIds.length)       { notify('Select at least one salesperson', 'warning'); return; }

    const isEnabling = exceptionForm.action === 'enable';
    setSavingExceptions(true);
    notify('Applying exceptions…', 'loading');
    try {
      // Step 1: flip isEnabled per salesperson for each selected product
      await api.post('/salespeople/products/bulk-update', {
        salespersonIds: spIds,
        products: productIds.map(id => ({ productId: id, isEnabled: isEnabling })),
      });

      // Step 2: set prices if enabling and prices were entered
      if (isEnabling) {
        const pricesWithValues = productIds
          .filter(id => exceptionForm.prices[id] !== undefined && exceptionForm.prices[id] !== '' && parseFloat(exceptionForm.prices[id]) >= 0)
          .map(id => ({ productId: id, sellingPrice: parseFloat(exceptionForm.prices[id]) }));

        if (pricesWithValues.length > 0) {
          await api.post('/salespeople/bulk-update', {
            salespersonIds: spIds,
            productPrices:  pricesWithValues,
            effectiveFrom:  exceptionForm.effectiveFrom,
          });
        }
      }

      const priceCount = isEnabling
        ? productIds.filter(id => exceptionForm.prices[id] !== undefined && exceptionForm.prices[id] !== '').length
        : 0;

      notify(
        `${isEnabling ? 'Enabled' : 'Disabled'} ${productIds.length} product(s) for ${spIds.length} salesperson(s)` +
        (priceCount ? ` with ${priceCount} price(s) set` : ''),
        'success'
      );
      setShowExceptionModal(false);
      setExceptionForm({ selectedProducts: new Set(), selectedSalesmen: new Set(), action: 'enable', prices: {}, effectiveFrom: getIndiaDate() });
      setExProductSearch('');
      setExSpSearch('');
      fetchGlobal();
    } catch (err) {
      notify(err.response?.data?.error ?? 'Failed to apply exceptions', 'error');
    } finally {
      setSavingExceptions(false);
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

  const isSuperAdmin = me?.role === 'superadmin';

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

        <SalespersonSidebar
          filteredSalespeople={filteredSalespeople}
          spSearch={spSearch}
          setSpSearch={setSpSearch}
          selectedSpId={selectedSpId}
          search={search}
          onSelect={handleSelectSp}
        />

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
                    Changes here apply to <span className="font-bold">all salespeople by default</span>. Disabled products are hidden from all salespeople, but you can still enable them individually per salesperson as exceptions.
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

              <PriceToolbar
                isGlobal={isGlobal}
                search={search}
                setSearch={setSearch}
                showEnabledOnly={showEnabledOnly}
                setShowEnabledOnly={setShowEnabledOnly}
                isSuperAdmin={isSuperAdmin}
                onOpenCopyModal={() => setShowCopyModal(true)}
                onOpenBulkUpdateModal={() => setShowBulkUpdateModal(true)}
                onOpenBulkProductModal={() => setShowBulkProductModal(true)}
                onOpenExceptionModal={() => setShowExceptionModal(true)}
                onOpenAllSalesmenPrices={() => { fetchProductView(); setShowAllSalesmenPrices(true); }}
                onOpenClearAllConfirm={() => setShowClearAllConfirm(true)}
                onToggleAllGlobal={handleToggleAllGlobal}
                allBrandEnabled={allBrandEnabled}
                allBrandDisabled={allBrandDisabled}
                onSave={handleSave}
                saving={saving}
                hasDirty={hasDirty}
              />

              <PriceTable
                isGlobal={isGlobal}
                loading={loading}
                pageGroups={pageGroups}
                colSpan={colSpan}
                currentPage={currentPage}
                totalPages={totalPages}
                startIdx={startIdx}
                endIdx={endIdx}
                totalFiltered={totalFiltered}
                setCurrentPage={setCurrentPage}
                search={search}
                dirtyGlobal={dirtyGlobal}
                dirtyGlobalPrices={dirtyGlobalPrices}
                dirtyToggles={dirtyToggles}
                handleGlobalPriceChange={handleGlobalPriceChange}
                handleGlobalToggle={handleGlobalToggle}
                handleToggle={handleToggle}
                openPriceEdit={openPriceEdit}
                handleClearCustomPrices={handleClearCustomPrices}
                clearingProductId={clearingProductId}
                fmt={fmt}
              />
            </div>
          )}
        </div>
      </div>

      <PriceEditModal
        editingPrice={editingPrice}
        priceForm={priceForm}
        setPriceForm={setPriceForm}
        savingPrice={savingPrice}
        onClose={closePriceEdit}
        onSubmit={handleSavePrice}
        onShowHistory={() => setShowPriceHistory(true)}
        fmt={fmt}
      />

      <PriceHistoryModal
        show={showPriceHistory}
        editingPrice={editingPrice}
        onClose={() => setShowPriceHistory(false)}
      />

      <CopyPricesModal
        show={showCopyModal}
        salespeople={salespeople}
        selectedSpId={selectedSpId}
        activeBrandId={activeBrandId}
        brands={brands}
        copyFromSpId={copyFromSpId}
        setCopyFromSpId={setCopyFromSpId}
        copyPricesSearch={copyPricesSearch}
        setCopyPricesSearch={setCopyPricesSearch}
        copyingPrices={copyingPrices}
        onClose={() => { setShowCopyModal(false); setCopyFromSpId(''); setCopyPricesSearch(''); }}
        onCopy={handleCopyPrices}
      />

      <BulkUpdatePricesModal
        show={showBulkUpdateModal}
        globalProducts={globalProducts}
        activeBrandId={activeBrandId}
        bulkUpdateForm={bulkUpdateForm}
        setBulkUpdateForm={setBulkUpdateForm}
        bulkUpdateProductSearch={bulkUpdateProductSearch}
        setBulkUpdateProductSearch={setBulkUpdateProductSearch}
        bulkUpdateSalesmenSearch={bulkUpdateSalesmenSearch}
        setBulkUpdateSalesmenSearch={setBulkUpdateSalesmenSearch}
        salespeople={salespeople}
        updatingBulkPrices={updatingBulkPrices}
        addProductToUpdate={addProductToUpdate}
        removeProductFromUpdate={removeProductFromUpdate}
        handleBulkSalesmenToggle={handleBulkSalesmenToggle}
        onClose={() => setShowBulkUpdateModal(false)}
        onSubmit={handleBulkUpdate}
      />

      <AllSalesmenPricesModal
        show={showAllSalesmenPrices}
        salespeople={salespeople}
        productView={productView}
        onClose={() => setShowAllSalesmenPrices(false)}
      />

      <ClearAllConfirmModal
        show={showClearAllConfirm}
        activeBrandId={activeBrandId}
        brands={brands}
        globalProducts={globalProducts}
        clearingAllPrices={clearingAllPrices}
        onClose={() => setShowClearAllConfirm(false)}
        onConfirm={handleClearAllSalesmanPrices}
      />

      <BulkProductAccessModal
        show={showBulkProductModal}
        salespeople={salespeople}
        globalProducts={globalProducts}
        activeBrandId={activeBrandId}
        bulkProductForm={bulkProductForm}
        setBulkProductForm={setBulkProductForm}
        bulkProductSearch={bulkProductSearch}
        setBulkProductSearch={setBulkProductSearch}
        updatingBulkProducts={updatingBulkProducts}
        onClose={() => setShowBulkProductModal(false)}
        onSubmit={handleBulkProductUpdate}
      />

      <ExceptionManagerModal
        show={showExceptionModal && isSuperAdmin}
        globalProducts={globalProducts}
        brands={brands}
        salespeople={salespeople}
        exceptionForm={exceptionForm}
        setExceptionForm={setExceptionForm}
        exProductSearch={exProductSearch}
        setExProductSearch={setExProductSearch}
        exSpSearch={exSpSearch}
        setExSpSearch={setExSpSearch}
        savingExceptions={savingExceptions}
        onClose={() => { setShowExceptionModal(false); setExProductSearch(''); setExSpSearch(''); }}
        onSave={handleSaveExceptions}
      />
    </div>
  );
}

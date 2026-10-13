import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import { salonService } from '@/services';
import {
  Purchase,
  InventoryItem,
  Supplier,
  CreatePurchaseInput,
  PaymentAccount,
  CashDrawer,
  InventoryBatch,
} from '@/types/salon';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import { InventoryNavHeader } from './InventoryNavHeader';
import {
  ArrowDownRight,
  Plus,
  Search,
  Filter,
  Truck,
  Package,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Info,
  Banknote,
  Receipt,
  Layers,
  Loader2,
  X,
  CreditCard,
  Building2,
} from 'lucide-react';

const formatPKR = (amt: number) => {
  return (Number(amt) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

export const StockInPurchasesPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();
  const { navigate } = useRouter();

  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/operations/stock-in" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const defaultBranchId = isSuperAdmin
    ? (activeBranchId !== 'ALL' ? activeBranchId : allBranches[0]?.id || '')
    : (user.branchId || '');

  const [selectedBranchId, setSelectedBranchId] = useState<string>(defaultBranchId);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [activeDrawer, setActiveDrawer] = useState<CashDrawer | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Stock In Modal State
  const [isStockInModalOpen, setIsStockInModalOpen] = useState<boolean>(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'CREDIT' | 'CASH' | 'ONLINE' | 'PARTIAL'>('CREDIT');
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paymentAccountId, setPaymentAccountId] = useState<string>('');
  const [purchaseNotes, setPurchaseNotes] = useState<string>('');

  // Purchase Line Items
  interface StockInLine {
    itemId: string;
    quantity: number;
    unitPurchaseCost: number;
    batchNumber: string;
    expiryDate?: string;
  }
  const [stockInLines, setStockInLines] = useState<StockInLine[]>([]);

  // Inline Quick Add Vendor Modal
  const [isQuickVendorModalOpen, setIsQuickVendorModalOpen] = useState<boolean>(false);
  const [quickVendorName, setQuickVendorName] = useState<string>('');
  const [quickVendorCompany, setQuickVendorCompany] = useState<string>('');
  const [quickVendorPhone, setQuickVendorPhone] = useState<string>('');

  // Inline Quick Add Product Modal
  const [isQuickProductModalOpen, setIsQuickProductModalOpen] = useState<boolean>(false);
  const [quickProductName, setQuickProductName] = useState<string>('');
  const [quickProductCategory, setQuickProductCategory] = useState<string>('Hair Care');
  const [quickProductCost, setQuickProductCost] = useState<number>(0);
  const [quickProductPrice, setQuickProductPrice] = useState<number>(0);

  const loadData = useCallback(async (bId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [purchList, itemList, suppList, batchList, accounts, drawers] = await Promise.all([
        salonService.getPurchases(bId || 'ALL', user).catch(() => []),
        salonService.getInventoryItems(bId || 'ALL', user).catch(() => []),
        salonService.getSuppliers(bId || 'ALL', user).catch(() => []),
        salonService.getInventoryBatches(bId || 'ALL', undefined, user).catch(() => []),
        salonService.getPaymentAccounts(bId || 'ALL').catch(() => []),
        salonService.getCashDrawers(bId || 'ALL').catch(() => []),
      ]);

      setPurchases(purchList);
      setItems(itemList);
      setSuppliers(suppList);
      setBatches(batchList);
      setPaymentAccounts(accounts);

      const userDrawer = drawers.find((d: any) => d.status === 'OPEN' && d.custodianUserId === user.id) || null;
      setActiveDrawer(userDrawer);

      // Compute stockMap from batches
      const smap: Record<string, number> = {};
      itemList.forEach((it) => {
        const itemBatches = batchList.filter((b) => b.itemId === it.id && (bId === 'ALL' || b.branchId === bId));
        smap[it.id] = itemBatches.reduce((sum, b) => sum + (b.remainingQuantity || 0), 0);
      });
      setStockMap(smap);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load stock in purchases.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData(selectedBranchId);
  }, [loadData, selectedBranchId]);

  // Open Stock In Modal
  const handleOpenStockIn = () => {
    const firstItem = items[0];
    setSelectedSupplierId(suppliers[0]?.id || '');
    setInvoiceNumber(`PO-${Date.now().toString().slice(-6)}`);
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('CREDIT');
    setPaidAmount(0);
    setPaymentAccountId(paymentAccounts[0]?.id || '');
    setPurchaseNotes('');
    setStockInLines([
      {
        itemId: firstItem?.id || '',
        quantity: 10,
        unitPurchaseCost: firstItem?.defaultPurchaseCost || 0,
        batchNumber: `BATCH-${Date.now().toString().slice(-4)}`,
      },
    ]);
    setIsStockInModalOpen(true);
  };

  const handleAddLine = () => {
    const firstItem = items[0];
    setStockInLines((prev) => [
      ...prev,
      {
        itemId: firstItem?.id || '',
        quantity: 1,
        unitPurchaseCost: firstItem?.defaultPurchaseCost || 0,
        batchNumber: `BATCH-${Date.now().toString().slice(-4)}`,
      },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    setStockInLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateLine = (idx: number, updates: Partial<StockInLine>) => {
    setStockInLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, ...updates };
        if (updates.itemId) {
          const matched = items.find((it) => it.id === updates.itemId);
          if (matched && updates.unitPurchaseCost === undefined) {
            updated.unitPurchaseCost = matched.defaultPurchaseCost || 0;
          }
        }
        return updated;
      })
    );
  };

  // Total Calculations
  const calculatedGrandTotal = useMemo(() => {
    return stockInLines.reduce((sum, line) => sum + (line.quantity || 0) * (line.unitPurchaseCost || 0), 0);
  }, [stockInLines]);

  const totalUnitsReceiving = useMemo(() => {
    return stockInLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  }, [stockInLines]);

  // Submit Stock In
  const handleSubmitStockIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      setErrorMessage('Please select or add a supplier/vendor.');
      return;
    }
    if (stockInLines.length === 0) {
      setErrorMessage('Please add at least one product line.');
      return;
    }

    const missingExpiryIndex = stockInLines.findIndex(line =>
      items.find(item => item.id === line.itemId)?.trackExpiry && !line.expiryDate
    );
    if (missingExpiryIndex !== -1) {
      const item = items.find(item => item.id === stockInLines[missingExpiryIndex].itemId);
      setErrorMessage('Product #' + (missingExpiryIndex + 1) + ': Please enter the expiry date for ' + item?.name + '.');
      return;
    }

    if (paymentMethod === 'CASH' && !activeDrawer) {
      setErrorMessage('Payment from Cash Drawer requires an OPEN active cash drawer in your custody.');
      return;
    }

    try {
      const input: CreatePurchaseInput = {
        branchId: selectedBranchId,
        supplierId: selectedSupplierId,
        invoiceNumber: invoiceNumber.trim() || `PO-${Date.now().toString().slice(-6)}`,
        purchaseDate,
        paymentMethod,
        paidAmount: paymentMethod === 'CREDIT' ? 0 : (paymentMethod === 'CASH' || paymentMethod === 'ONLINE' ? calculatedGrandTotal : paidAmount),
        paymentAccountId: paymentMethod === 'ONLINE' ? paymentAccountId : undefined,
        payerDrawerId: paymentMethod === 'CASH' ? activeDrawer?.id : undefined,
        notes: purchaseNotes,
        lines: stockInLines.map((l) => ({
          itemId: l.itemId,
          batchNumber: l.batchNumber,
          quantity: Number(l.quantity) || 1,
          unitPurchaseCost: Number(l.unitPurchaseCost) || 0,
          expiryDate: l.expiryDate || undefined,
        })),
      };

      await salonService.createPurchase(input, user);
      setSuccessMessage(`Stock-in recorded successfully! ${totalUnitsReceiving} units added to inventory. Vendor ledger updated for PKR ${formatPKR(calculatedGrandTotal)}.`);
      setIsStockInModalOpen(false);
      loadData(selectedBranchId);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to record stock in.');
    }
  };

  // Quick Vendor Creation
  const handleQuickAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVendorName.trim()) return;
    try {
      const created = await salonService.createSupplier(
        {
          branchId: selectedBranchId,
          name: quickVendorName.trim(),
          companyName: quickVendorCompany.trim() || quickVendorName.trim(),
          phone: quickVendorPhone.trim() || '—',
          openingPayable: 0,
          isActive: true,
        },
        user
      );
      setSuppliers((prev) => [created, ...prev]);
      setSelectedSupplierId(created.id);
      setIsQuickVendorModalOpen(false);
      setQuickVendorName('');
      setQuickVendorCompany('');
      setQuickVendorPhone('');
      setSuccessMessage(`Vendor "${created.name}" registered and selected.`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to create vendor.');
    }
  };

  // Quick Product Creation
  const handleQuickAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickProductName.trim()) return;
    try {
      const created = await salonService.createInventoryItem(
        {
          branchAvailability: [selectedBranchId],
          name: quickProductName.trim(),
          sku: `SKU-${Date.now().toString().slice(-5)}`,
          code: `SKU-${Date.now().toString().slice(-5)}`,
          category: quickProductCategory || 'General',
          itemType: 'RETAIL_PRODUCT',
          purchaseUnit: 'BOTTLE',
          issueUnit: 'BOTTLE',
          defaultPurchaseCost: Number(quickProductCost) || 0,
          sellingPrice: Number(quickProductPrice) || 0,
          price: Number(quickProductPrice) || 0,
          minStockLevel: 5,
          taxTreatment: 'BRANCH_DEFAULT',
          trackBatch: true,
          trackExpiry: true,
          nearExpiryAlertDays: 60,
          isActive: true,
        },
        user
      );
      setItems((prev) => [created, ...prev]);
      if (stockInLines.length > 0) {
        handleUpdateLine(stockInLines.length - 1, { itemId: created.id, unitPurchaseCost: created.defaultPurchaseCost });
      }
      setIsQuickProductModalOpen(false);
      setQuickProductName('');
      setQuickProductCost(0);
      setQuickProductPrice(0);
      setSuccessMessage(`Product "${created.name}" added to catalogue.`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to create product.');
    }
  };

  // Filtered Purchases
  const filteredPurchases = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return purchases;
    return purchases.filter(
      (p) =>
        (p.invoiceNumber && p.invoiceNumber.toLowerCase().includes(q)) ||
        (p.supplierName && p.supplierName.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q))
    );
  }, [purchases, searchQuery]);

  // KPIs
  const kpis = useMemo(() => {
    let totalSpent = 0;
    let totalPurchases = purchases.length;
    let totalCredit = 0;

    purchases.forEach((p) => {
      totalSpent += p.totalCost || 0;
      if (p.paymentMethod === 'CREDIT' || p.paymentStatus === 'UNPAID') {
        totalCredit += p.totalCost || 0;
      }
    });

    return {
      totalPurchases,
      totalSpent,
      totalCredit,
    };
  }, [purchases]);

  return (
    <div className="min-h-screen bg-[#F4F6F9] px-4 py-6 md:px-8 max-w-7xl mx-auto font-['Inter',sans-serif]">
      {/* Header */}
      <InventoryNavHeader
        title="Stock In & Purchases"
        subtitle="Receive new stock shipments from suppliers, verify stock on hand before merging, and record vendor ledger bills."
        activePath="/operations/stock-in"
        selectedBranchId={selectedBranchId}
        onBranchChange={setSelectedBranchId}
        primaryAction={{
          label: 'New Stock In (Mangwana)',
          icon: <ArrowDownRight className="w-3.5 h-3.5" />,
          onClick: handleOpenStockIn,
        }}
        secondaryAction={{
          label: 'Suppliers Directory',
          icon: <Truck className="w-3.5 h-3.5 text-[#0047AB]" />,
          onClick: () => navigate('/operations/suppliers'),
        }}
      />

      {/* Notifications */}
      {successMessage && (
        <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {errorMessage && (
        <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-700 hover:text-rose-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Stock-In Orders
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#0047AB] flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{kpis.totalPurchases}</div>
          <div className="text-[11px] text-slate-500 mt-1">Recorded purchase shipments</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Inventory Purchased
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-800">PKR {formatPKR(kpis.totalSpent)}</div>
          <div className="text-[11px] text-emerald-600 mt-1">Cumulative inventory intake value</div>
        </div>

        <div className="bg-white rounded-xl border border-amber-200/80 p-4 shadow-xs bg-linear-to-br from-white to-amber-50/20">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
              Vendor Credit Orders (Payable)
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-900">PKR {formatPKR(kpis.totalCredit)}</div>
          <div className="text-[11px] text-amber-700 mt-1">Purchases on supplier khata</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-4 mb-6 flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by PO #, Supplier, Invoice..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
          />
        </div>
        <button
          type="button"
          onClick={handleOpenStockIn}
          className="text-xs font-semibold px-4 py-2 bg-[#0047AB] hover:bg-[#003785] text-white rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <ArrowDownRight className="w-3.5 h-3.5" />
          <span>New Stock In</span>
        </button>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden mb-8">
        <div className="bg-[#0047AB] text-white px-5 py-3 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-2 font-bold text-sm tracking-wide">
            <ArrowDownRight className="w-4 h-4 stroke-[2.5]" />
            <span>Stock In Orders & Receiving Log ({filteredPurchases.length})</span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-10 h-10 animate-spin text-[#0047AB] mb-3" />
            <p className="text-slate-600 text-sm font-medium">Loading stock in records...</p>
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <ArrowDownRight className="w-12 h-12 stroke-[1.25] text-slate-400 mb-3" />
            <p className="text-slate-600 text-sm font-semibold mb-1">No stock in orders recorded yet</p>
            <p className="text-slate-400 text-xs mb-4">Record your first stock shipment from a supplier to update inventory.</p>
            <button
              onClick={handleOpenStockIn}
              className="text-xs font-semibold px-4 py-2 bg-[#0047AB] text-white rounded-md hover:bg-[#003785] transition-colors"
            >
              Record First Stock In
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left border-collapse text-[13px]">
              <thead>
                <tr className="bg-[#EAF2FB] border-b border-blue-100 text-[#475569] font-medium text-[13px]">
                  <th className="py-3.5 px-4 text-center w-12">#</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">PO / Invoice #</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Date</th>
                  <th className="py-3.5 px-4 min-w-[180px]">Supplier / Vendor</th>
                  <th className="py-3.5 px-4 text-center whitespace-nowrap">Items Received</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap font-bold">Total Bill (PKR)</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Payment Method</th>
                  <th className="py-3.5 px-4 text-center whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-slate-200">
                {filteredPurchases.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="py-3.5 px-4 text-center text-slate-400 font-normal">
                      {idx + 1}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap font-semibold text-[#0047AB]">
                      {p.invoiceNumber || p.supplierInvoiceNumber || `PO-${p.id.slice(0, 6)}`}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-700">
                      {formatDate(p.purchaseDate)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-900 font-medium">
                      {p.supplierName}
                    </td>
                    <td className="py-3.5 px-4 text-center text-slate-700 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-800 font-semibold">
                        {p.lines?.length || 1} Products
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                      PKR {formatPKR(p.totalCost ?? 0)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {p.paymentMethod === 'CREDIT' ? (
                        <span className="text-amber-700 font-semibold">Supplier Credit (Khata)</span>
                      ) : p.paymentMethod === 'CASH' ? (
                        <span className="text-emerald-700 font-semibold">Cash Drawer</span>
                      ) : (
                        <span className="text-blue-700 font-semibold">Bank Transfer</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                        {p.paymentStatus || 'COMPLETED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODAL: NEW STOCK IN (MANGWANA) --- */}
      {isStockInModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ArrowDownRight className="w-5 h-5 text-[#0047AB]" />
                  <span>Receive Stock Shipment (Stock In / Mangwana)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Check stock on hand before receiving. Ledger bill is calculated strictly on newly ordered quantity.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsStockInModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitStockIn} className="space-y-5 pt-4">
              {/* Row 1: Supplier Picker with Quick Add Button */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Supplier / Vendor *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsQuickVendorModalOpen(true)}
                      className="text-[11px] font-bold text-[#0047AB] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Add New Vendor Directly</span>
                    </button>
                  </div>
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden"
                  >
                    <option value="">Select a Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.companyName || 'Vendor'}) — Khata: PKR {formatPKR(s.currentPayable ?? s.currentBalance ?? 0)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Supplier Invoice / PO # *
                  </label>
                  <input
                    type="text"
                    required
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Shipment Products & Quantities
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsQuickProductModalOpen(true)}
                      className="text-xs font-semibold text-slate-700 hover:text-[#0047AB] flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Add New Product</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="text-xs font-semibold text-white bg-[#0047AB] hover:bg-[#003785] flex items-center gap-1 px-3 py-1 rounded-md cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Another Item</span>
                    </button>
                  </div>
                </div>

                {stockInLines.map((line, idx) => {
                  const item = items.find((it) => it.id === line.itemId);
                  const currentStockOnHand = item ? (stockMap[item.id] ?? 0) : 0;
                  const newQuantity = Number(line.quantity) || 0;
                  const totalAfterStockIn = currentStockOnHand + newQuantity;
                  const lineTotalCost = newQuantity * (Number(line.unitPurchaseCost) || 0);

                  return (
                    <div
                      key={idx}
                      className="p-4 bg-white border border-blue-200/80 rounded-xl space-y-3 shadow-2xs"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        {/* Select Product */}
                        <div className="sm:col-span-5">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Product #{idx + 1}
                          </label>
                          <select
                            value={line.itemId}
                            onChange={(e) => handleUpdateLine(idx, { itemId: e.target.value })}
                            className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden"
                          >
                            {items.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name} ({it.sku})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Quantity Receiving */}
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Qty Mangwaya *
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => handleUpdateLine(idx, { quantity: Number(e.target.value) })}
                            className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-hidden"
                          />
                        </div>

                        {/* Unit Purchase Cost */}
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Unit Cost (PKR)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unitPurchaseCost}
                            onChange={(e) => handleUpdateLine(idx, { unitPurchaseCost: Number(e.target.value) })}
                            className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-hidden"
                          />
                        </div>

                        {/* Line Total */}
                        <div className="sm:col-span-2 text-right">
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                            Ledger Bill
                          </label>
                          <div className="text-xs font-bold text-slate-900 py-2">
                            PKR {formatPKR(lineTotalCost)}
                          </div>
                        </div>

                        {/* Remove Button */}
                        <div className="sm:col-span-1 text-right">
                          {stockInLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 cursor-pointer"
                              title="Remove item"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="max-w-xs">
                        <label htmlFor={'stock-in-expiry-' + idx} className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Expiry Date {item?.trackExpiry ? '*' : '(Optional)'}
                        </label>
                        <input
                          id={'stock-in-expiry-' + idx}
                          type="date"
                          value={line.expiryDate || ''}
                          required={!!item?.trackExpiry}
                          onChange={(e) => handleUpdateLine(idx, { expiryDate: e.target.value || undefined })}
                          className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-hidden"
                        />
                        {item?.trackExpiry && (
                          <p className="mt-1 text-[11px] text-slate-500">Enter the expiry date printed on this batch.</p>
                        )}
                      </div>

                      {/* Stock Clarity Banner (Addressing user instruction directly!) */}
                      <div className="bg-[#EAF2FB] border border-blue-200/60 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between text-xs gap-2">
                        <div className="flex items-center gap-2">
                          <Info className="w-3.5 h-3.5 text-[#0047AB]" />
                          <span className="text-slate-700">
                            Pehle se pada hua stock:{' '}
                            <strong className="text-slate-900 font-bold">
                              {currentStockOnHand} {item?.purchaseUnit || 'Units'}
                            </strong>
                          </span>
                        </div>
                        <div className="text-slate-700">
                          Naya Mangwaya:{' '}
                          <strong className="text-[#0047AB] font-bold">
                            +{newQuantity} {item?.purchaseUnit || 'Units'}
                          </strong>
                        </div>
                        <div className="text-emerald-800 font-bold">
                          Kul Stock Baad Mein:{' '}
                          <span className="underline">{totalAfterStockIn} {item?.purchaseUnit || 'Units'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Payment & Ledger Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Method / Settlement *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden"
                  >
                    <option value="CREDIT">Supplier Credit (Vendor Khata / Unpaid)</option>
                    <option value="CASH">Cash Drawer (Disburse from Active Custody)</option>
                    <option value="ONLINE">Bank / Online Account Transfer</option>
                  </select>
                </div>

                {paymentMethod === 'ONLINE' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bank / Online Account *
                    </label>
                    <select
                      value={paymentAccountId}
                      onChange={(e) => setPaymentAccountId(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden"
                    >
                      {paymentAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.bankName || 'Online'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {paymentMethod === 'CASH' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cash Custody Drawer
                    </label>
                    <div className="text-xs py-2 px-3 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium">
                      {activeDrawer ? `Drawer: ${activeDrawer.drawerName} (Your Active Session)` : 'No open drawer!'}
                    </div>
                  </div>
                )}
              </div>

              {/* Ledger Charging Guarantee Box */}
              <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <strong>Ledger Accuracy Guarantee:</strong> Vendor bill pricing is calculated strictly on the newly received <strong>{totalUnitsReceiving} units (PKR {formatPKR(calculatedGrandTotal)})</strong>. Pre-existing stock on hand remains merged in inventory without generating duplicate ledger charges.
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="text-sm font-bold text-slate-900">
                  Total Bill: <span className="text-[#0047AB]">PKR {formatPKR(calculatedGrandTotal)}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsStockInModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 text-xs font-semibold text-white bg-[#0047AB] hover:bg-[#003785] rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>Confirm & Stock In</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- INLINE MODAL: QUICK ADD VENDOR --- */}
      {isQuickVendorModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#0047AB]" />
                <span>Add New Vendor / Supplier Directly</span>
              </h3>
              <button onClick={() => setIsQuickVendorModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleQuickAddVendor} className="space-y-3.5 pt-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vendor Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Asad Traders"
                  value={quickVendorName}
                  onChange={(e) => setQuickVendorName(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company / Brand Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. L'Oreal Official Distributor"
                  value={quickVendorCompany}
                  onChange={(e) => setQuickVendorCompany(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Phone
                </label>
                <input
                  type="text"
                  placeholder="e.g. 0300-1234567"
                  value={quickVendorPhone}
                  onChange={(e) => setQuickVendorPhone(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQuickVendorModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0047AB] hover:bg-[#003785] rounded-lg shadow-xs"
                >
                  Register Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- INLINE MODAL: QUICK ADD PRODUCT --- */}
      {isQuickProductModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-[#0047AB]" />
                <span>Add New Product to Catalogue</span>
              </h3>
              <button onClick={() => setIsQuickProductModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleQuickAddProduct} className="space-y-3.5 pt-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Keratin Shampoo 500ml"
                  value={quickProductName}
                  onChange={(e) => setQuickProductName(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hair Care"
                  value={quickProductCategory}
                  onChange={(e) => setQuickProductCategory(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Default Cost (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={quickProductCost}
                    onChange={(e) => setQuickProductCost(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Retail Price (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={quickProductPrice}
                    onChange={(e) => setQuickProductPrice(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQuickProductModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0047AB] hover:bg-[#003785] rounded-lg shadow-xs"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default StockInPurchasesPage;

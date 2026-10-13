import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from '@/context/RouterContext';
import { salonService } from '@/services';
import {
  Supplier,
  SupplierLedgerEntry,
  PaySupplierInput,
  PaymentAccount,
  CashDrawer,
} from '@/types/salon';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import { InventoryNavHeader } from './InventoryNavHeader';
import {
  Truck,
  Plus,
  Search,
  Filter,
  Banknote,
  Phone,
  Mail,
  Building2,
  Receipt,
  CreditCard,
  History,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Edit2,
  FileText,
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

export const SuppliersVendorsPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();
  const { navigate } = useRouter();

  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/operations/suppliers" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const defaultBranchId = isSuperAdmin
    ? (activeBranchId !== 'ALL' ? activeBranchId : allBranches[0]?.id || '')
    : (user.branchId || '');

  const [selectedBranchId, setSelectedBranchId] = useState<string>(defaultBranchId);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [activeDrawer, setActiveDrawer] = useState<CashDrawer | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Add/Edit Supplier Modal
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierFormData, setSupplierFormData] = useState<{
    name: string;
    companyName: string;
    contactPerson: string;
    phone: string;
    email: string;
    address: string;
    taxNumber: string;
    openingBalance: number;
  }>({
    name: '',
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    taxNumber: '',
    openingBalance: 0,
  });

  // Pay Supplier Modal
  const [isPayModalOpen, setIsPayModalOpen] = useState<boolean>(false);
  const [payingSupplier, setPayingSupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'CASH' | 'ONLINE'>('CASH');
  const [payAccountId, setPayAccountId] = useState<string>('');
  const [payReference, setPayReference] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');

  // Khata Ledger Drawer / Modal
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState<boolean>(false);
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<SupplierLedgerEntry[]>([]);
  const [isLedgerLoading, setIsLedgerLoading] = useState<boolean>(false);

  const loadData = useCallback(async (bId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [suppList, accounts, drawers] = await Promise.all([
        salonService.getSuppliers(bId || 'ALL', user).catch(() => []),
        salonService.getPaymentAccounts(bId || 'ALL').catch(() => []),
        salonService.getCashDrawers(bId || 'ALL').catch(() => []),
      ]);
      setSuppliers(suppList);
      setPaymentAccounts(accounts);

      const userDrawer = drawers.find((d: any) => d.status === 'OPEN' && d.custodianUserId === user.id) || null;
      setActiveDrawer(userDrawer);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load suppliers.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData(selectedBranchId);
  }, [loadData, selectedBranchId]);

  // KPIs
  const kpis = useMemo(() => {
    let totalPayables = 0;
    let suppliersWithDebt = 0;

    suppliers.forEach((s) => {
      const bal = s.currentPayable ?? s.currentBalance ?? 0;
      totalPayables += bal;
      if (bal > 0) suppliersWithDebt++;
    });

    return {
      totalSuppliers: suppliers.length,
      totalPayables,
      suppliersWithDebt,
    };
  }, [suppliers]);

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.companyName && s.companyName.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q)) ||
        (s.contactPerson && s.contactPerson.toLowerCase().includes(q))
    );
  }, [suppliers, searchQuery]);

  // Open Add Supplier Modal
  const handleOpenAddModal = () => {
    setEditingSupplier(null);
    setSupplierFormData({
      name: '',
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      taxNumber: '',
      openingBalance: 0,
    });
    setIsSupplierModalOpen(true);
  };

  const handleOpenEditModal = (s: Supplier) => {
    setEditingSupplier(s);
    setSupplierFormData({
      name: s.name,
      companyName: s.companyName || '',
      contactPerson: s.contactPerson || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      taxNumber: s.taxNumber || '',
      openingBalance: s.openingPayable || s.openingBalance || 0,
    });
    setIsSupplierModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierFormData.name?.trim()) {
      setErrorMessage('Vendor name is required.');
      return;
    }

    try {
      if (editingSupplier) {
        await salonService.updateSupplier(
          editingSupplier.id,
          {
            name: supplierFormData.name,
            companyName: supplierFormData.companyName,
            contactPerson: supplierFormData.contactPerson,
            phone: supplierFormData.phone,
            email: supplierFormData.email,
            address: supplierFormData.address,
            taxNumber: supplierFormData.taxNumber,
          },
          user
        );
        setSuccessMessage(`Supplier "${supplierFormData.name}" updated successfully.`);
      } else {
        await salonService.createSupplier(
          {
            branchId: selectedBranchId,
            name: supplierFormData.name,
            companyName: supplierFormData.companyName || supplierFormData.name,
            contactPerson: supplierFormData.contactPerson,
            phone: supplierFormData.phone || '—',
            email: supplierFormData.email,
            address: supplierFormData.address,
            taxNumber: supplierFormData.taxNumber,
            openingPayable: Number(supplierFormData.openingBalance) || 0,
            openingBalance: Number(supplierFormData.openingBalance) || 0,
            isActive: true,
          },
          user
        );
        setSuccessMessage(`New supplier "${supplierFormData.name}" registered successfully.`);
      }
      setIsSupplierModalOpen(false);
      loadData(selectedBranchId);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save supplier.');
    }
  };

  // Open Pay Supplier Modal
  const handleOpenPayModal = (s: Supplier) => {
    const bal = s.currentPayable ?? s.currentBalance ?? 0;
    setPayingSupplier(s);
    setPayAmount(bal > 0 ? bal : 0);
    setPayMethod('CASH');
    setPayAccountId(paymentAccounts[0]?.id || '');
    setPayReference(`PAY-${Date.now().toString().slice(-6)}`);
    setPayNotes('');
    setIsPayModalOpen(true);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingSupplier) return;
    if (payAmount <= 0) {
      setErrorMessage('Payment amount must be greater than 0.');
      return;
    }

    if (payMethod === 'CASH' && !activeDrawer) {
      setErrorMessage('Payment from Cash Drawer requires an OPEN active cash drawer in your custody.');
      return;
    }

    try {
      const input: PaySupplierInput = {
        branchId: selectedBranchId,
        supplierId: payingSupplier.id,
        amount: Number(payAmount),
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: payMethod,
        paymentAccountId: payMethod === 'ONLINE' ? payAccountId : undefined,
        payerDrawerId: payMethod === 'CASH' ? activeDrawer?.id : undefined,
        reference: payReference,
        notes: payNotes,
      };

      await salonService.paySupplier(input, user);
      setSuccessMessage(`Payment voucher of PKR ${formatPKR(payAmount)} recorded for ${payingSupplier.name}. Khata balance updated.`);
      setIsPayModalOpen(false);
      loadData(selectedBranchId);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to record supplier payment.');
    }
  };

  // View Khata Ledger
  const handleOpenLedger = async (s: Supplier) => {
    setLedgerSupplier(s);
    setIsLedgerModalOpen(true);
    setIsLedgerLoading(true);
    try {
      const res = await salonService.getSupplierLedger(s.id, selectedBranchId, undefined, user);
      setLedgerEntries(res?.entries || []);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load supplier ledger.');
    } finally {
      setIsLedgerLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F9] px-4 py-6 md:px-8 max-w-7xl mx-auto font-['Inter',sans-serif]">
      {/* Header */}
      <InventoryNavHeader
        title="Suppliers & Vendors Management"
        subtitle="Maintain vendor directory, outstanding khata balances, purchase histories and disbursement payment vouchers."
        activePath="/operations/suppliers"
        selectedBranchId={selectedBranchId}
        onBranchChange={setSelectedBranchId}
        primaryAction={{
          label: 'Add New Supplier',
          icon: <Plus className="w-3.5 h-3.5" />,
          onClick: handleOpenAddModal,
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
              Total Suppliers / Vendors
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#0047AB] flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{kpis.totalSuppliers}</div>
          <div className="text-[11px] text-slate-500 mt-1">Active vendor partners</div>
        </div>

        <div className="bg-white rounded-xl border border-rose-200/80 p-4 shadow-xs bg-linear-to-br from-white to-rose-50/20">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
              Total Outstanding Payables (Khata)
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-900">PKR {formatPKR(kpis.totalPayables)}</div>
          <div className="text-[11px] text-rose-700 mt-1">Cumulative unpaid supplier balance</div>
        </div>

        <div className="bg-white rounded-xl border border-amber-200/80 p-4 shadow-xs bg-linear-to-br from-white to-amber-50/20">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
              Vendors with Unsettled Khata
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-900">{kpis.suppliersWithDebt}</div>
          <div className="text-[11px] text-amber-700 mt-1">Vendors awaiting payments</div>
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-4 mb-6 flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by vendor name, company, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
          />
        </div>
        <button
          type="button"
          onClick={handleOpenAddModal}
          className="text-xs font-semibold px-4 py-2 bg-[#0047AB] hover:bg-[#003785] text-white rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Supplier</span>
        </button>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden mb-8">
        <div className="bg-[#0047AB] text-white px-5 py-3 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-2 font-bold text-sm tracking-wide">
            <Truck className="w-4 h-4 stroke-[2.5]" />
            <span>Suppliers & Vendors Directory ({filteredSuppliers.length})</span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-10 h-10 animate-spin text-[#0047AB] mb-3" />
            <p className="text-slate-600 text-sm font-medium">Loading suppliers directory...</p>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <Truck className="w-12 h-12 stroke-[1.25] text-slate-400 mb-3" />
            <p className="text-slate-600 text-sm font-semibold mb-1">No suppliers registered yet</p>
            <p className="text-slate-400 text-xs mb-4">Add your product suppliers and distributor contacts.</p>
            <button
              onClick={handleOpenAddModal}
              className="text-xs font-semibold px-4 py-2 bg-[#0047AB] text-white rounded-md hover:bg-[#003785] transition-colors"
            >
              Add First Supplier
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left border-collapse text-[13px]">
              <thead>
                <tr className="bg-[#EAF2FB] border-b border-blue-100 text-[#475569] font-medium text-[13px]">
                  <th className="py-3.5 px-4 text-center w-12">#</th>
                  <th className="py-3.5 px-4 min-w-[180px]">Supplier / Vendor</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Company / Brand</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Contact Details</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap font-bold">Outstanding Khata</th>
                  <th className="py-3.5 px-4 text-center whitespace-nowrap">Status</th>
                  <th className="py-3.5 px-4 text-center whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-slate-200">
                {filteredSuppliers.map((s, idx) => {
                  const bal = s.currentPayable ?? s.currentBalance ?? 0;
                  const hasDebt = bal > 0;

                  return (
                    <tr key={s.id} className="hover:bg-blue-50/20 transition-colors">
                      <td className="py-3.5 px-4 text-center text-slate-400 font-normal">
                        {idx + 1}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{s.name}</div>
                        {s.contactPerson && (
                          <div className="text-[11px] text-slate-400">Rep: {s.contactPerson}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                        {s.companyName || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{s.phone || '—'}</span>
                        </div>
                        {s.email && (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                            <Mail className="w-3 h-3" />
                            <span>{s.email}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {hasDebt ? (
                          <span className="font-bold text-rose-700 text-[14px]">
                            PKR {formatPKR(bal)}
                          </span>
                        ) : (
                          <span className="font-medium text-emerald-700">
                            PKR 0.00 (Settled)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {hasDebt ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                            Payable Due
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            All Settled
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenPayModal(s)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md shadow-2xs flex items-center gap-1 cursor-pointer"
                            title="Record Payment Voucher"
                          >
                            <Banknote className="w-3 h-3" />
                            <span>Pay</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenLedger(s)}
                            className="p-1.5 text-slate-500 hover:text-[#0047AB] hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                            title="View Khata Ledger Statement"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(s)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                            title="Edit Supplier"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODAL: ADD / EDIT SUPPLIER --- */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                {editingSupplier ? 'Edit Supplier' : 'Register New Supplier / Vendor'}
              </h2>
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Vendor / Contact Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Asad Traders"
                    value={supplierFormData.name || ''}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, name: e.target.value })}
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
                    value={supplierFormData.companyName || ''}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, companyName: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0300-1234567"
                    value={supplierFormData.phone || ''}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, phone: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="vendor@example.com"
                    value={supplierFormData.email || ''}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, email: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business Address / City
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shop # 14, Main Market, Lahore"
                  value={supplierFormData.address || ''}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, address: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0047AB] hover:bg-[#003785] rounded-lg shadow-xs cursor-pointer"
                >
                  {editingSupplier ? 'Save Changes' : 'Register Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: PAY SUPPLIER (RECORD PAYMENT VOUCHER) --- */}
      {isPayModalOpen && payingSupplier && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span>Pay Supplier: {payingSupplier.name}</span>
                </h3>
                <div className="text-xs text-rose-700 font-semibold mt-0.5">
                  Current Khata Balance: PKR {formatPKR(payingSupplier.currentPayable ?? payingSupplier.currentBalance ?? 0)}
                </div>
              </div>
              <button onClick={() => setIsPayModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Amount (PKR) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={(payingSupplier.currentPayable ?? payingSupplier.currentBalance ?? 0) > 0 ? (payingSupplier.currentPayable ?? payingSupplier.currentBalance ?? 0) : undefined}
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full text-sm font-bold text-[#0047AB] px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#0047AB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Source *
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden"
                >
                  <option value="CASH">Cash Drawer (Disburse from Active Custody)</option>
                  <option value="ONLINE">Bank / Online Account Transfer</option>
                </select>
              </div>

              {payMethod === 'ONLINE' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Bank / Online Account *
                  </label>
                  <select
                    value={payAccountId}
                    onChange={(e) => setPayAccountId(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden"
                  >
                    {paymentAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.bankName || 'Bank'}) — PKR {formatPKR(a.currentBalance || 0)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {payMethod === 'CASH' && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-900">
                  {activeDrawer ? (
                    <div>Disbursing from active drawer <strong>#{activeDrawer.drawerName}</strong></div>
                  ) : (
                    <div className="text-rose-700 font-bold">No active drawer open! Open shift custody first.</div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Reference / Voucher #
                </label>
                <input
                  type="text"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm Payment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: KHATA LEDGER STATEMENT --- */}
      {isLedgerModalOpen && ledgerSupplier && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-[#0047AB]" />
                  <span>Khata Ledger: {ledgerSupplier.name}</span>
                </h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  Chronological purchases, payments and running debt balance.
                </div>
              </div>
              <button onClick={() => setIsLedgerModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto py-4 flex-1">
              {isLedgerLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#0047AB] mb-2" />
                  <p className="text-slate-500 text-xs">Loading ledger entries...</p>
                </div>
              ) : ledgerEntries.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No recorded ledger transactions for this supplier yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Reference</th>
                      <th className="py-2.5 px-3 text-right">Debit (Bill)</th>
                      <th className="py-2.5 px-3 text-right">Credit (Paid)</th>
                      <th className="py-2.5 px-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledgerEntries.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-600">{formatDate(e.date)}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800">{e.entryType || e.type}</td>
                        <td className="py-2 px-3 text-slate-600">{e.referenceNumber || e.reference || '—'}</td>
                        <td className="py-2 px-3 text-right font-medium text-slate-900">
                          {e.debit > 0 ? `PKR ${formatPKR(e.debit)}` : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-emerald-700">
                          {e.credit > 0 ? `PKR ${formatPKR(e.credit)}` : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-[#0047AB]">
                          PKR {formatPKR(e.runningBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              <div className="text-xs font-bold text-slate-900">
                Current Khata Balance:{' '}
                <span className="text-rose-700">PKR {formatPKR(ledgerSupplier.currentPayable ?? ledgerSupplier.currentBalance ?? 0)}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsLedgerModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SuppliersVendorsPage;

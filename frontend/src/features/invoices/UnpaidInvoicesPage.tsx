import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import { Invoice, PaymentAccount, InvoiceStatus, POSPaymentEntry } from '@/types/salon';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import { ReceiptModal } from '@/features/pos/ReceiptModal';
import { formatCurrency } from '@/lib/formatters';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Search,
  AlertCircle,
  CreditCard,
  Banknote,
  Receipt,
  Phone,
  User,
  Calendar,
  Building2,
  RefreshCw,
  Coins,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

export const UnpaidInvoicesPage: React.FC = () => {
  const { user, activeBranchId, allBranches, demoDate } = useAuth();

  // Role guard: Super Admin, Admin, and Accountant
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/unpaid-invoices" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const branchScope = isSuperAdmin ? activeBranchId : (user.branchId as string);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Collect Payment Modal state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [collectMethod, setCollectMethod] = useState<'CASH' | 'ONLINE'>('CASH');
  const [collectAmount, setCollectAmount] = useState<number>(0);
  const [collectCashTendered, setCollectCashTendered] = useState<number>(0);
  const [selectedOnlineAccountId, setSelectedOnlineAccountId] = useState<string>('');
  const [collectionNotes, setCollectionNotes] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [collectionIdempotencyKey, setCollectionIdempotencyKey] = useState<string>('');

  // Receipt Modal state
  const [receiptInvoice, setReceiptInvoice] = useState<Invoice | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [allInvs, allAccs] = await Promise.all([
        salonService.getInvoices(branchScope),
        salonService.getPaymentAccounts(branchScope),
      ]);
      // Only invoices with pending receivable balances
      const unpaidList = allInvs.filter((inv) => inv.amountDue > 0 && inv.status !== 'PAID');
      setInvoices(unpaidList);
      const activeAccs = allAccs.filter((a) => a.isActive);
      setPaymentAccounts(activeAccs);
      if (activeAccs.length > 0) {
        setSelectedOnlineAccountId(activeAccs[0].id);
      }
    } catch (err) {
      console.error('Failed to load unpaid invoices:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [branchScope, demoDate]);

  // Filtered unpaid invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const q = searchQuery.toLowerCase();
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q) ||
        inv.clientPhone.toLowerCase().includes(q)
      );
    });
  }, [invoices, searchQuery]);

  const totalOutstanding = useMemo(() => {
    return filteredInvoices.reduce((sum, inv) => sum + inv.amountDue, 0);
  }, [filteredInvoices]);

  // Open Collect Modal
  const handleOpenCollect = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setCollectAmount(inv.amountDue);
    setCollectCashTendered(inv.amountDue);
    setCollectError(null);
    setCollectionNotes('');
    setCollectMethod('CASH');

    const key = `COLLECT-${inv.id}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setCollectionIdempotencyKey(key);

    // Find accounts for this invoice's branch
    const branchAccs = paymentAccounts.filter((a) => a.branchId === inv.branchId);
    if (branchAccs.length > 0) {
      setSelectedOnlineAccountId(branchAccs[0].id);
    }

    setIsCollectModalOpen(true);
  };

  // Submit collection
  const handleSubmitCollection = async () => {
    if (!selectedInvoice) return;
    setIsCollecting(true);
    setCollectError(null);

    try {
      const paymentAmount = Math.max(0, collectAmount);
      if (paymentAmount <= 0) {
        throw new Error('Please enter a collection amount greater than 0.');
      }
      if (paymentAmount > selectedInvoice.amountDue) {
        throw new Error(`Collection amount cannot exceed outstanding balance (${selectedInvoice.amountDue} PKR).`);
      }

      const payments: POSPaymentEntry[] = [];

      if (collectMethod === 'CASH') {
        const tendered = Math.max(paymentAmount, collectCashTendered || paymentAmount);
        const change = Math.max(0, tendered - paymentAmount);
        payments.push({
          method: 'CASH',
          amount: paymentAmount,
          billAllocation: paymentAmount,
          tipAllocation: 0,
          cashTendered: tendered,
          changeReturned: change,
        });
      } else {
        const acc = paymentAccounts.find((a) => a.id === selectedOnlineAccountId);
        if (!acc) {
          throw new Error('Please select an active payment account.');
        }
        payments.push({
          method: 'ONLINE_ACCOUNT',
          paymentAccountId: acc.id,
          paymentAccountName: `${acc.name} (${acc.accountIdentifier})`,
          amount: paymentAmount,
          billAllocation: paymentAmount,
          tipAllocation: 0,
        });
      }

      const updated = await salonService.collectInvoicePayment(
        {
          invoiceId: selectedInvoice.id,
          payments,
          idempotencyKey: collectionIdempotencyKey,
          notes: collectionNotes,
        },
        user
      );

      // Successfully collected
      setIsCollectModalOpen(false);
      setReceiptInvoice(updated);
      setIsReceiptOpen(true);
      await loadData();
    } catch (err: any) {
      console.error('Failed to collect payment:', err);
      setCollectError(err.message || 'Payment collection failed.');
    } finally {
      setIsCollecting(false);
    }
  };

  const getBranchName = (bId: string) => {
    return allBranches.find((b) => b.id === bId)?.name || bId;
  };

  return (
    <div className="space-y-4 font-sans max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight">Unpaid Invoices & Receivables</h1>
              <Badge variant="destructive" className="text-[10px]">{invoices.length} Pending</Badge>
            </div>
            <p className="text-xs text-slate-500">
              Follow up customer balances, record payments into cashier drawers, and settle outstanding bills.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={isLoading}
          className="text-xs gap-1.5 self-start sm:self-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Receivables
        </Button>
      </div>

      {/* Aggregate Receivable Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card padding="sm" className="bg-white border-slate-200/80">
          <span className="text-[11px] text-slate-500 block">Total Unpaid Invoices</span>
          <span className="text-lg font-mono font-bold text-slate-900">{filteredInvoices.length}</span>
          <span className="text-[10px] text-slate-400 block">Requiring settlement</span>
        </Card>

        <Card padding="sm" className="bg-white border-slate-200/80">
          <span className="text-[11px] text-slate-500 block">Total Receivable Balance</span>
          <span className="text-lg font-mono font-bold text-rose-600">{formatCurrency(totalOutstanding)}</span>
          <span className="text-[10px] text-slate-400 block">Cumulative unpaid debt</span>
        </Card>

        <Card padding="sm" className="bg-white border-slate-200/80">
          <span className="text-[11px] text-slate-500 block">Operating Collection Date</span>
          <span className="text-lg font-mono font-bold text-[#2254E1]">{demoDate}</span>
          <span className="text-[10px] text-slate-400 block">Receipts will post to today's custody</span>
        </Card>
      </div>

      {/* Search Input */}
      <Card padding="sm">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search customer, phone, or invoice #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8.5 h-8.5 text-xs"
          />
        </div>
      </Card>

      {/* Unpaid Invoices Table */}
      <Card padding="none" className="overflow-hidden border-slate-200/90 shadow-2xs">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/75">
                <TableHead className="text-xs font-semibold">Invoice No.</TableHead>
                <TableHead className="text-xs font-semibold">Sale Date</TableHead>
                {isSuperAdmin && branchScope === 'ALL' && (
                  <TableHead className="text-xs font-semibold">Branch</TableHead>
                )}
                <TableHead className="text-xs font-semibold">Customer Details</TableHead>
                <TableHead className="text-xs font-semibold text-right">Bill Total</TableHead>
                <TableHead className="text-xs font-semibold text-right">Paid So Far</TableHead>
                <TableHead className="text-xs font-semibold text-right">Balance Due</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="w-36 text-center text-xs font-semibold">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isSuperAdmin && branchScope === 'ALL' ? 9 : 8}
                    className="py-12 text-center text-slate-400 text-xs"
                  >
                    No outstanding unpaid invoices found. All client balances are fully reconciled!
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-slate-50/50 transition-colors text-xs">
                    <TableCell className="font-mono font-bold text-slate-900">
                      {inv.invoiceNumber}
                    </TableCell>
                    <TableCell className="text-slate-500 whitespace-nowrap">
                      {inv.date} <span className="text-slate-400 text-[10px]">{inv.time}</span>
                    </TableCell>
                    {isSuperAdmin && branchScope === 'ALL' && (
                      <TableCell className="text-slate-600 whitespace-nowrap">
                        {getBranchName(inv.branchId)}
                      </TableCell>
                    )}
                    <TableCell>
                      <span className="font-semibold text-slate-900 block">{inv.clientName}</span>
                      <span className="text-[10px] text-slate-500 font-mono block flex items-center gap-1">
                        <Phone className="w-2.5 h-2.5" />
                        {inv.clientPhone}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium text-slate-800">
                      {formatCurrency(inv.netSales + inv.tax)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-700">
                      {formatCurrency(inv.amountPaid)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-rose-600 text-sm">
                      {formatCurrency(inv.amountDue)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={inv.status === 'PARTIAL' ? 'warning' : 'destructive'}
                        className="text-[10px]"
                      >
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        onClick={() => handleOpenCollect(inv)}
                        className="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white gap-1 cursor-pointer"
                      >
                        <Coins className="w-3 h-3" />
                        Collect Payment
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* COLLECT PAYMENT MODAL */}
      <Dialog open={isCollectModalOpen} onOpenChange={setIsCollectModalOpen}>
        <DialogContent className="max-w-md font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Coins className="w-5 h-5 text-emerald-600" />
              Collect Outstanding Receivable
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Record customer payment against Invoice {selectedInvoice?.invoiceNumber}.
            </DialogDescription>
          </DialogHeader>

          {collectError && (
            <Alert variant="destructive" className="py-2 text-xs">
              <AlertCircle className="w-4 h-4" />
              <AlertTitle className="text-xs">Collection Error</AlertTitle>
              <AlertDescription className="text-xs">{collectError}</AlertDescription>
            </Alert>
          )}

          {selectedInvoice && (
            <div className="space-y-3.5 text-xs">
              {/* Invoice & Customer summary */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/90 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-semibold text-slate-900">{selectedInvoice.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone:</span>
                  <span className="font-mono text-slate-700">{selectedInvoice.clientPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Original Sale Date:</span>
                  <span className="text-slate-700">{selectedInvoice.date} (retained)</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-rose-700 font-bold">Outstanding Balance Due:</span>
                  <span className="font-mono font-bold text-rose-700 text-sm">
                    {formatCurrency(selectedInvoice.amountDue)}
                  </span>
                </div>
              </div>

              {/* Method choice */}
              <div>
                <label className="font-semibold text-slate-800 block mb-1">Receipt Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCollectMethod('CASH')}
                    className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      collectMethod === 'CASH'
                        ? 'bg-blue-50 border-[#2254E1] text-[#2254E1]'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    Physical Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectMethod('ONLINE')}
                    className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      collectMethod === 'ONLINE'
                        ? 'bg-blue-50 border-[#2254E1] text-[#2254E1]'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    Online Account
                  </button>
                </div>
              </div>

              {/* Amount to Collect Input */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-semibold text-slate-800">Amount to Collect (PKR)</label>
                  <button
                    type="button"
                    onClick={() => {
                      setCollectAmount(selectedInvoice.amountDue);
                      setCollectCashTendered(selectedInvoice.amountDue);
                    }}
                    className="text-[11px] text-[#2254E1] hover:underline font-semibold cursor-pointer"
                  >
                    Full Balance ({formatCurrency(selectedInvoice.amountDue)})
                  </button>
                </div>
                <Input
                  type="number"
                  min="0"
                  max={selectedInvoice.amountDue}
                  value={collectAmount || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setCollectAmount(val);
                    setCollectCashTendered(val);
                  }}
                  className="font-mono font-bold text-sm h-9"
                />
              </div>

              {/* Cash Tendered / Change */}
              {collectMethod === 'CASH' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-0.5">Cash Tendered (PKR)</label>
                    <Input
                      type="number"
                      min="0"
                      value={collectCashTendered || ''}
                      onChange={(e) => setCollectCashTendered(parseFloat(e.target.value) || 0)}
                      className="font-mono h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-0.5">Change Returned (PKR)</label>
                    <div className="h-8 flex items-center font-mono font-bold text-emerald-700 text-xs px-2 bg-slate-50 border border-slate-200 rounded-md">
                      {formatCurrency(Math.max(0, collectCashTendered - collectAmount))}
                    </div>
                  </div>
                </div>
              )}

              {/* Online Account Picker */}
              {collectMethod === 'ONLINE' && (
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Deposit To Payment Account</label>
                  <Select
                    value={selectedOnlineAccountId}
                    onValueChange={setSelectedOnlineAccountId}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentAccounts
                        .filter((a) => a.branchId === selectedInvoice.branchId)
                        .map((acc) => (
                          <SelectItem key={acc.id} value={acc.id} className="text-xs">
                            {acc.name} ({acc.accountIdentifier})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Collection Notes */}
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Collection Notes (Optional)</label>
                <Input
                  placeholder="e.g. Cleared remaining balance via cash till"
                  value={collectionNotes}
                  onChange={(e) => setCollectionNotes(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="p-2.5 rounded bg-blue-50/70 border border-blue-100 text-[11px] text-slate-600">
                <span className="font-semibold text-[#2254E1] block">Financial Custody Audit:</span>
                Receipt will be attributed to <strong>{user.name}</strong> on operating date <strong>{demoDate}</strong>.
                The original invoice date ({selectedInvoice.date}) will remain preserved.
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              disabled={isCollecting}
              onClick={() => setIsCollectModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              disabled={isCollecting || collectAmount <= 0}
              onClick={handleSubmitCollection}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
            >
              {isCollecting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Recording Receipt...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirm Receipt ({formatCurrency(collectAmount)})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PRINTABLE RECEIPT MODAL */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        invoice={receiptInvoice}
        branch={allBranches.find((b) => b.id === receiptInvoice?.branchId) || null}
      />
    </div>
  );
};

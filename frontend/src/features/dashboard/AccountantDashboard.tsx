import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from '../../context/RouterContext';
import { salonService, AccountantDashboardData } from '../../services';
import { formatCurrency } from '../../lib/formatters';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Wallet,
  Receipt,
  CreditCard,
  Scale,
  RefreshCw,
  Building2,
  Lock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  PlusCircle,
} from 'lucide-react';

export const AccountantDashboard: React.FC = () => {
  const { user, demoDate } = useAuth();
  const { navigate } = useRouter();

  const [data, setData] = useState<AccountantDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const branchId = user.branchId || '';
      const res = await salonService.getAccountantDashboardData(branchId, user.id);
      setData(res);
    } catch (err) {
      console.error('Failed to load Accountant dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user, demoDate]);

  if (isLoading || !data) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-8 h-8 text-[#2254E1] animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading cash drawer custody and accounts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title & Role Scope Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="primary" dot>
              Cashier & Accounts Custody
            </Badge>
            <span className="text-xs text-slate-400">·</span>
            <div className="flex items-center gap-1 text-xs font-semibold text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span>{data.branch.name}</span>
              <Lock className="w-3 h-3 text-slate-400 ml-1" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Cash Drawer Custody & Daily Settlement
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={loadData}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            onClick={() => navigate('/accounts/account-settlement')}
          >
            Initiate Cash Settlement
          </Button>
        </div>
      </div>

      {/* TOP 5 FINANCIAL CUSTODY KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Physical Cash in Drawer"
          value={formatCurrency(data.cashCustodyBalance)}
          subtitle="Net in cashier custody"
          icon={<Wallet className="w-4 h-4" />}
          tone="primary"
        />
        <StatCard
          title="Today's Cash Inflow"
          value={formatCurrency(data.todayCashCollected)}
          subtitle="Cash POS receipts"
          icon={<Receipt className="w-4 h-4" />}
          tone="success"
        />
        <StatCard
          title="Online Card Inflow"
          value={formatCurrency(data.todayOnlineCollected)}
          subtitle="Direct POS terminals"
          icon={<CreditCard className="w-4 h-4" />}
          tone="purple"
        />
        <StatCard
          title="Cash Paid Out (Expenses)"
          value={formatCurrency(data.expensesPaidByAccountant)}
          subtitle="Voucher disbursements"
          icon={<CreditCard className="w-4 h-4" />}
          tone="warning"
        />
        <StatCard
          title="Pending Safe Transfer"
          value={formatCurrency(data.pendingSettlementAmount)}
          subtitle="Awaiting Admin sign-off"
          icon={<Scale className="w-4 h-4" />}
          tone={data.pendingSettlementAmount > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* SETTLEMENT STATUS BANNER */}
      {data.settlementStatus === 'PENDING_VERIFICATION' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/90 flex items-start justify-between gap-4 text-xs text-amber-900">
          <div className="flex items-start gap-3">
            <Scale className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-sm">
                Cash Custody Settlement Pending Admin Vault Verification
              </span>
              <p className="mt-0.5 text-amber-800">
                You submitted <strong className="font-semibold">{formatCurrency(data.pendingSettlementAmount)}</strong> for end-of-shift transfer to Branch Administrator Aamina Sheikh.
                <span className="block mt-0.5 text-slate-600">
                  Note: Business rule prohibits self-approval. Settlement must be acknowledged by the Admin.
                </span>
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/accounts/account-settlement')}
          >
            Review Submission
          </Button>
        </div>
      )}

      {/* TWO COLUMNS: Recent Cash Receipts vs Recent Expense Disbursements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cash Receipts */}
        <Card padding="none">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Today's Physical Cash Collections</h3>
              <p className="text-xs text-slate-500">Invoices settled in physical tender</p>
            </div>
            <button
              onClick={() => navigate('/pos')}
              className="text-xs font-semibold text-[#2254E1] hover:underline cursor-pointer"
            >
              Collect New Payment
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {data.recentCashReceipts.map((inv) => (
              <div key={inv.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800">{inv.invoiceNumber}</span>
                    <Badge size="sm" variant="success">PAID CASH</Badge>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {inv.clientName} · Processed at {inv.time}
                  </p>
                  {inv.tip > 0 && (
                    <p className="text-[11px] text-purple-700 font-medium">
                      Includes {formatCurrency(inv.tip)} tip in cash envelope
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 tabular-nums block">
                    {formatCurrency(inv.total)}
                  </span>
                  <span className="text-[10px] text-slate-400">Exact Tender</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Expense Disbursements */}
        <Card padding="none">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Cash Drawer Disbursements</h3>
              <p className="text-xs text-slate-500">Emergency supplies & petty cash vouchers</p>
            </div>
            <button
              onClick={() => navigate('/accounts/expenses')}
              className="text-xs font-semibold text-[#2254E1] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Record Expense</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {data.recentDisbursements.map((exp) => (
              <div key={exp.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-800">{exp.voucherNumber}</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                      {exp.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 mt-0.5 font-medium">{exp.title}</p>
                  <p className="text-[11px] text-slate-400">Paid from: {exp.paymentSource.replace('_', ' ')}</p>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-rose-700 tabular-nums block">
                    -{formatCurrency(exp.amount)}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-medium">Voucher Signed</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Quick Access to Financial Reports Permitted for Accountant */}
      <Card padding="md" className="bg-slate-50/50">
        <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2.5">
          Authorized Financial Tools & Reports
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <button
            onClick={() => navigate('/accounts/my-balance-sheet')}
            className="p-3 rounded-lg bg-white border border-slate-200 hover:border-[#2254E1] hover:bg-blue-50/30 transition-all text-left cursor-pointer"
          >
            <p className="font-semibold text-slate-900">My Balance Sheet</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Drawer float reconciliation</p>
          </button>
          <button
            onClick={() => navigate('/reports/unpaid-invoices')}
            className="p-3 rounded-lg bg-white border border-slate-200 hover:border-[#2254E1] hover:bg-blue-50/30 transition-all text-left cursor-pointer"
          >
            <p className="font-semibold text-slate-900">Unpaid Invoices</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{data.unpaidInvoicesCount} invoices pending collection</p>
          </button>
          <button
            onClick={() => navigate('/reports/income-expense')}
            className="p-3 rounded-lg bg-white border border-slate-200 hover:border-[#2254E1] hover:bg-blue-50/30 transition-all text-left cursor-pointer"
          >
            <p className="font-semibold text-slate-900">Income & Expense</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Approved revenue statement</p>
          </button>
          <button
            onClick={() => navigate('/reports/cash-drawer')}
            className="p-3 rounded-lg bg-white border border-slate-200 hover:border-[#2254E1] hover:bg-blue-50/30 transition-all text-left cursor-pointer"
          >
            <p className="font-semibold text-slate-900">Cash Drawer Log</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Audit log of all shift floats</p>
          </button>
        </div>
      </Card>
    </div>
  );
};

import React from 'react';
import { BranchFinancialMetrics } from '../../../services/salonService';
import { Appointment, Invoice, OnlineAccount, CashDrawer } from '../../../types/salon';
import { formatCurrency, formatNumber } from '../../../lib/formatters';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Banknote,
  Landmark,
  Wallet,
  TrendingUp,
  AlertCircle,
  Receipt,
  Calendar,
  CreditCard,
  Coins,
  Scale,
} from 'lucide-react';

interface BranchOperationalSectionsProps {
  metrics: BranchFinancialMetrics;
  onlineAccounts: OnlineAccount[];
  todayAppointments: Appointment[];
  recentInvoices: Invoice[];
  cashDrawers: CashDrawer[];
  onNavigateAppointments?: () => void;
  onNavigateInvoices?: () => void;
  onNavigateAccounts?: () => void;
  onNavigateSettlement?: () => void;
}

export const BranchOperationalSections: React.FC<BranchOperationalSectionsProps> = ({
  metrics,
  onlineAccounts,
  todayAppointments,
  recentInvoices,
  cashDrawers,
  onNavigateAppointments,
  onNavigateInvoices,
  onNavigateAccounts,
  onNavigateSettlement,
}) => {
  return (
    <div className="space-y-6">
      {/* 6 Core Financial & Cash-Flow KPIs (Responsive 3-column / 2-row layout for comfortable PKR numbers) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Gross Sales (All Invoices)"
          value={formatCurrency(metrics.grossSales)}
          subtitle={`Discounts: ${formatCurrency(metrics.totalDiscounts)} · Net Sales: ${formatCurrency(metrics.netSales)}`}
          icon={<Banknote className="w-4 h-4" />}
          tone="primary"
          trendText="Confirmed"
        />

        <StatCard
          title="Actual Bill Collections"
          value={formatCurrency(metrics.actualCollections)}
          subtitle={`Cash: ${formatCurrency(metrics.cashCollected)} · Online: ${formatCurrency(metrics.onlineCollected)}`}
          icon={<Receipt className="w-4 h-4" />}
          tone="success"
          trendText="Received"
          trendDirection="up"
        />

        <StatCard
          title="Physical Cash in Custody"
          value={formatCurrency(metrics.cashInCustody)}
          subtitle="Net in active counter till"
          icon={<Wallet className="w-4 h-4" />}
          tone="success"
        />

        <StatCard
          title="Named Online Balances"
          value={formatCurrency(metrics.onlineBalancesTotal)}
          subtitle={
            onlineAccounts.length > 0
              ? `${onlineAccounts.length} active branch account${onlineAccounts.length === 1 ? '' : 's'}`
              : 'No online accounts registered'
          }
          icon={<Landmark className="w-4 h-4" />}
          tone="purple"
        />

        <StatCard
          title="Total Expenses Paid"
          value={formatCurrency(metrics.totalExpensesPaid)}
          subtitle={
            metrics.totalExpensesPaid > 0
              ? 'Branch operational expenses paid'
              : 'No expenses paid today'
          }
          icon={<CreditCard className="w-4 h-4" />}
          tone="warning"
        />

        <StatCard
          title="Net Operating Cash Flow"
          value={formatCurrency(metrics.netOperatingCashFlow)}
          subtitle="Collections less paid expenses"
          icon={<TrendingUp className="w-4 h-4" />}
          tone={metrics.netOperatingCashFlow >= 0 ? 'success' : 'warning'}
          trendText={metrics.netOperatingCashFlow >= 0 ? '+Surplus' : 'Deficit'}
          trendDirection={metrics.netOperatingCashFlow >= 0 ? 'up' : 'down'}
        />
      </div>

      {/* Secondary Metrics Strip: Tax Billed, Segregated Tips & Outstanding Receivables */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Provincial Tax Billed (PST/SST)</p>
            <p className="text-base font-semibold text-slate-900 tabular-nums mt-0.5">
              {formatCurrency(metrics.taxBilled)}
            </p>
          </div>
          <span className="text-xs text-slate-400 font-medium">Billed Tax</span>
        </div>

        <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Staff Tips (Segregated)</p>
            <p className="text-base font-semibold text-purple-700 tabular-nums mt-0.5">
              {formatCurrency(metrics.tipsCollected)}
            </p>
          </div>
          <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded font-medium">
            Custody Liability
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Outstanding Receivables</p>
            <p className="text-base font-semibold text-amber-700 tabular-nums mt-0.5">
              {formatCurrency(metrics.outstandingReceivables)}
            </p>
          </div>
          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium">
            Pending Collection
          </span>
        </div>
      </div>

      {/* Online Accounts & Cash Drawer Custody */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Named Online Accounts */}
        <Card padding="md">
          <CardHeader
            title="Named Online Accounts"
            subtitle={`${onlineAccounts.length} active account${onlineAccounts.length === 1 ? '' : 's'} (POS cards, bank checking & wallets)`}
            action={
              onNavigateAccounts && (
                <button
                  onClick={onNavigateAccounts}
                  className="text-xs font-medium text-[#2254E1] hover:underline cursor-pointer"
                >
                  View Accounts
                </button>
              )
            }
          />
          <div className="space-y-3">
            {onlineAccounts.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No online bank or merchant accounts configured for this branch.
              </div>
            ) : (
              onlineAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="p-3.5 rounded-lg border border-slate-200/80 bg-slate-50/50 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-white border border-slate-200 text-slate-700 shrink-0">
                      <Landmark className="w-4 h-4 text-[#2254E1]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {acc.accountName}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span className="font-medium text-slate-700">{acc.bankName}</span>
                        <span>·</span>
                        <span className="text-slate-400">{acc.accountNumberMasked}</span>
                        <span>·</span>
                        <span className="text-emerald-700 font-medium">{acc.lastSyncTime}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(acc.currentBalance)}
                    </div>
                    <span className="text-[11px] text-slate-400 uppercase font-medium">
                      {acc.type.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Cash Custody & Shift Drawers */}
        <Card padding="md">
          <CardHeader
            title="Cash Custody & Shift Drawers"
            subtitle={`${cashDrawers.length} active till${cashDrawers.length === 1 ? '' : 's'} assigned to staff`}
            action={
              onNavigateSettlement && (
                <button
                  onClick={onNavigateSettlement}
                  className="text-xs font-medium text-[#2254E1] hover:underline cursor-pointer"
                >
                  Settlement Console
                </button>
              )
            }
          />

          <div className="space-y-4">
            {cashDrawers.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No active cash drawers assigned for this shift.
              </div>
            ) : (
              cashDrawers.map((drawer, index) => (
                <div
                  key={drawer.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3"
                  title={`Till ID: ${drawer.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-[#2254E1]" />
                      <span className="text-xs font-semibold text-slate-900">
                        Till #{index + 1} · Custodian: {drawer.custodianName}
                      </span>
                    </div>
                    <Badge variant={drawer.variance === 0 ? 'success' : 'danger'}>
                      {drawer.variance === 0 ? 'Balanced' : `Variance: ${formatCurrency(drawer.variance)}`}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[11px] text-slate-400 block">Opening Float</span>
                      <span className="font-medium text-slate-800 tabular-nums">
                        {formatCurrency(drawer.openingCash)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Cash Sales</span>
                      <span className="font-semibold text-emerald-700 tabular-nums">
                        +{formatCurrency(drawer.cashSales)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Paid Out</span>
                      <span className="font-semibold text-rose-700 tabular-nums">
                        -{formatCurrency(drawer.cashExpensesPaid)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 block">Actual in Drawer</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(drawer.actualInDrawer)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Today's Appointments & Recent Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appointments Schedule */}
        <Card padding="none">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Today's Salon Bookings</h3>
              <p className="text-xs text-slate-500">Live chair reservations and client services</p>
            </div>
            {onNavigateAppointments && (
              <button
                onClick={onNavigateAppointments}
                className="text-xs font-medium text-[#2254E1] hover:underline cursor-pointer"
              >
                Calendar View
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {todayAppointments.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No appointments booked for today.
              </div>
            ) : (
              todayAppointments.slice(0, 5).map((apt) => (
                <div key={apt.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-50 text-[#2254E1] shrink-0 mt-0.5">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900">{apt.clientName}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs text-slate-600">{apt.serviceName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span>Stylist: <strong className="text-slate-700 font-medium">{apt.staffName}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-semibold text-slate-900 tabular-nums block">
                      {formatCurrency(apt.price)}
                    </span>
                    <Badge
                      size="sm"
                      variant={
                        apt.status === 'COMPLETED'
                          ? 'success'
                          : apt.status === 'IN_PROGRESS'
                            ? 'primary'
                            : 'warning'
                      }
                    >
                      {apt.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Invoices with Segregated Tips */}
        <Card padding="none">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Recent Transactions & Invoices</h3>
              <p className="text-xs text-slate-500">Service billing, provincial tax & segregated tips</p>
            </div>
            {onNavigateInvoices && (
              <button
                onClick={onNavigateInvoices}
                className="text-xs font-medium text-[#2254E1] hover:underline cursor-pointer"
              >
                All Invoices
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {recentInvoices.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No invoices generated yet for this period.
              </div>
            ) : (
              recentInvoices.map((inv) => (
                <div key={inv.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900">{inv.invoiceNumber}</span>
                      <Badge size="sm" variant={inv.status === 'PAID' ? 'success' : inv.status === 'PARTIAL' ? 'warning' : 'danger'}>
                        {inv.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                      <span>{inv.clientName}</span>
                      <span>·</span>
                      <span>Stylist: {inv.staffName}</span>
                      <span>·</span>
                      <span className="text-slate-400">{inv.paymentMethod}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-semibold text-slate-900 tabular-nums block">
                      {formatCurrency(inv.total)}
                    </span>
                    {inv.tip > 0 && (
                      <span className="text-[11px] text-purple-700 font-medium block">
                        Tip: {formatCurrency(inv.tip)} (Segregated)
                      </span>
                    )}
                    {inv.amountDue > 0 && (
                      <span className="text-[11px] text-amber-700 font-medium block">
                        Due: {formatCurrency(inv.amountDue)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

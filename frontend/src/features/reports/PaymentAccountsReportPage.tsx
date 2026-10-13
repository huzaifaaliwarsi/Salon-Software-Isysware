import React, { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  PaymentAccountsReport,
  PaymentAccountMovementRow,
  PaymentAccountsReportQuery,
} from '@/types/salon';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import {
  downloadReportCsv,
  downloadReportExcel,
  printReportWindow,
} from '@/features/reports/reportUtils';
import {
  Filter,
  FileSpreadsheet,
  FileText,
  Printer,
  Loader2,
  Landmark,
} from 'lucide-react';

const selectClass =
  'w-full text-xs border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] focus:border-[#0047AB] transition-colors';
const inputClass =
  'w-full text-xs border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-[#0047AB] focus:border-[#0047AB] transition-colors';
const labelClass = 'block text-[11px] font-semibold text-[#0B2545] mb-1.5';

const formatPKR = (amt: number, withSign = false) => {
  const num = Number(amt) || 0;
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (withSign) {
    return num >= 0 ? `+${formatted}` : `-${formatted}`;
  }
  return formatted;
};

const formatDateParts = (dateStr: string) => {
  if (!dateStr) return { dayMonth: '—', year: '' };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { dayMonth: dateStr, year: '' };
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    return { dayMonth: `${day} ${month}`, year: `${year}` };
  } catch {
    return { dayMonth: dateStr, year: '' };
  }
};

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    return `${day} ${month}, ${year}`;
  } catch {
    return dateStr;
  }
};

export const PaymentAccountsReportPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role guard: Super Admin, Admin, and Accountant
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/payment-accounts" />;
  }

  // Filter Form State
  const [selectedBranch, setSelectedBranch] = useState<string>(activeBranchId || user.branchId || 'ALL');
  const [selectedDirection, setSelectedDirection] = useState<string>('ALL');
  const [selectedSourceModule, setSelectedSourceModule] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Page state: Only fetch when user explicitly clicks Filter ("filter karna sa aae default nhi")
  const [hasFiltered, setHasFiltered] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [reportData, setReportData] = useState<PaymentAccountsReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch report data on demand from backend API
  const fetchReport = useCallback(
    async (q: PaymentAccountsReportQuery) => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await salonService.getPaymentAccountsReport(q);
        setReportData(data);
      } catch (err: any) {
        console.error('Failed to load Payment Accounts report:', err);
        setErrorMessage(err.message || 'Failed to fetch live payment accounts report from server.');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleApplyFilters = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setHasFiltered(true);

    const query: PaymentAccountsReportQuery = {
      branchId: selectedBranch,
      startDate: fromDate || undefined,
      endDate: toDate || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      preset: !fromDate && !toDate ? 'THIS_MONTH' : 'CUSTOM',
      direction: selectedDirection !== 'ALL' ? selectedDirection : undefined,
      sourceModule: selectedSourceModule !== 'ALL' ? selectedSourceModule : undefined,
      search: searchQuery.trim() || undefined,
    };

    fetchReport(query);
  };

  // Export handlers
  const handleExportExcel = () => {
    if (!reportData || !reportData.rows.length) return;
    const meta: [string, string][] = [
      ['Report', 'Payment Accounts Report'],
      ['Branch', selectedBranch === 'ALL' ? 'All Branches' : reportData.meta.branchName || selectedBranch],
      ['From Date', fromDate || reportData.meta.from || '—'],
      ['To Date', toDate || reportData.meta.to || '—'],
      ['Generated At', new Date().toLocaleString()],
    ];

    const headers = [
      '#',
      'Date',
      'Account',
      'Branch',
      'Direction',
      'Type',
      'Source',
      'Reference',
      'Description',
      'Amount (PKR)',
      'Balance After (PKR)',
    ];

    const rows = reportData.rows.map((r, i) => [
      i + 1,
      formatDateDisplay(r.date),
      r.accountName,
      r.branchName,
      r.direction,
      r.type,
      r.sourceModule,
      r.reference || '—',
      r.description || '—',
      r.amount.toFixed(2),
      r.runningBalance.toFixed(2),
    ]);

    downloadReportExcel('Payment_Accounts_Report', meta, [{ headers, rows }]);
  };

  const handleExportPdf = () => {
    if (!reportData || !reportData.rows.length) return;
    const meta: [string, string][] = [
      ['Report', 'Payment Accounts Report'],
      ['Branch', selectedBranch === 'ALL' ? 'All Branches' : reportData.meta.branchName || selectedBranch],
      ['From Date', fromDate || reportData.meta.from || '—'],
      ['To Date', toDate || reportData.meta.to || '—'],
      ['Generated At', new Date().toLocaleString()],
    ];

    const headers = [
      '#',
      'Date',
      'Account',
      'Branch',
      'Direction',
      'Type',
      'Source',
      'Reference',
      'Description',
      'Amount (PKR)',
      'Balance After (PKR)',
    ];

    const rows = reportData.rows.map((r, i) => [
      i + 1,
      formatDateDisplay(r.date),
      r.accountName,
      r.branchName,
      r.direction,
      r.type,
      r.sourceModule,
      r.reference || '—',
      r.description || '—',
      r.amount.toFixed(2),
      r.runningBalance.toFixed(2),
    ]);

    downloadReportCsv('Payment_Accounts_Report', meta, [{ headers, rows }]);
  };

  const handlePrint = () => {
    if (!reportData || !reportData.rows.length) {
      window.print();
      return;
    }
    const meta: [string, string][] = [
      ['Branch', selectedBranch === 'ALL' ? 'All Branches' : reportData.meta.branchName || selectedBranch],
      ['From Date', fromDate || reportData.meta.from || '—'],
      ['To Date', toDate || reportData.meta.to || '—'],
      ['Total Money In', formatPKR(reportData.kpis.totalMoneyIn)],
      ['Total Money Out', formatPKR(reportData.kpis.totalMoneyOut)],
      ['Closing Balance', formatPKR(reportData.kpis.totalClosingBalance)],
    ];
    const headers = ['#', 'Date', 'Account', 'Branch', 'Direction', 'Reference', 'Amount', 'Balance After'];
    const rows = reportData.rows.map((r, i) => [
      i + 1,
      formatDateDisplay(r.date),
      r.accountName,
      r.branchName,
      r.direction,
      r.reference || '—',
      formatPKR(r.amount),
      formatPKR(r.runningBalance),
    ]);

    printReportWindow({
      title: 'Payment Accounts Report',
      meta,
      headers,
      rows,
    });
  };

  const kpis = reportData?.kpis || {
    totalOpeningBalance: 0,
    totalMoneyIn: 0,
    totalMoneyOut: 0,
    totalTransfersIn: 0,
    totalTransfersOut: 0,
    totalClosingBalance: 0,
    totalMovements: 0,
  };

  return (
    <div className="min-h-screen bg-[#F4F6F9] px-4 py-5 md:px-8 md:py-6 text-slate-800">
      {/* Top Header Card with Title & Filters */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200/90 p-5 md:p-6 mb-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-[#0B2545] tracking-tight">Payment Accounts Reports</h1>
          <p className="text-xs text-slate-500 mt-1">
            Cashflow audit for bank accounts, card terminals and digital wallets: opening balances, receipts, disbursements and closing reconciliations
          </p>
        </div>

        {/* Filters Form Row */}
        <form onSubmit={handleApplyFilters} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3.5 items-end">
          {/* Branch Filter */}
          <div>
            <label className={labelClass}>Branch</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className={selectClass}
            >
              <option value="ALL">All Branches</option>
              {allBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Direction Filter */}
          <div>
            <label className={labelClass}>Cashflow Direction</label>
            <select
              value={selectedDirection}
              onChange={(e) => setSelectedDirection(e.target.value)}
              className={selectClass}
            >
              <option value="ALL">All Directions</option>
              <option value="MONEY_IN">Money In (Inflow)</option>
              <option value="MONEY_OUT">Money Out (Outflow)</option>
            </select>
          </div>

          {/* Source Module Filter */}
          <div>
            <label className={labelClass}>Source Module</label>
            <select
              value={selectedSourceModule}
              onChange={(e) => setSelectedSourceModule(e.target.value)}
              className={selectClass}
            >
              <option value="ALL">All Sources</option>
              <option value="POS_INVOICE">POS Invoice</option>
              <option value="EXPENSE">Expense</option>
              <option value="PAYROLL">Payroll</option>
              <option value="DRAWER_SETTLEMENT">Drawer Settlement</option>
            </select>
          </div>

          {/* From Date */}
          <div>
            <label className={labelClass}>From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* To Date */}
          <div>
            <label className={labelClass}>To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Filter Action Button */}
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[35px] bg-[#0047AB] hover:bg-[#003785] active:bg-[#002b66] text-white font-medium text-xs rounded-md shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <Filter className="w-3.5 h-3.5 fill-current" />
                  <span>Filter</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Main Content Area */}
      {!hasFiltered ? (
        /* Empty State before Filter clicked */
        <div className="bg-white rounded-xl border border-slate-200/90 p-16 md:p-24 flex flex-col items-center justify-center min-h-[380px] shadow-xs text-center">
          <div className="text-slate-400 mb-3">
            <Filter className="w-14 h-14 stroke-[1.25] text-slate-400" />
          </div>
          <p className="text-slate-400 text-sm font-medium">Please apply filters to view reports</p>
        </div>
      ) : isLoading ? (
        /* Loading Skeleton */
        <div className="bg-white rounded-xl border border-slate-200/90 p-16 flex flex-col items-center justify-center min-h-[380px] shadow-xs text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#0047AB] mb-3" />
          <p className="text-slate-600 text-sm font-medium">Loading Payment Accounts Reports...</p>
        </div>
      ) : errorMessage ? (
        /* Error Message */
        <div className="bg-white rounded-xl border border-rose-200 p-8 shadow-xs text-center">
          <p className="text-rose-600 text-sm font-medium mb-3">{errorMessage}</p>
          <button
            onClick={() => handleApplyFilters()}
            className="px-4 py-1.5 bg-[#0047AB] text-white text-xs font-semibold rounded-md shadow-xs hover:bg-[#003785]"
          >
            Retry
          </button>
        </div>
      ) : (
        /* Filtered Data Layout */
        <div className="mb-8">
          {/* Royal Blue Banner Header */}
          <div className="bg-[#0047AB] text-white px-5 py-3 rounded-t-xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <Landmark className="w-5 h-5 text-white/90" />
              <span className="font-semibold text-sm tracking-wide">Account Cashflow Register</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="bg-[#009688] hover:bg-[#00897B] text-white text-xs font-semibold px-3.5 py-1.5 rounded-md flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                CSV
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                className="bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold px-3.5 py-1.5 rounded-md flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                PDF
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="bg-[#4B5563] hover:bg-[#374151] text-white text-xs font-semibold px-3.5 py-1.5 rounded-md flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
            </div>
          </div>

          {/* Table Container with Horizontal Scroll */}
          <div className="bg-white overflow-x-auto rounded-b-xl border border-t-0 border-slate-200/90 shadow-sm">
            <table className="w-full min-w-[1300px] text-left border-collapse font-['Inter',sans-serif] text-[13px] antialiased">
              <thead>
                <tr className="bg-[#EAF2FB] border-b border-blue-100 text-[#475569] font-medium text-[13px]">
                  <th className="py-3.5 px-3 text-center w-8">#</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Date</th>
                  <th className="py-3.5 px-4">Account</th>
                  <th className="py-3.5 px-4">Branch</th>
                  <th className="py-3.5 px-4 text-center">Direction</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Type</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Source</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Reference</th>
                  <th className="py-3.5 px-4">Description</th>
                  <th className="py-3.5 px-4 text-right">Amount</th>
                  <th className="py-3.5 px-4 text-right">Balance After</th>
                </tr>
              </thead>
              <tbody className="text-[#334155]">
                {reportData && reportData.rows.length > 0 ? (
                  reportData.rows.map((row: PaymentAccountMovementRow, idx: number) => {
                    const isInflow = row.direction === 'IN';
                    const dateParts = formatDateParts(row.date);

                    return (
                      <tr key={row.id || idx} className="hover:bg-blue-50/20 transition-colors border-b border-dashed border-slate-200">
                        {/* 1. # */}
                        <td className="py-3.5 px-3 text-center font-normal text-slate-400">
                          {idx + 1}
                        </td>

                        {/* 2. Date */}
                        <td className="py-3.5 px-4 whitespace-nowrap leading-tight">
                          <div className="font-medium text-slate-800">{dateParts.dayMonth}</div>
                          <div className="text-[11px] text-slate-400">{dateParts.year}</div>
                        </td>

                        {/* 3. Account */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-800">
                          {row.accountName}
                        </td>

                        {/* 4. Branch */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                          {row.branchName || 'Main Branch'}
                        </td>

                        {/* 5. Direction */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {isInflow ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#10B981] text-white shadow-2xs">
                              Money In
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#64748B] text-white shadow-2xs">
                              Money Out
                            </span>
                          )}
                        </td>

                        {/* 6. Type */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-700">
                          {row.type}
                        </td>

                        {/* 7. Source */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                          {row.sourceModule}
                        </td>

                        {/* 8. Reference */}
                        <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                          {row.reference || '—'}
                        </td>

                        {/* 9. Description */}
                        <td className="py-3.5 px-4 text-slate-700 max-w-[220px] truncate" title={row.description}>
                          {row.description || '—'}
                        </td>

                        {/* 10. Amount */}
                        <td
                          className={`py-3.5 px-4 text-right tabular-nums font-semibold whitespace-nowrap ${
                            isInflow ? 'text-[#10B981]' : 'text-[#EF4444]'
                          }`}
                        >
                          {isInflow ? `+${formatPKR(row.amount)}` : `-${formatPKR(row.amount)}`}
                        </td>

                        {/* 11. Balance After */}
                        <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                          {formatPKR(row.runningBalance)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400 font-medium">
                      No account movements found for the selected branch, dates, and filters.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Integrated Table Footer */}
              <tfoot className="bg-[#F8FAFC] border-t-2 border-slate-200 font-['Inter',sans-serif] text-[13px] text-[#334155]">
                {/* Row 1: TOTALS (PKR) */}
                <tr className="border-b border-slate-200/70">
                  <td colSpan={9} className="py-3.5 px-4 text-right font-bold text-slate-800 tracking-wide">
                    TOTAL CASHFLOW (PKR)
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-[#10B981]">
                    +{formatPKR(kpis.totalMoneyIn)}
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums font-bold text-slate-800">
                    {formatPKR(kpis.totalClosingBalance)}
                  </td>
                </tr>

                {/* Row 2: Net Cashflow Movement */}
                <tr>
                  <td colSpan={9} className="py-3 px-4 text-right font-medium text-slate-600">
                    Net Account Position (Inflow - Outflow)
                  </td>
                  <td colSpan={2} className="py-3 px-4 text-right tabular-nums font-bold text-[#0047AB] text-sm">
                    +{formatPKR(kpis.totalMoneyIn - kpis.totalMoneyOut)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Footer Branding */}
      <div className="text-center py-4 text-xs text-slate-400 font-medium tracking-wide">
        © iSysware Management System
      </div>
    </div>
  );
};

export default PaymentAccountsReportPage;

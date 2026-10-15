import React, { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  CashDrawerReport,
  CashDrawerReportRow,
  CashDrawerReportQuery,
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
  Vault,
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
    const year = String(d.getFullYear());
    return { dayMonth: `${day} ${month}`, year };
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

export const CashDrawerLogsReportPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role guard: Super Admin, Admin, and Accountant
  if (!user || user.role === 'STAFF') {
    return <AccessDeniedView attemptedPath="/reports/cash-drawer" />;
  }

  // Filter Form State
  const [selectedBranch, setSelectedBranch] = useState<string>(activeBranchId || user.branchId || 'ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Page state: Only fetch when user explicitly clicks Filter ("filter karna sa aae default nhi")
  const [hasFiltered, setHasFiltered] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [reportData, setReportData] = useState<CashDrawerReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch report data on demand from backend API
  const fetchReport = useCallback(
    async (q: CashDrawerReportQuery) => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await salonService.getCashDrawerReport(q);
        setReportData(data);
      } catch (err: any) {
        console.error('Failed to load Cash Drawer report:', err);
        setErrorMessage(err.message || 'Failed to fetch live cash drawer report from server.');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleApplyFilters = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setHasFiltered(true);

    const query: CashDrawerReportQuery = {
      branchId: selectedBranch,
      startDate: fromDate || undefined,
      endDate: toDate || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      preset: !fromDate && !toDate ? 'THIS_MONTH' : 'CUSTOM',
      status: (selectedStatus as any) || 'ALL',
      search: searchQuery.trim() || undefined,
    };

    fetchReport(query);
  };

  // Export handlers
  const handleExportExcel = () => {
    if (!reportData || !reportData.rows.length) return;
    const meta: [string, string][] = [
      ['Report', 'Cash Drawer Logs Report'],
      ['Campus', selectedBranch === 'ALL' ? 'All Campuses' : reportData.meta.branchName || selectedBranch],
      ['From Date', fromDate || reportData.meta.from || '—'],
      ['To Date', toDate || reportData.meta.to || '—'],
      ['Generated At', new Date().toLocaleString()],
    ];

    const headers = [
      '#',
      'Session Date',
      'Custodian',
      'Campus',
      'Status',
      'Opening Float',
      'Sales Cash In',
      'Expenses Out',
      'Tips Paid Out',
      'Expected Cash',
      'Counted Cash',
      'Discrepancy',
    ];

    const rows = reportData.rows.map((r, i) => [
      i + 1,
      formatDateDisplay(r.date),
      r.custodianName,
      r.branchName,
      r.status,
      r.openingFloat.toFixed(2),
      r.cashSales.toFixed(2),
      r.cashExpenses.toFixed(2),
      r.cashTips.toFixed(2),
      r.expectedCash.toFixed(2),
      (r.countedCash ?? 0).toFixed(2),
      r.variance.toFixed(2),
    ]);

    downloadReportExcel('Cash_Drawer_Report', meta, [{ headers, rows }]);
  };

  const handleExportPdf = () => {
    if (!reportData || !reportData.rows.length) return;
    const meta: [string, string][] = [
      ['Report', 'Cash Drawer Logs Report'],
      ['Campus', selectedBranch === 'ALL' ? 'All Campuses' : reportData.meta.branchName || selectedBranch],
      ['From Date', fromDate || reportData.meta.from || '—'],
      ['To Date', toDate || reportData.meta.to || '—'],
      ['Generated At', new Date().toLocaleString()],
    ];

    const headers = [
      '#',
      'Session Date',
      'Custodian',
      'Campus',
      'Status',
      'Opening Float',
      'Sales Cash In',
      'Expenses Out',
      'Tips Paid Out',
      'Expected Cash',
      'Counted Cash',
      'Discrepancy',
    ];

    const rows = reportData.rows.map((r, i) => [
      i + 1,
      formatDateDisplay(r.date),
      r.custodianName,
      r.branchName,
      r.status,
      r.openingFloat.toFixed(2),
      r.cashSales.toFixed(2),
      r.cashExpenses.toFixed(2),
      r.cashTips.toFixed(2),
      r.expectedCash.toFixed(2),
      (r.countedCash ?? 0).toFixed(2),
      r.variance.toFixed(2),
    ]);

    downloadReportCsv('Cash_Drawer_Report', meta, [{ headers, rows }]);
  };

  const handlePrint = () => {
    if (!reportData || !reportData.rows.length) {
      window.print();
      return;
    }
    const meta: [string, string][] = [
      ['Campus', selectedBranch === 'ALL' ? 'All Campuses' : reportData.meta.branchName || selectedBranch],
      ['From Date', fromDate || reportData.meta.from || '—'],
      ['To Date', toDate || reportData.meta.to || '—'],
      ['Expected Closing Cash', formatPKR(reportData.totals.expectedCash)],
      ['Counted Cash', formatPKR(reportData.totals.countedCash)],
      ['Total Discrepancy', formatPKR(reportData.totals.variance)],
    ];
    const headers = ['#', 'Date', 'Custodian', 'Campus', 'Status', 'Opening Float', 'Sales Cash', 'Expected Cash', 'Counted Cash', 'Variance'];
    const rows = reportData.rows.map((r, i) => [
      i + 1,
      formatDateDisplay(r.date),
      r.custodianName,
      r.branchName,
      r.status,
      formatPKR(r.openingFloat),
      formatPKR(r.cashSales),
      formatPKR(r.expectedCash),
      formatPKR(r.countedCash ?? 0),
      formatPKR(r.variance),
    ]);

    printReportWindow({
      title: 'Cash Drawer Logs Report',
      meta,
      headers,
      rows,
    });
  };

  const kpis = reportData?.kpis || {
    totalSessions: 0,
    settledSessions: 0,
    openSessions: 0,
    totalOpeningFloat: 0,
    totalCashSales: 0,
    totalManualCashIn: 0,
    totalManualCashOut: 0,
    totalExpensesPaid: 0,
    totalCashRefunds: 0,
    totalTipsPaidOut: 0,
    totalExpectedClosingCash: 0,
    totalActualCounted: 0,
    totalDiscrepancyVariance: 0,
  };

  return (
    <div className="min-h-screen bg-[#F4F6F9] px-4 py-5 md:px-8 md:py-6 text-slate-800">
      {/* Top Header Card with Title & Filters */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200/90 p-5 md:p-6 mb-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-[#0B2545] tracking-tight">Cash Drawer Logs Reports</h1>
          <p className="text-xs text-slate-500 mt-1">
            Physical cash custody audit by cashier drawer session: expected vs counted cash, tender inflows, expense drops and variance reconciliations
          </p>
        </div>

        {/* Filters Form Row */}
        <form onSubmit={handleApplyFilters} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5 items-end">
          {/* Campus Filter */}
          <div>
            <label className={labelClass}>Campus</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className={selectClass}
            >
              <option value="ALL">All Campuses</option>
              {allBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Session Status Filter */}
          <div>
            <label className={labelClass}>Drawer Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className={selectClass}
            >
              <option value="ALL">All Statuses</option>
              <option value="SETTLED">Settled</option>
              <option value="OPEN">Open</option>
              <option value="SETTLEMENT_PENDING">Pending Settlement</option>
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
          <p className="text-slate-600 text-sm font-medium">Loading Cash Drawer Reports...</p>
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
              <Vault className="w-5 h-5 text-white/90" />
              <span className="font-semibold text-sm tracking-wide">Cash Drawer Custody Register</span>
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
                  <th className="py-3.5 px-4 whitespace-nowrap">Session Date</th>
                  <th className="py-3.5 px-4">Custodian</th>
                  <th className="py-3.5 px-4">Campus</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Opening Float</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">Debits (Cash In)</th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">Credits (Cash Out)</th>
                  <th className="py-3.5 px-4 text-right">Tips Paid</th>
                  <th className="py-3.5 px-4 text-right">Expected Cash</th>
                  <th className="py-3.5 px-4 text-right">Counted Cash</th>
                  <th className="py-3.5 px-4 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="text-[#334155]">
                {reportData && reportData.rows.length > 0 ? (
                  reportData.rows.map((row: CashDrawerReportRow, idx: number) => {
                    const isSettled = row.status === 'SETTLED';
                    const hasDiscrepancy = Math.abs(row.variance) > 0.01;
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

                        {/* 3. Custodian */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-800">
                          {row.custodianName}
                        </td>

                        {/* 4. Campus */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                          {row.branchName || 'Main Campus'}
                        </td>

                        {/* 5. Status */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {isSettled ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#10B981] text-white shadow-2xs">
                              SETTLED
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#F59E0B] text-white shadow-2xs">
                              {row.status}
                            </span>
                          )}
                        </td>

                        {/* 6. Opening Float */}
                        <td className="py-3.5 px-4 text-right tabular-nums text-slate-600 whitespace-nowrap">
                          {formatPKR(row.openingFloat)}
                        </td>

                        {/* 7. Sales Cash In */}
                        <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-[#10B981] whitespace-nowrap">
                          +{formatPKR(row.cashSales)}
                        </td>

                        {/* 8. Expenses Out */}
                        <td className="py-3.5 px-4 text-right tabular-nums font-medium text-[#EF4444] whitespace-nowrap">
                          -{formatPKR(row.cashExpenses)}
                        </td>

                        {/* 9. Tips Paid */}
                        <td className="py-3.5 px-4 text-right tabular-nums font-medium text-slate-600 whitespace-nowrap">
                          -{formatPKR(row.cashTips)}
                        </td>

                        {/* 10. Expected Cash */}
                        <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                          {formatPKR(row.expectedCash)}
                        </td>

                        {/* 11. Counted Cash */}
                        <td className="py-3.5 px-4 text-right tabular-nums font-bold text-[#0047AB] whitespace-nowrap">
                          {row.countedCash !== null && row.countedCash !== undefined ? formatPKR(row.countedCash) : '—'}
                        </td>

                        {/* 12. Variance */}
                        <td
                          className={`py-3.5 px-4 text-right tabular-nums font-semibold whitespace-nowrap ${
                            hasDiscrepancy ? (row.variance > 0 ? 'text-[#10B981]' : 'text-[#EF4444]') : 'text-slate-500'
                          }`}
                        >
                          {row.variance >= 0
                            ? `+${formatPKR(row.variance)}`
                            : `-${formatPKR(Math.abs(row.variance))}`}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-400 font-medium">
                      No cash drawer sessions found for the selected campus, dates, and filters.
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Integrated Table Footer */}
              <tfoot className="bg-[#F8FAFC] border-t-2 border-slate-200 font-['Inter',sans-serif] text-[13px] text-[#334155]">
                {/* Row 1: TOTALS (PKR) */}
                <tr className="border-b border-slate-200/70">
                  <td colSpan={9} className="py-3.5 px-4 text-right font-bold text-slate-800 tracking-wide">
                    TOTAL CASH CLOSING (PKR)
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-slate-800">
                    {formatPKR(reportData?.totals?.expectedCash ?? 0)}
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums font-bold text-[#0047AB]">
                    {formatPKR(reportData?.totals?.countedCash ?? 0)}
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums font-bold text-slate-800">
                    {(reportData?.totals?.variance ?? 0) >= 0
                      ? `+${formatPKR(reportData?.totals?.variance ?? 0)}`
                      : `-${formatPKR(Math.abs(reportData?.totals?.variance ?? 0))}`}
                  </td>
                </tr>

                {/* Row 2: Net Cash Reconciled */}
                <tr>
                  <td colSpan={9} className="py-3 px-4 text-right font-medium text-slate-600">
                    Net Physical Cash Collected
                  </td>
                  <td colSpan={3} className="py-3 px-4 text-right tabular-nums font-bold text-[#0047AB] text-sm">
                    +{formatPKR(reportData?.totals?.countedCash ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!!reportData?.transactions?.length && <div className="bg-white border rounded-xl overflow-x-auto p-4">
        <h2 className="font-semibold mb-3">Cash transactions in selected dates</h2>
        <table className="w-full text-left text-xs"><thead><tr><th className="p-2">Date / Time</th><th className="p-2">Reference</th><th className="p-2">Actor</th><th className="p-2">Type</th><th className="p-2 text-right">Amount (PKR)</th></tr></thead>
          <tbody>{reportData.transactions.map((transaction) => <tr key={transaction.id} className="border-t"><td className="p-2">{transaction.date} {transaction.time}</td><td className="p-2">{transaction.reference}</td><td className="p-2">{transaction.actor}</td><td className="p-2">{transaction.type}</td><td className="p-2 text-right">{transaction.direction === 'IN' ? '+' : '-'}{formatPKR(transaction.amount)}</td></tr>)}</tbody>
        </table>
      </div>}
      {/* Footer Branding */}
      <div className="text-center py-4 text-xs text-slate-400 font-medium tracking-wide">
        © iSysware Management System
      </div>
    </div>
  );
};

export default CashDrawerLogsReportPage;

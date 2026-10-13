import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { salonService } from '../../services';
import {
  PayrollRun,
  PayrollRunType,
  PayslipRecord,
  StaffMember,
  CompensationType,
  PayrollRunStatus,
  PayrollPolicyConfig,
  OnlineAccount,
  CashDrawer,
  SalaryAdvance,
} from '../../types/salon';
import {
  DollarSign,
  MinusCircle,
  Calendar,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Printer,
  FileSpreadsheet,
  Settings,
  Eye,
  CreditCard,
  Ban,
  RotateCcw,
  AlertTriangle,
  ChevronRight,
  UserCheck,
  Building,
  History,
  X,
  Lock,
  Trash2,
  MapPin,
  Briefcase,
} from 'lucide-react';
import { roundCurrency } from '../../lib/taxCalculations';
import { AccessDeniedView } from '../scaffold/AccessDeniedView';
import { PayrollExtrasPanel, PayrollExtrasView } from './PayrollExtrasPanel';

// Payslip parts added with allowances/adjustments/advances (absent on older payslips → 0).
const plusExtras = (p: PayslipRecord) => (p.allowancesTotal ?? 0) + (p.holidayEarnings ?? 0);
const minusExtras = (p: PayslipRecord) => (p.otherDeductions ?? 0) + (p.advanceRecoveryAmount ?? 0);
const money = (n: number, sign: '+' | '-') => (n > 0 ? `${sign}Rs. ${n.toLocaleString()}` : '0');
const BaseExplanation = ({ payslip: p }: { payslip: PayslipRecord }) => (
  <div className="text-[11px] text-slate-500 mt-1 font-normal whitespace-normal min-w-44">
    {p.joiningDate && <div>Joined: {p.joiningDate}{p.exitDate ? ` · Exit: ${p.exitDate}` : ''}</div>}
    {p.calculationDetails?.payableDays !== undefined && (
      <div>Eligible days: {p.calculationDetails.payableDays}{p.calculationDetails.prorationDivisor ? ` / ${p.calculationDetails.prorationDivisor}` : ''}</div>
    )}
    <div>{p.calculationDetails?.prorationFormula || (p.compensationType.startsWith('MONTHLY') ? 'Full eligible month: configured monthly salary' : '')}</div>
    {p.employmentNotes?.map((note) => <div key={note} className="text-amber-700">{note}</div>)}
  </div>
);

const VIEW_TABS: { id: 'GENERATE' | 'RUNS' | PayrollExtrasView; label: string }[] = [
  { id: 'GENERATE', label: 'Generate Salary' },
  { id: 'RUNS', label: 'Manage Salaries' },
  { id: 'SUMMARY', label: 'Monthly Summary (Salary + Commission)' },
  { id: 'INPUTS', label: 'Allowances & Adjustments' },
];

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const YEARS = ['2024', '2025', '2026', '2027', '2028'];

export const PayrollPage: React.FC = () => {
  const { user, activeBranchId, allBranches, demoDate } = useAuth();

  // Role guard: Super Admin and Admin only
  if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN')) {
    return <AccessDeniedView attemptedPath="/accounts/payroll" />;
  }

  const initialMonth = (demoDate || new Date().toISOString().slice(0, 10)).slice(0, 7);

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [onlineAccounts, setOnlineAccounts] = useState<OnlineAccount[]>([]);
  const [cashDrawers, setCashDrawers] = useState<CashDrawer[]>([]);
  const [payrollPolicy, setPayrollPolicy] = useState<PayrollPolicyConfig | null>(null);

  // Filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    user.role === 'SUPER_ADMIN' ? (activeBranchId === 'ALL' ? (allBranches[0]?.id || '') : activeBranchId) : (user.branchId || '')
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
  const [selectedMonthNum, setSelectedMonthNum] = useState<string>(initialMonth.slice(5, 7) || '10');
  const [selectedYear, setSelectedYear] = useState<string>(initialMonth.slice(0, 4) || '2026');
  const [salaryAdvances, setSalaryAdvances] = useState<SalaryAdvance[]>([]);
  const [hasFiltered, setHasFiltered] = useState<boolean>(false);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [runType, setRunType] = useState<PayrollRunType>('MONTHLY');
  const [startDate, setStartDate] = useState(demoDate || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(demoDate || new Date().toISOString().slice(0, 10));
  const [staffFilter, setStaffFilter] = useState<string>('ALL');
  const [compTypeFilter, setCompTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [view, setView] = useState<'GENERATE' | 'RUNS' | PayrollExtrasView>('GENERATE');

  // Active Draft Run (preview currently being inspected / generated)
  const [activeDraft, setActiveDraft] = useState<PayrollRun | null>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipRecord | null>(null);

  // Modals
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [showDetailsModal, setShowDetailsModal] = useState<boolean>(false);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showPolicyModal, setShowPolicyModal] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [showDeductionModal, setShowDeductionModal] = useState<boolean>(false);
  const [deductionTargetRun, setDeductionTargetRun] = useState<PayrollRun | null>(null);
  const [deductionTargetPayslip, setDeductionTargetPayslip] = useState<PayslipRecord | null>(null);
  const [deductionForm, setDeductionForm] = useState({
    amount: 0,
    title: 'Missed Attendance / Punch',
    notes: '',
  });

  // Payment Form
  const [paymentTargetRun, setPaymentTargetRun] = useState<PayrollRun | null>(null);
  const [paymentTargetPayslip, setPaymentTargetPayslip] = useState<PayslipRecord | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    method: 'CASH' as 'CASH' | 'ONLINE',
    onlineAccountId: '',
    reference: '',
  });

  // Cancel / Reversal Form
  const [cancelReason, setCancelReason] = useState<string>('');
  const [runToCancel, setRunToCancel] = useState<PayrollRun | null>(null);
  const [paymentToReverse, setPaymentToReverse] = useState<{ id: string; amount: number; staffName: string } | null>(null);
  const [reverseReason, setReverseReason] = useState<string>('');

  // Policy Form
  const [policyForm, setPolicyForm] = useState<Partial<PayrollPolicyConfig>>({
    monthlyAbsenceDivisor: 30,
    dailyStaffPaidLeaveEligibility: true,
    nonWorkedWeeklyOffPaid: false,
    nonWorkedHolidayPaid: true,
    prorationMethod: 'CALENDAR_DAYS',
  });

  // Action feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const effectiveBranchId = user.role === 'SUPER_ADMIN' ? selectedBranchId : (user.branchId || activeBranchId);

  // Fetch all initial data
  const loadData = async () => {
    try {
      setLoading(true);
      const [runs, staff, accounts, drawers, policy, advances] = await Promise.all([
        salonService.getPayrollRuns(effectiveBranchId, selectedMonth, user),
        salonService.getStaff(effectiveBranchId),
        salonService.getOnlineAccounts(effectiveBranchId),
        salonService.getCashDrawers(effectiveBranchId),
        salonService.getPayrollPolicy(effectiveBranchId),
        salonService.getSalaryAdvances(effectiveBranchId),
      ]);

      setPayrollRuns(runs);
      setStaffList(staff);
      setOnlineAccounts(accounts);
      setCashDrawers(drawers);
      setPayrollPolicy(policy);
      setPolicyForm(policy);
      setSalaryAdvances(advances || []);

      // Pre-select ungenerated active staff
      const genIds = new Set<string>();
      runs.filter((r) => r.status !== 'CANCELLED' && r.status !== 'DRAFT').forEach((r) => {
        r.payslips.forEach((p) => genIds.add(p.staffId));
      });
      const ungen = staff.filter((s) => s.isActive && !genIds.has(s.id)).map((s) => s.id);
      setSelectedStaffIds((prev) => (prev.length === 0 ? ungen : prev));
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load payroll data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveBranchId, selectedMonth]);

  // Derived Statistics for the Selected Month / Branch
  const summaryStats = useMemo(() => {
    let finalizedPayable = 0;
    let paid = 0;
    let outstanding = 0;
    let employeeCount = 0;

    payrollRuns
      .filter((r) => r.status !== 'CANCELLED' && r.status !== 'DRAFT')
      .forEach((r) => {
        finalizedPayable += r.totalPayable;
        paid += r.totalPaid;
        outstanding += r.totalOutstanding;
        employeeCount += r.employeeCount;
      });

    return {
      finalizedPayable: roundCurrency(finalizedPayable),
      paid: roundCurrency(paid),
      outstanding: roundCurrency(outstanding),
      employeeCount,
    };
  }, [payrollRuns]);

  // Filtered finalized/history payslips for the main table view
  const displayRuns = useMemo(() => {
    return payrollRuns.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      return true;
    });
  }, [payrollRuns, statusFilter]);

  const effectiveBranchName = useMemo(() => {
    return allBranches.find((b) => b.id === effectiveBranchId)?.name || 'Main Branch';
  }, [allBranches, effectiveBranchId]);

  const monthLabel = useMemo(() => {
    return MONTHS.find((m) => m.value === selectedMonthNum)?.label || 'October';
  }, [selectedMonthNum]);

  // Active staff in this branch (deduplicated by staff ID)
  const branchStaff = useMemo(() => {
    const map = new Map<string, StaffMember>();
    staffList.forEach((s) => {
      if (s.isActive && !map.has(s.id)) {
        map.set(s.id, s);
      }
    });
    return Array.from(map.values());
  }, [staffList]);

  const periodLabel = useMemo(() => {
    if (runType === 'DAILY') return startDate;
    if (runType === 'CUSTOM_RANGE') return `${startDate} to ${endDate}`;
    return `${monthLabel} ${selectedYear}`;
  }, [runType, startDate, endDate, monthLabel, selectedYear]);

  // Set of staff IDs that already have a finalized payslip in current month/run
  const generatedStaffIdSet = useMemo(() => {
    const set = new Set<string>();
    const targetMonth = runType === 'MONTHLY' ? `${selectedYear}-${selectedMonthNum}` : startDate.slice(0, 7);
    payrollRuns
      .filter((r) => r.status !== 'CANCELLED' && r.status !== 'DRAFT' && r.month === targetMonth)
      .filter((r) => {
        if (runType === 'DAILY') return r.runType === 'DAILY' && r.startDate === startDate;
        if (runType === 'CUSTOM_RANGE') return r.runType === 'CUSTOM_RANGE' && r.startDate === startDate && r.endDate === endDate;
        return r.runType === 'MONTHLY' || !r.runType;
      })
      .forEach((r) => {
        r.payslips.forEach((p) => set.add(p.staffId));
      });
    return set;
  }, [payrollRuns, runType, selectedYear, selectedMonthNum, startDate, endDate]);

  // Active advance map by staffId
  const staffLoanMap = useMemo(() => {
    const map = new Map<string, SalaryAdvance>();
    (salaryAdvances || [])
      .filter((a) => a.status === 'ACTIVE' && a.balance > 0)
      .forEach((a) => map.set(a.staffId, a));
    return map;
  }, [salaryAdvances]);

  // Payslips from finalized (non-draft, non-cancelled) runs for the selected month / period, strictly unique per employee
  const generatedPayslipRows = useMemo(() => {
    const map = new Map<string, { run: PayrollRun; payslip: PayslipRecord }>();
    const targetMonth = runType === 'MONTHLY' ? `${selectedYear}-${selectedMonthNum}` : startDate.slice(0, 7);
    payrollRuns
      .filter((r) => r.status !== 'CANCELLED' && r.status !== 'DRAFT' && r.month === targetMonth)
      .filter((r) => {
        if (runType === 'DAILY') return r.runType === 'DAILY' && r.startDate === startDate;
        if (runType === 'CUSTOM_RANGE') return r.runType === 'CUSTOM_RANGE' && r.startDate === startDate && r.endDate === endDate;
        return r.runType === 'MONTHLY' || !r.runType;
      })
      .forEach((r) => {
        r.payslips.forEach((p) => {
          if (!map.has(p.staffId)) {
            map.set(p.staffId, { run: r, payslip: p });
          } else {
            const existing = map.get(p.staffId)!;
            const rTime = new Date(r.finalizedAt || r.generatedAt).getTime();
            const eTime = new Date(existing.run.finalizedAt || existing.run.generatedAt).getTime();
            if (rTime > eTime) {
              map.set(p.staffId, { run: r, payslip: p });
            }
          }
        });
      });
    return Array.from(map.values());
  }, [payrollRuns, runType, selectedYear, selectedMonthNum, startDate, endDate]);

  const generatedTotals = useMemo(() => {
    let basic = 0;
    let salaryGenerated = 0;
    let amountPaid = 0;
    let loanRepayment = 0;

    generatedPayslipRows.forEach(({ payslip: p }) => {
      basic += (p.effectiveBaseSalary ?? p.baseEarnings) || 0;
      salaryGenerated += p.netPayable || 0;
      amountPaid += p.paidAmount || 0;
      loanRepayment += p.advanceRecoveryAmount || 0;
    });

    return {
      basic: roundCurrency(basic),
      salaryGenerated: roundCurrency(salaryGenerated),
      amountPaid: roundCurrency(amountPaid),
      loanRepayment: roundCurrency(loanRepayment),
    };
  }, [generatedPayslipRows]);

  const handleSelectAll = () => {
    setSelectedStaffIds(branchStaff.map((s) => s.id));
  };

  const handleSelectNone = () => {
    setSelectedStaffIds([]);
  };

  const toggleStaffSelection = (id: string) => {
    setSelectedStaffIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const handleFilter = async () => {
    try {
      setActionLoading(true);
      setFeedback(null);
      const targetMonth = runType === 'MONTHLY' ? `${selectedYear}-${selectedMonthNum}` : startDate.slice(0, 7);
      setSelectedMonth(targetMonth);
      if (runType !== 'MONTHLY') {
        setSelectedYear(startDate.slice(0, 4));
        setSelectedMonthNum(startDate.slice(5, 7));
      }
      const [runs, staff, advances] = await Promise.all([
        salonService.getPayrollRuns(effectiveBranchId, targetMonth, user),
        salonService.getStaff(effectiveBranchId),
        salonService.getSalaryAdvances(effectiveBranchId),
      ]);
      setPayrollRuns(runs);
      setStaffList(staff);
      setSalaryAdvances(advances || []);
      setHasFiltered(true);

      const generatedStaffIds = new Set<string>();
      runs
        .filter((r) => r.status !== 'CANCELLED' && r.status !== 'DRAFT')
        .filter((r) => {
          if (runType === 'DAILY') return r.runType === 'DAILY' && r.startDate === startDate;
          if (runType === 'CUSTOM_RANGE') return r.runType === 'CUSTOM_RANGE' && r.startDate === startDate && r.endDate === endDate;
          return r.runType === 'MONTHLY' || !r.runType;
        })
        .forEach((r) => {
          r.payslips.forEach((p) => generatedStaffIds.add(p.staffId));
        });
      const ungenerated = staff.filter((s) => s.isActive && !generatedStaffIds.has(s.id)).map((s) => s.id);
      setSelectedStaffIds(ungenerated);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to filter payroll data.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateSalary = async () => {
    if (!hasFiltered) {
      await handleFilter();
      return;
    }
    if (selectedStaffIds.length === 0) {
      setFeedback({ type: 'error', message: 'Please select at least one eligible staff member to generate salary.' });
      return;
    }
    try {
      setActionLoading(true);
      setFeedback(null);
      const targetMonth = runType === 'MONTHLY' ? `${selectedYear}-${selectedMonthNum}` : startDate.slice(0, 7);
      const effStartDate = runType === 'MONTHLY' ? undefined : startDate;
      const effEndDate = runType === 'MONTHLY' ? undefined : (runType === 'DAILY' ? startDate : endDate);

      const preview = await salonService.generatePayrollPreview(
        effectiveBranchId,
        targetMonth,
        undefined,
        user,
        {
          runType,
          startDate: effStartDate,
          endDate: effEndDate,
          compensationType: 'ALL',
          staffIds: selectedStaffIds,
          includeDaily: true,
        }
      );
      const finalized = await salonService.finalizePayroll(preview.id, user);
      setFeedback({
        type: 'success',
        message: `Salary successfully generated for ${finalized.employeeCount} staff! Run: ${finalized.payrollNumber}`,
      });
      const [runs, staff, advances] = await Promise.all([
        salonService.getPayrollRuns(effectiveBranchId, targetMonth, user),
        salonService.getStaff(effectiveBranchId),
        salonService.getSalaryAdvances(effectiveBranchId),
      ]);
      setPayrollRuns(runs);
      setStaffList(staff);
      setSalaryAdvances(advances || []);
      setHasFiltered(true);
      setSelectedStaffIds([]);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to generate salary.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Open open drawer for active user in current branch
  const activeUserOpenDrawer = useMemo(() => {
    return cashDrawers.find(
      (d) => d.branchId === effectiveBranchId && d.custodianUserId === user.id && d.status === 'OPEN'
    );
  }, [cashDrawers, effectiveBranchId, user.id]);

  // Generate Draft Preview
  const handleGeneratePreview = async () => {
    try {
      setActionLoading(true);
      setFeedback(null);
      const preview = await salonService.generatePayrollPreview(
        effectiveBranchId,
        selectedMonth,
        staffFilter !== 'ALL' ? staffFilter : undefined,
        user,
        {
          runType,
          compensationType: compTypeFilter as CompensationType | 'ALL',
          ...(runType !== 'MONTHLY' ? { startDate, endDate: runType === 'DAILY' ? startDate : endDate } : {}),
        }
      );
      setActiveDraft(preview);
      setShowPreviewModal(true);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to generate payroll preview.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Finalize Draft Payroll
  const handleFinalizePayroll = async () => {
    if (!activeDraft) return;
    try {
      setActionLoading(true);
      setFeedback(null);
      const finalized = await salonService.finalizePayroll(activeDraft.id, user);
      setFeedback({
        type: 'success',
        message: `Payroll ${finalized.payrollNumber} successfully finalized! Total payable: Rs. ${finalized.totalPayable.toLocaleString()}. Inputs are now locked.`,
      });
      setShowPreviewModal(false);
      setActiveDraft(null);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to finalize payroll.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Open Payment Modal
  const openPaymentModal = (run: PayrollRun, ps?: PayslipRecord) => {
    setPaymentTargetRun(run);
    const targetPs = ps || run.payslips.find((p) => p.outstandingAmount > 0) || run.payslips[0];
    setPaymentTargetPayslip(targetPs);
    setPaymentForm({
      amount: targetPs ? targetPs.outstandingAmount : 0,
      method: 'CASH',
      onlineAccountId: onlineAccounts[0]?.id || '',
      reference: `Salary payment for ${targetPs?.staffName || 'staff'} (${selectedMonth})`,
    });
    setShowPaymentModal(true);
  };

  // Record Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTargetRun || !paymentTargetPayslip) return;

    if (paymentForm.amount <= 0 || paymentForm.amount > paymentTargetPayslip.outstandingAmount) {
      setFeedback({
        type: 'error',
        message: `Payment amount must be between 1 and ${paymentTargetPayslip.outstandingAmount.toLocaleString()}`,
      });
      return;
    }

    try {
      setActionLoading(true);
      setFeedback(null);
      await salonService.recordPayrollPayment(
        {
          payrollRunId: paymentTargetRun.id,
          payslipId: paymentTargetPayslip.id,
          amount: paymentForm.amount,
          method: paymentForm.method,
          onlineAccountId: paymentForm.method === 'ONLINE' ? paymentForm.onlineAccountId : undefined,
          reference: paymentForm.reference,
        },
        user
      );

      setFeedback({
        type: 'success',
        message: `Successfully paid Rs. ${paymentForm.amount.toLocaleString()} to ${paymentTargetPayslip.staffName}!`,
      });
      setShowPaymentModal(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Payment failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Open Manual Deduction Modal
  const openDeductionModal = (run: PayrollRun, ps: PayslipRecord) => {
    setDeductionTargetRun(run);
    setDeductionTargetPayslip(ps);
    setDeductionForm({
      amount: 0,
      title: 'Missed Attendance / Punch',
      notes: '',
    });
    setShowDeductionModal(true);
  };

  // Apply Manual Deduction
  const handleApplyDeduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deductionTargetPayslip || !deductionTargetRun) return;

    if (deductionForm.amount <= 0) {
      setFeedback({
        type: 'error',
        message: 'Deduction amount must be greater than zero.',
      });
      return;
    }

    if (deductionForm.amount > deductionTargetPayslip.outstandingAmount) {
      setFeedback({
        type: 'error',
        message: `Deduction amount cannot exceed unpaid salary balance of Rs. ${deductionTargetPayslip.outstandingAmount.toLocaleString()}`,
      });
      return;
    }

    if (!deductionForm.title.trim()) {
      setFeedback({
        type: 'error',
        message: 'Deduction title or reason is required.',
      });
      return;
    }

    try {
      setActionLoading(true);
      setFeedback(null);
      await salonService.addManualDeduction(
        deductionTargetPayslip.id,
        {
          amount: deductionForm.amount,
          title: deductionForm.title.trim(),
          notes: deductionForm.notes.trim() || undefined,
        },
        user
      );

      setFeedback({
        type: 'success',
        message: `Successfully applied deduction of Rs. ${deductionForm.amount.toLocaleString()} for ${deductionTargetPayslip.staffName}!`,
      });
      setShowDeductionModal(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to apply deduction.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Unpaid Run
  const handleCancelRun = async () => {
    if (!runToCancel || !cancelReason.trim()) return;
    try {
      setActionLoading(true);
      await salonService.cancelPayrollRun(runToCancel.id, cancelReason, user);
      setFeedback({
        type: 'success',
        message: `Payroll run ${runToCancel.payrollNumber} cancelled and attendance/overtime released.`,
      });
      setShowCancelModal(false);
      setRunToCancel(null);
      setCancelReason('');
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to cancel payroll run.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Reverse Payment
  const handleReversePayment = async () => {
    if (!paymentToReverse || !reverseReason.trim()) return;
    try {
      setActionLoading(true);
      await salonService.reversePayrollPayment(paymentToReverse.id, reverseReason, user);
      setFeedback({
        type: 'success',
        message: `Payment of Rs. ${paymentToReverse.amount.toLocaleString()} reversed. Funds restored to source balance.`,
      });
      setPaymentToReverse(null);
      setReverseReason('');
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to reverse payment.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Save Policy Configuration
  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const updated = await salonService.updatePayrollPolicy(effectiveBranchId, policyForm, user);
      setPayrollPolicy(updated);
      setFeedback({ type: 'success', message: 'Payroll policy settings successfully updated.' });
      setShowPolicyModal(false);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update payroll policy.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Export CSV
  const handleExportCSV = (run: PayrollRun) => {
    const headers = [
      'Payslip Number',
      'Employee Code',
      'Staff Name',
      'Compensation Type',
      'Period Type',
      'From Date',
      'To Date',
      'Base Earnings',
      'Leave Earnings',
      'Absence Deductions',
      'Late/Early Penalties',
      'Approved Overtime (Mins)',
      'Overtime Amount',
      'Holiday/Weekly-off Pay',
      'Allowances + Bonus',
      'Other Deductions',
      'Advance Recovery',
      'Gross Payable',
      'Total Deductions',
      'Net Salary',
      'Commission',
      'Combined Net Payable',
      'Paid Amount',
      'Outstanding',
      'Status',
    ];

    const rows = run.payslips.map((p) => [
      p.payslipNumber,
      p.employeeCode,
      `"${p.staffName}"`,
      p.compensationType,
      run.runType || 'MONTHLY',
      run.startDate || `${run.month}-01`,
      run.endDate || run.month,
      p.baseEarnings,
      p.leaveEarnings,
      p.absenceDeductions,
      p.attendancePenaltyDeductions,
      p.approvedOvertimeMinutes,
      p.approvedOvertimeAmount,
      p.holidayEarnings ?? 0,
      p.allowancesTotal ?? 0,
      p.otherDeductions ?? 0,
      p.advanceRecoveryAmount ?? 0,
      p.grossPayable,
      p.totalDeductions,
      p.salaryNetPayable ?? p.netPayable,
      p.commissionPayable ?? 0,
      p.netPayable,
      p.paidAmount,
      p.outstandingAmount,
      p.status,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Payroll_${run.payrollNumber}_${run.month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Generate Salary</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Select branch, month and year to filter and generate staff salaries.
          </p>
        </div>

        {/* View Switcher Tabs - Minimal & Clean */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          {VIEW_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                view === t.id
                  ? 'bg-[#0a3871] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback Alerts */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600" />
            )}
            <p className="font-medium">{feedback.message}</p>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* GENERATE SALARY VIEW */}
      {view === 'GENERATE' && (
        <div className="space-y-6">
          {/* Top Form & Staff Selection */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Filter Card */}
            <div className={`${hasFiltered ? 'lg:col-span-4' : 'lg:col-span-5 max-w-md'} bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4`}>
              <h2 className="text-lg font-bold text-slate-900 pb-2 border-b border-slate-100">Generate Salary</h2>

              {/* Branch */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Branch <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <MapPin className="w-4 h-4 text-blue-600" />
                  </div>
                  <select
                    value={effectiveBranchId}
                    onChange={(e) => {
                      setSelectedBranchId(e.target.value);
                      setHasFiltered(false);
                    }}
                    disabled={user.role !== 'SUPER_ADMIN'}
                    className="w-full text-sm pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    {allBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payroll Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Payroll Type <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setRunType('MONTHLY');
                      setHasFiltered(false);
                    }}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      runType === 'MONTHLY'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRunType('DAILY');
                      setHasFiltered(false);
                    }}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      runType === 'DAILY'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Daily
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRunType('CUSTOM_RANGE');
                      setHasFiltered(false);
                    }}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      runType === 'CUSTOM_RANGE'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Monthly Date Controls */}
              {runType === 'MONTHLY' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Month <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Calendar className="w-4 h-4 text-blue-600" />
                      </div>
                      <select
                        value={selectedMonthNum}
                        onChange={(e) => {
                          setSelectedMonthNum(e.target.value);
                          setSelectedMonth(`${selectedYear}-${e.target.value}`);
                          setHasFiltered(false);
                        }}
                        className="w-full text-sm pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800"
                      >
                        {MONTHS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Year <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Calendar className="w-4 h-4 text-blue-600" />
                      </div>
                      <select
                        value={selectedYear}
                        onChange={(e) => {
                          setSelectedYear(e.target.value);
                          setSelectedMonth(`${e.target.value}-${selectedMonthNum}`);
                          setHasFiltered(false);
                        }}
                        className="w-full text-sm pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800"
                      >
                        {YEARS.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Daily Date Controls */}
              {runType === 'DAILY' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Date <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Calendar className="w-4 h-4 text-blue-600" />
                    </div>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setEndDate(e.target.value);
                        setHasFiltered(false);
                      }}
                      className="w-full text-sm pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* Custom Range Date Controls */}
              {runType === 'CUSTOM_RANGE' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Start Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setHasFiltered(false);
                      }}
                      className="w-full text-sm px-2.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      End Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setHasFiltered(false);
                      }}
                      className="w-full text-sm px-2.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 space-y-2.5">
                <button
                  type="button"
                  onClick={handleFilter}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 bg-[#0a3871] hover:bg-[#082d5b] text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Filter className="w-4 h-4" /> Filter
                </button>

                <button
                  type="button"
                  onClick={handleGenerateSalary}
                  disabled={actionLoading}
                  className="w-full py-2.5 px-4 bg-[#0a3871] hover:bg-[#082d5b] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Briefcase className="w-4 h-4" /> Generate Salary
                </button>
              </div>
            </div>

            {/* Right Eligible Staff Card - Only visible when hasFiltered is true */}
            {hasFiltered && (
              <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col min-h-[380px]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-100 gap-3">
                  <div className="text-sm font-bold text-slate-700">
                    Staff Code | <span className="text-rose-600">Name</span> | Designation
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="px-3.5 py-1.5 bg-[#00bcd4] hover:bg-[#00acc1] text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectNone}
                      className="px-3.5 py-1.5 bg-[#e53935] hover:bg-[#d32f2f] text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
                    >
                      Select None
                    </button>
                  </div>
                </div>

                {/* Staff List */}
                <div className="mt-4 flex-1 overflow-y-auto max-h-[330px] space-y-2.5 pr-1">
                  {branchStaff.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-sm">
                      No active staff found for this branch.
                    </div>
                  ) : (
                    branchStaff.map((s) => {
                      const isSelected = selectedStaffIds.includes(s.id);
                      const isGenerated = generatedStaffIdSet.has(s.id);
                      const loan = staffLoanMap.get(s.id);

                      return (
                        <div
                          key={s.id}
                          onClick={() => toggleStaffSelection(s.id)}
                          className="p-3 rounded-xl bg-[#fffde7] border border-[#fff59d] hover:border-[#fbc02d] flex items-center justify-between text-xs sm:text-sm cursor-pointer transition-all select-none"
                        >
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // row onClick handles toggle
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none"
                            />
                            <span className="text-slate-600 font-medium">
                              {s.employeeCode || `EMP-${s.id.slice(-3).toUpperCase()}`}
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className="text-rose-600 font-semibold">{s.name}</span>
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-600 capitalize">
                              {s.designation || s.roleTitle || 'Staff'}
                            </span>
                            {loan && (
                              <span className="ml-1 px-2.5 py-0.5 bg-[#ff9800] text-white text-[11px] font-bold rounded-full shadow-xs">
                                Loan: {roundCurrency(loan.recoveryPerMonth || loan.balance)}.00/instalment
                              </span>
                            )}
                          </div>

                          <div className="pl-3">
                            {isGenerated ? (
                              <span className="px-3 py-1 bg-[#2e7d32] text-white text-xs font-bold rounded-md shadow-xs">
                                Generated
                              </span>
                            ) : (
                              <span className="px-3 py-1 bg-slate-200 text-slate-600 text-xs font-medium rounded-md">
                                Not Generated
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Generated Salaries Table Section - Only visible when hasFiltered is true */}
          {hasFiltered && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-base font-bold text-slate-800">Generated Salaries</h3>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-[#0047AB] border border-blue-200 text-xs font-semibold rounded-lg w-fit">
                  {effectiveBranchName} • {periodLabel}
                </span>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1100px] text-xs">
                    <thead>
                      <tr className="bg-[#EAF2FB] text-[#475569] text-[11px] font-semibold border-b border-blue-100 uppercase tracking-wider">
                        <th className="py-3 px-4 text-left whitespace-nowrap">Staff</th>
                        <th className="py-3 px-3 text-center whitespace-nowrap">{runType === 'MONTHLY' ? 'Salary Month' : 'Period'}</th>
                        <th className="py-3 px-2 text-center whitespace-nowrap" title="Paid attendance days; each completed half day counts as 0.5">Present</th>
                        <th className="py-3 px-2 text-center whitespace-nowrap">Half Day</th>
                        <th className="py-3 px-2 text-center whitespace-nowrap">Paid Leave</th>
                        <th className="py-3 px-2 text-center whitespace-nowrap">Unpaid Leave</th>
                        <th className="py-3 px-2 text-center whitespace-nowrap">Absent</th>
                        <th className="py-3 px-2 text-center whitespace-nowrap">Late</th>
                        <th className="py-3 px-2 text-center whitespace-nowrap">Early Exit</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">Basic</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">Salary Generated</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">Amount Paid</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">Loan Repayment</th>
                        <th className="py-3 px-3 text-center whitespace-nowrap">Status</th>
                        <th className="py-3 px-4 text-center whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {generatedPayslipRows.length === 0 ? (
                        <tr>
                          <td colSpan={15} className="py-12 text-center text-slate-400 text-xs">
                            No salaries generated for {effectiveBranchName} ({periodLabel}) yet. Select eligible staff above and click "Generate Salary".
                          </td>
                        </tr>
                      ) : (
                        generatedPayslipRows.map(({ run, payslip: p }) => {
                          const isPaid = p.outstandingAmount <= 0 && p.paidAmount > 0;
                          const compLabel =
                            p.compensationType === 'DAILY_SALARY'
                              ? 'daily'
                              : p.compensationType === 'COMMISSION_ONLY'
                              ? 'commission only'
                              : p.compensationType === 'DAILY_PLUS_COMMISSION'
                              ? 'daily + comm'
                              : p.compensationType === 'MONTHLY_PLUS_COMMISSION'
                              ? 'monthly + comm'
                              : 'full time';

                          return (
                            <tr key={p.id} className="hover:bg-blue-50/20 transition-colors">
                              {/* Staff */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="font-semibold text-slate-800">{p.staffName}</div>
                                <div className="text-[11px] text-slate-400 font-mono">{p.employeeCode}</div>
                              </td>

                              {/* Salary Period */}
                              <td className="py-3 px-3 text-center whitespace-nowrap font-medium text-slate-700">
                                {run.runType === 'DAILY' ? (run.startDate || run.month) : run.runType === 'CUSTOM_RANGE' ? `${run.startDate} to ${run.endDate}` : `${monthLabel} ${selectedYear}`}
                              </td>

                              {/* Present */}
                              <td className="py-3 px-2 text-center whitespace-nowrap font-semibold text-emerald-700 tabular-nums">
                                {p.presentDays ?? 0}
                              </td>

                              <td className="py-3 px-2 text-center whitespace-nowrap text-slate-600 tabular-nums">{p.halfDayDays || 0}</td>
                              <td className="py-3 px-2 text-center whitespace-nowrap text-slate-600 tabular-nums">{p.paidLeaveDays || 0}</td>
                              <td className="py-3 px-2 text-center whitespace-nowrap text-slate-600 tabular-nums">{p.unpaidLeaveDays || 0}</td>

                              {/* Absent */}
                              <td className="py-3 px-2 text-center whitespace-nowrap tabular-nums">
                                <span className={p.absentDays ? 'font-semibold text-rose-600' : 'text-slate-400'}>
                                  {p.absentDays ?? 0}
                                </span>
                              </td>

                              {/* Late */}
                              <td className="py-3 px-2 text-center whitespace-nowrap tabular-nums">
                                <span className={p.lateDays ? 'font-semibold text-amber-600' : 'text-slate-400'}>
                                  {p.lateDays || 0}
                                </span>
                              </td>

                              {/* Early Exit */}
                              <td className="py-3 px-2 text-center whitespace-nowrap tabular-nums">
                                <span className={p.earlyExitDays ? 'font-semibold text-amber-600' : 'text-slate-400'}>
                                  {p.earlyExitDays || 0}
                                </span>
                              </td>

                              {/* Basic */}
                              <td className="py-3 px-4 text-right whitespace-nowrap tabular-nums">
                                <div className="font-medium text-slate-700">
                                  {((p.effectiveBaseSalary ?? p.baseEarnings) || 0).toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </div>
                                <div className="text-[10px] text-slate-400 capitalize">{compLabel}</div>
                              </td>

                              {/* Salary Generated */}
                              <td className="py-3 px-4 text-right whitespace-nowrap tabular-nums font-bold text-[#0047AB]">
                                {(p.netPayable || 0).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>

                              {/* Amount Paid */}
                              <td className="py-3 px-4 text-right whitespace-nowrap tabular-nums font-semibold text-emerald-700">
                                {(p.paidAmount || 0).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>

                              {/* Loan Repayment */}
                              <td className="py-3 px-4 text-right whitespace-nowrap tabular-nums text-slate-600">
                                {(p.advanceRecoveryAmount || 0).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>

                              {/* Status */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-md border ${
                                    isPaid
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}
                                >
                                  {isPaid ? 'Paid' : 'Pending'}
                                </span>
                              </td>

                              {/* Actions */}
                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                <div className="inline-flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openPaymentModal(run, p)}
                                    disabled={p.outstandingAmount <= 0}
                                    className="px-2.5 py-1 bg-[#0047AB] hover:bg-[#003882] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
                                  >
                                    Make Payment
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openDeductionModal(run, p)}
                                    disabled={p.outstandingAmount <= 0}
                                    title="Apply Manual Deduction (e.g. missed punch, penalty)"
                                    className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold rounded shadow-2xs transition-colors whitespace-nowrap flex items-center gap-1 cursor-pointer"
                                  >
                                    <MinusCircle className="w-3.5 h-3.5" />
                                    Deduct
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRunToCancel(run);
                                      setShowCancelModal(true);
                                    }}
                                    title="Cancel Payroll Run"
                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>

                    {generatedPayslipRows.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-50 font-bold border-t border-slate-200 text-xs text-slate-800">
                          <td colSpan={9} className="py-3 px-4 text-right uppercase tracking-wider text-[11px]">
                            Total:
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-slate-800">
                            {generatedTotals.basic.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-[#0047AB] font-bold">
                            {generatedTotals.salaryGenerated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-emerald-700">
                            {generatedTotals.amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-slate-600">
                            {generatedTotals.loanRepayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter Toolbar (For Managing Runs) */}
      {view === 'RUNS' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
            <Filter className="w-4 h-4 text-indigo-600" />
            <span>Payroll Filters & Run Selector</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {user.role === 'SUPER_ADMIN' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Branch</label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full text-sm border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  {allBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Payroll Month</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setStartDate(`${e.target.value}-01`);
                  setEndDate(`${e.target.value}-${String(new Date(Number(e.target.value.slice(0, 4)), Number(e.target.value.slice(5, 7)), 0).getDate()).padStart(2, '0')}`);
                }}
                className="w-full text-sm border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Employee</label>
              <select
                value={staffFilter}
                onChange={(e) => {
                  setStaffFilter(e.target.value);
                  const selectedStaff = staffList.find((s) => s.id === e.target.value);
                  if (selectedStaff) {
                    setCompTypeFilter('ALL');
                    if (selectedStaff.compensationType.startsWith('DAILY')) setRunType('DAILY');
                    else if (runType === 'DAILY') setRunType('MONTHLY');
                  }
                }}
                className="w-full text-sm border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Employees</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.employeeCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Compensation Type</label>
              <select
                value={compTypeFilter}
                onChange={(e) => {
                  setCompTypeFilter(e.target.value);
                  if (e.target.value.startsWith('DAILY')) setRunType('DAILY');
                  else if (e.target.value !== 'ALL' && runType === 'DAILY') setRunType('MONTHLY');
                }}
                className="w-full text-sm border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Types</option>
                <option value="MONTHLY_SALARY">Monthly Salary</option>
                <option value="MONTHLY_PLUS_COMMISSION">Monthly + Commission</option>
                <option value="DAILY_SALARY">Daily Salary</option>
                <option value="DAILY_PLUS_COMMISSION">Daily + Commission</option>
                <option value="COMMISSION_ONLY">Commission Only</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Payroll Period</label>
              <select value={runType} onChange={(e) => setRunType(e.target.value as PayrollRunType)} className="w-full text-sm border-slate-200 rounded-xl px-3 py-2 bg-slate-50">
                <option value="DAILY">Daily (one day)</option>
                <option value="MONTHLY">Full month (monthly contracts)</option>
                <option value="CUSTOM_RANGE">Custom dates within month</option>
              </select>
            </div>
            {runType !== 'MONTHLY' && <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{runType === 'DAILY' ? 'Payroll Date' : 'From Date'}</label>
              <input type="date" value={startDate} min={`${selectedMonth}-01`} max={`${selectedMonth}-31`} onChange={(e) => setStartDate(e.target.value)} className="w-full text-sm border-slate-200 rounded-xl px-3 py-2 bg-slate-50" />
            </div>}
            {runType === 'CUSTOM_RANGE' && <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">To Date</label>
              <input type="date" value={endDate} min={startDate} max={`${selectedMonth}-31`} onChange={(e) => setEndDate(e.target.value)} className="w-full text-sm border-slate-200 rounded-xl px-3 py-2 bg-slate-50" />
              <p className="text-xs text-slate-500 mt-1">Monthly salary and recurring allowances are prorated using branch policy.</p>
            </div>}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Run Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full text-sm border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="FINALIZED">Finalized</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="PAID">Fully Paid</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {view !== 'RUNS' && view !== 'GENERATE' && (
        <PayrollExtrasPanel
          view={view}
          branchId={effectiveBranchId}
          month={selectedMonth}
          staffList={staffList}
          onlineAccounts={onlineAccounts}
          hasOpenDrawer={!!activeUserOpenDrawer}
          onFeedback={(type, message) => setFeedback({ type, message })}
        />
      )}

      {/* Finalized Payroll Runs & Payslip Breakdown */}
      {view === 'RUNS' && (
      <div className="space-y-6">
        {displayRuns.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-2xl border border-slate-100 shadow-sm space-y-3">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">No Finalized Payroll Runs for {selectedMonth}</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Generate a payroll preview to verify canonical attendance records, absence divisors, approved overtime, and
              finalize the salary register.
            </p>
            <button
              onClick={handleGeneratePreview}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm"
            >
              Generate Preview for {selectedMonth}
            </button>
          </div>
        ) : (
          displayRuns.map((run) => (
            <div key={run.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Run Header */}
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-slate-900">{run.payrollNumber}</span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                        run.status === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800'
                          : run.status === 'PARTIALLY_PAID'
                          ? 'bg-amber-100 text-amber-800'
                          : run.status === 'FINALIZED'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {run.status}
                    </span>
                    <span className="text-xs text-slate-500">
                      {run.status === 'DRAFT'
                        ? `Draft preview generated by ${run.generatedByName} on ${new Date(run.generatedAt).toLocaleDateString()} — not finalized, no liability yet`
                        : run.status === 'CANCELLED'
                        ? `Cancelled by ${run.cancelledByName ?? '—'}${run.cancellationReason ? `: ${run.cancellationReason}` : ''}`
                        : `Finalized by ${run.finalizedByName} on ${new Date(run.finalizedAt || '').toLocaleDateString()}`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Period: {run.startDate || run.month}{run.endDate && run.endDate !== run.startDate ? ` to ${run.endDate}` : ''} | {run.runType || 'MONTHLY'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Monthly divisor: /{run.payslips.find((p) => p.compensationType.startsWith('MONTHLY'))?.calculationDetails?.divisorUsed ?? run.policySnapshot.monthlyAbsenceDivisor} | Proration: {run.policySnapshot.prorationMethod} | Daily Paid Leave: {run.policySnapshot.dailyStaffPaidLeaveEligibility ? 'Eligible' : 'Not Eligible'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleExportCSV(run)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-medium shadow-sm"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    CSV Export
                  </button>

                  {run.status === 'DRAFT' ? (
                    <button
                      onClick={() => {
                        setActiveDraft(run);
                        setShowPreviewModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium shadow-sm"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Review & Finalize
                    </button>
                  ) : (
                    <button
                      onClick={() => openPaymentModal(run)}
                      disabled={run.status === 'PAID' || run.status === 'CANCELLED'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium shadow-sm"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Record Payment
                    </button>
                  )}

                  {run.status !== 'CANCELLED' && (
                    <button
                      onClick={() => {
                        setRunToCancel(run);
                        setShowCancelModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-medium"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Cancel Run
                    </button>
                  )}
                </div>
              </div>

              {/* Table of Payslips */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-3">Attendance</th>
                      <th className="py-3 px-3">Comp Type</th>
                      <th className="py-3 px-3 text-right">Base Earned</th>
                      <th className="py-3 px-3 text-right">Paid Leave Pay</th>
                      <th className="py-3 px-3 text-right">Absence Ded.</th>
                      <th className="py-3 px-3 text-right">Late/Early</th>
                      <th className="py-3 px-3 text-right">Overtime</th>
                      <th className="py-3 px-3 text-right">Allow./Bonus/Holiday</th>
                      <th className="py-3 px-3 text-right">Commission</th>
                      <th className="py-3 px-3 text-right">Other Ded.</th>
                      <th className="py-3 px-3 text-right">Loan</th>
                      <th className="py-3 px-3 text-right font-bold">Net Payable</th>
                      <th className="py-3 px-3 text-right text-emerald-600">Paid</th>
                      <th className="py-3 px-3 text-right text-amber-600">Outstanding</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {run.payslips
                      .filter((p) => {
                        if (staffFilter !== 'ALL' && p.staffId !== staffFilter) return false;
                        if (compTypeFilter !== 'ALL' && p.compensationType !== compTypeFilter) return false;
                        return true;
                      })
                      .map((ps) => (
                        <tr key={ps.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{ps.staffName}</div>
                            <div className="text-[11px] text-slate-400">{ps.employeeCode} • {ps.designation}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 min-w-[220px] whitespace-nowrap">
                              <span className="text-slate-700">Present: <strong>{ps.presentDays ?? 0}</strong></span>
                              <span className="text-rose-600">Absent: <strong>{ps.absentDays ?? 0}</strong></span>
                              <span className="text-emerald-700">Paid Leave: <strong>{ps.paidLeaveDays ?? 0}</strong></span>
                              <span className="text-rose-600">Unpaid Leave: <strong>{ps.unpaidLeaveDays ?? 0}</strong></span>
                              <span className="text-amber-700">Half Day: <strong>{ps.halfDayDays ?? 'N/A'}</strong></span>
                              <span className="text-slate-600">Missing Punch: <strong>{ps.missingPunchDays ?? 0}</strong></span>
                              <span className="text-slate-600">Paid Holiday: <strong>{ps.paidHolidayDays ?? 0}</strong></span>
                              <span className="text-slate-600">Paid Weekly Off: <strong>{ps.paidWeeklyOffDays ?? 0}</strong></span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium">
                              {ps.compensationType.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right text-slate-700 font-medium">
                            Rs. {ps.baseEarnings.toLocaleString()}
                            <BaseExplanation payslip={ps} />
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-600">{money(ps.leaveEarnings, '+')}</td>
                          <td className="py-3 px-3 text-right text-rose-600">
                            {ps.absenceDeductions > 0 ? `-Rs. ${ps.absenceDeductions.toLocaleString()}` : '0'}
                          </td>
                          <td className="py-3 px-3 text-right text-rose-600">
                            {money(ps.attendancePenaltyDeductions, '-')}
                          </td>
                          <td className="py-3 px-3 text-right text-indigo-600">
                            {ps.approvedOvertimeAmount > 0 ? `+Rs. ${ps.approvedOvertimeAmount.toLocaleString()}` : '0'}
                            {ps.approvedOvertimeMinutes > 0 && (
                              <div className="text-[10px] text-slate-400">{ps.approvedOvertimeMinutes}m</div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-600">{money(plusExtras(ps), '+')}</td>
                          <td className="py-3 px-3 text-right text-emerald-600">{money(ps.commissionPayable ?? 0, '+')}</td>
                          <td className="py-3 px-3 text-right text-rose-600">{money(ps.otherDeductions ?? 0, '-')}</td>
                          <td className="py-3 px-3 text-right text-rose-600">{money(ps.advanceRecoveryAmount ?? 0, '-')}</td>
                          <td className="py-3 px-3 text-right font-bold text-slate-900">
                            Rs. {ps.netPayable.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-emerald-600">
                            Rs. {ps.paidAmount.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-amber-600">
                            Rs. {ps.outstandingAmount.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                ps.status === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ps.status === 'PARTIALLY_PAID'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {ps.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  setSelectedPayslip(ps);
                                  setShowDetailsModal(true);
                                }}
                                title="View Calculation Details"
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedPayslip(ps);
                                  setShowPrintModal(true);
                                }}
                                title="Print Payslip"
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                              >
                                <Printer className="w-4 h-4" />
                              </button>

                              {ps.outstandingAmount > 0 && run.status !== 'CANCELLED' && run.status !== 'DRAFT' && (
                                <>
                                  <button
                                    onClick={() => openDeductionModal(run, ps)}
                                    title="Apply Manual Deduction"
                                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"
                                  >
                                    <MinusCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => openPaymentModal(run, ps)}
                                    title="Pay Outstanding"
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                  >
                                    <CreditCard className="w-4 h-4" />
                                  </button>
                                </>
                              )}

                              {(ps.payments || []).length > 0 && (
                                <button
                                  onClick={() => {
                                    setSelectedPayslip(ps);
                                    setPaymentTargetRun(run);
                                    setShowHistoryModal(true);
                                  }}
                                  title="Payment History & Reversals"
                                  className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-lg"
                                >
                                  <History className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: PREVIEW & FINALIZATION MODAL                                     */}
      {/* ========================================================================= */}
      {showPreviewModal && activeDraft && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-[90rem] max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Payroll Preview: {activeDraft.startDate || activeDraft.month} {activeDraft.endDate && activeDraft.endDate !== activeDraft.startDate ? `to ${activeDraft.endDate}` : ''} ({activeDraft.branchName})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Draft calculations based on finalized canonical attendance and approved overtime. Money does not move.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Blocking issues banner */}
              {activeDraft.payslips.some((p) => !p.canFinalize) && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-bold text-rose-900">Finalization Blocked by Actionable Exceptions</h4>
                    <p className="text-rose-700">
                      One or more employees have unresolved attendance issues (missing punches or unrecorded days) or negative net
                      salary entitlement. Resolve attendance records or adjust policies before finalizing.
                    </p>
                  </div>
                </div>
              )}

              {/* Table */}
              <p className="text-xs text-slate-600">Base + Paid Leave/Holidays + OT + Allowances + Commission − Deductions − Loan = Net Payable. Finalization reserves commission; payment settles it.</p>
              <div className="border border-slate-200 rounded-2xl overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Employee</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-2 text-center">Days (P/L/A)</th>
                      <th className="py-2.5 px-3 text-right">Base Earnings</th>
                      <th className="py-2.5 px-3 text-right">Paid Leave</th>
                      <th className="py-2.5 px-3 text-right">Absence Ded.</th>
                      <th className="py-2.5 px-3 text-right">Penalties</th>
                      <th className="py-2.5 px-3 text-right">Overtime</th>
                      <th className="py-2.5 px-3 text-right">Allow./Bonus/Holiday</th>
                      <th className="py-2.5 px-3 text-right">Commission</th>
                      <th className="py-2.5 px-3 text-right">Other Ded.</th>
                      <th className="py-2.5 px-3 text-right">Loan</th>
                      <th className="py-2.5 px-3 text-right font-bold">Net Payable</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeDraft.payslips.map((p) => (
                      <tr
                        key={p.staffId}
                        className={!p.canFinalize ? 'bg-rose-50/50' : 'hover:bg-slate-50 transition-colors'}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{p.staffName}</div>
                          <div className="text-[10px] text-slate-400">{p.employeeCode}</div>
                          {!p.canFinalize && (
                            <div className="text-[10px] text-rose-600 font-medium mt-0.5">⚠️ {p.blockReason}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px]">
                            {p.compensationType.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono">
                          {p.presentDays}/{p.paidLeaveDays}/{p.absentDays}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">Rs. {p.baseEarnings.toLocaleString()}<BaseExplanation payslip={p} /></td>
                        <td className="py-2.5 px-3 text-right text-emerald-600">{money(p.leaveEarnings, '+')}</td>
                        <td className="py-2.5 px-3 text-right text-rose-600">
                          {p.absenceDeductions > 0 ? `-Rs. ${p.absenceDeductions.toLocaleString()}` : '0'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-rose-600">
                          {money(p.attendancePenaltyDeductions, '-')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-indigo-600">
                          {p.approvedOvertimeAmount > 0 ? `+Rs. ${p.approvedOvertimeAmount.toLocaleString()}` : '0'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-600">{money(plusExtras(p), '+')}</td>
                        <td className="py-2.5 px-3 text-right text-emerald-600">{money(p.commissionPayable ?? 0, '+')}</td>
                        <td className="py-2.5 px-3 text-right text-rose-600">{money(p.otherDeductions ?? 0, '-')}</td>
                        <td className="py-2.5 px-3 text-right text-rose-600">{money(p.advanceRecoveryAmount ?? 0, '-')}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          Rs. {p.netPayable.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {p.canFinalize ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-semibold">
                              Ready
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px] font-semibold">
                              Blocked
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total Summary */}
              <div className="flex justify-end">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 w-72 space-y-1.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Employees:</span>
                    <span className="font-semibold text-slate-900">{activeDraft.employeeCount}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Total Gross Salary:</span>
                    <span className="font-semibold text-slate-900">
                      Rs.{' '}
                      {activeDraft.payslips
                        .reduce((sum, p) => sum + p.grossPayable, 0)
                        .toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Total Deductions:</span>
                    <span className="font-semibold text-rose-600">
                      -Rs.{' '}
                      {activeDraft.payslips
                        .reduce((sum, p) => sum + p.totalDeductions, 0)
                        .toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Unpaid Commission:</span>
                    <span className="font-semibold text-emerald-600">+Rs. {activeDraft.payslips.reduce((sum, p) => sum + (p.commissionPayable ?? 0), 0).toLocaleString()}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-sm text-slate-900">
                    <span>Total Net Payable:</span>
                    <span className="text-indigo-600">Rs. {activeDraft.totalPayable.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Finalizing freezes attendance snapshots, overtime IDs, and marks payable. Money is paid separately.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-medium"
                >
                  Close
                </button>
                <button
                  onClick={handleFinalizePayroll}
                  disabled={actionLoading || activeDraft.payslips.some((p) => !p.canFinalize)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  Finalize & Lock Payroll Run
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DETAILED CALCULATION BREAKDOWN MODAL                             */}
      {/* ========================================================================= */}
      {showDetailsModal && selectedPayslip && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Payslip Calculation: {selectedPayslip.staffName}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedPayslip.payslipNumber} • Period: {selectedPayslip.startDate || selectedPayslip.month}{selectedPayslip.endDate && selectedPayslip.endDate !== selectedPayslip.startDate ? ` to ${selectedPayslip.endDate}` : ''} • {selectedPayslip.compensationType}
                </p>
              </div>
              <button onClick={() => setShowDetailsModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
              {/* Formula & Policy banner */}
              <div className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-100 space-y-2">
                <span className="font-semibold text-indigo-900 text-sm">Policy & Formula Applied:</span>
                <p className="font-mono text-indigo-800 bg-white/80 p-2 rounded border border-indigo-200">
                  {selectedPayslip.calculationDetails.formula}
                </p>
                <div className="grid grid-cols-2 gap-2 text-indigo-900">
                  <div>Absence Divisor: /{selectedPayslip.calculationDetails.divisorUsed}</div>
                  <div>Deduction Rate: Rs. {(selectedPayslip.calculationDetails.dailyRateUsed || 0).toFixed(2)}</div>
                  <div className="col-span-2"><BaseExplanation payslip={selectedPayslip} /></div>
                  {selectedPayslip.calculationDetails.prorationApplied && (
                    <div className="col-span-2 text-amber-700 font-medium">
                      ⚠️ {selectedPayslip.calculationDetails.prorationFormula || 'Proration applied (joined/left mid-month)'}
                    </div>
                  )}
                </div>
              </div>

              {/* Base Salary & Proration Breakdown */}
              <div className="border border-slate-100 rounded-xl p-4 space-y-2">
                <h4 className="font-semibold text-slate-800 text-sm">Base Salary & Proration</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-700">
                    <span>Contractual Base Salary:</span>
                    <span className="font-semibold text-slate-900">Rs. {(selectedPayslip.effectiveBaseSalary ?? selectedPayslip.baseEarnings).toLocaleString()}</span>
                  </div>
                  {selectedPayslip.calculationDetails?.prorationApplied && (
                    <div className="flex justify-between text-amber-700 bg-amber-50/70 p-2 rounded-lg">
                      <div>
                        <span className="font-medium">Proration Adjustment:</span>
                        <span className="block text-[11px] text-amber-600">{selectedPayslip.calculationDetails.prorationFormula}</span>
                      </div>
                      <span className="font-semibold">
                        -Rs. {Math.max(0, (selectedPayslip.effectiveBaseSalary || 0) - selectedPayslip.baseEarnings).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between bg-slate-50 p-2 rounded-lg font-medium text-slate-800">
                    <span>Earned Base Salary:</span>
                    <span className="font-bold text-slate-900">Rs. {selectedPayslip.baseEarnings.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Attendance metrics */}
              <div className="border border-slate-100 rounded-xl p-4 space-y-2">
                <h4 className="font-semibold text-slate-800 text-sm">Attendance Summary</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-slate-400 block text-[11px]">Present Days</span>
                    <span className="text-sm font-bold text-slate-800">{selectedPayslip.presentDays}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-slate-400 block text-[11px]">Paid Leave</span>
                    <span className="text-sm font-bold text-emerald-600">{selectedPayslip.paidLeaveDays}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-slate-400 block text-[11px]">Absent Days</span>
                    <span className="text-sm font-bold text-rose-600">{selectedPayslip.absentDays}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-slate-400 block text-[11px]">Half Day</span>
                    <span className="text-sm font-bold text-amber-700">{selectedPayslip.halfDayDays ?? 'N/A'}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-slate-400 block text-[11px]">Unpaid Leave</span>
                    <span className="text-sm font-bold text-rose-600">{selectedPayslip.unpaidLeaveDays ?? 0}</span>
                  </div>
                </div>
              </div>

              {/* Overtime consumption */}
              <div className="border border-slate-100 rounded-xl p-4 space-y-2">
                <h4 className="font-semibold text-slate-800 text-sm">Overtime Snapshot</h4>
                <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg">
                  <div>
                    <span className="font-medium text-slate-800">
                      {selectedPayslip.approvedOvertimeMinutes} Minutes Approved
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      Rate: Rs. {selectedPayslip.approvedOvertimeHourlyRate}/hr
                    </span>
                  </div>
                  <span className="text-sm font-bold text-indigo-600">
                    +Rs. {selectedPayslip.approvedOvertimeAmount.toLocaleString()}
                  </span>
                </div>
                {selectedPayslip.consumedOvertimeIds.length > 0 && (
                  <p className="text-[10px] text-slate-400">
                    Consumed Overtime IDs: {selectedPayslip.consumedOvertimeIds.join(', ')}
                  </p>
                )}
              </div>

              {/* Allowances, adjustments & advance recovery */}
              {(plusExtras(selectedPayslip) > 0 || minusExtras(selectedPayslip) > 0) && (
                <div className="border border-slate-100 rounded-xl p-4 space-y-1.5">
                  <h4 className="font-semibold text-slate-800 text-sm">Allowances, Adjustments & Loan Recoveries</h4>
                  {(selectedPayslip.holidayEarnings ?? 0) > 0 && (
                    <div className="flex justify-between">
                      <span>Holiday / weekly-off pay ({(selectedPayslip.paidHolidayDays ?? 0) + (selectedPayslip.paidWeeklyOffDays ?? 0)} days)</span>
                      <span className="text-emerald-600 font-semibold">+Rs. {selectedPayslip.holidayEarnings!.toLocaleString()}</span>
                    </div>
                  )}
                  {(selectedPayslip.allowanceLines ?? []).map((a) => (
                    <div key={a.id} className="flex justify-between">
                      <span>{a.name} <span className="text-slate-400">(monthly allowance)</span></span>
                      <span className="text-emerald-600 font-semibold">+Rs. {a.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  {(selectedPayslip.adjustments ?? []).map((a) => (
                    <div key={a.id} className="flex justify-between">
                      <span>{a.title} <span className="text-slate-400">({a.type.toLowerCase()})</span></span>
                      <span className={`font-semibold ${a.type === 'DEDUCTION' ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {a.type === 'DEDUCTION' ? '-' : '+'}Rs. {a.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {(selectedPayslip.advanceRecoveries ?? []).map((r) => (
                    <div key={r.advanceId} className="flex justify-between py-1 border-t border-slate-100 text-rose-600">
                      <span>
                        Loan Recovery: <strong>{r.advanceNumber}</strong>{' '}
                        <span className="text-slate-500 font-normal">
                          ({selectedPayslip.status === 'DRAFT' ? 'Projected balance after' : 'Remaining balance'}: Rs. {r.balanceAfter.toLocaleString()})
                        </span>
                      </span>
                      <span className="font-semibold">-Rs. {r.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Net Payout Summary */}
              <div className="bg-slate-50 p-4 rounded-xl space-y-2">
                <div className="flex justify-between text-slate-700">
                  <span>Gross Earnings (Base + Leave + Overtime + Allowances):</span>
                  <span className="font-semibold">Rs. {selectedPayslip.grossPayable.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-rose-600">
                  <span>Total Deductions (Absence + Late/Early + Other + Loans):</span>
                  <span className="font-semibold">-Rs. {selectedPayslip.totalDeductions.toLocaleString()}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-900">
                  <span>Net Salary Payable:</span>
                  <span>Rs. {(selectedPayslip.salaryNetPayable ?? selectedPayslip.netPayable).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>{selectedPayslip.status === 'DRAFT' ? 'Eligible Commission (preview):' : 'Finalized Commission:'}</span>
                  <span>+Rs. {(selectedPayslip.commissionPayable ?? 0).toLocaleString()}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-900">
                  <span>Combined Net Payable:</span>
                  <span className="text-indigo-600">Rs. {selectedPayslip.netPayable.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: RECORD PAYMENT MODAL                                             */}
      {/* ========================================================================= */}
      {showPaymentModal && paymentTargetPayslip && paymentTargetRun && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Disburse Salary Payment</h3>
                  <p className="text-xs text-slate-500">
                    Pay {paymentTargetPayslip.staffName} ({paymentTargetPayslip.employeeCode})
                  </p>
                </div>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-6 space-y-4 text-xs">
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex justify-between items-center text-amber-900">
                <span>Outstanding Salary Balance:</span>
                <span className="text-sm font-bold">
                  Rs. {paymentTargetPayslip.outstandingAmount.toLocaleString()}
                </span>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Disbursement Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentForm({ ...paymentForm, method: 'CASH' })}
                    className={`p-3 rounded-xl border text-center font-medium transition-all ${
                      paymentForm.method === 'CASH'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 ring-2 ring-indigo-500'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    💵 Cash (Open Drawer)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentForm({ ...paymentForm, method: 'ONLINE' })}
                    className={`p-3 rounded-xl border text-center font-medium transition-all ${
                      paymentForm.method === 'ONLINE'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 ring-2 ring-indigo-500'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    🏦 Bank / Online Account
                  </button>
                </div>
              </div>

              {/* Source balance verification */}
              {paymentForm.method === 'CASH' ? (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span>Custodian Drawer:</span>
                    <span className="font-semibold text-slate-800">
                      {activeUserOpenDrawer ? `${user.name} (OPEN)` : 'No Open Drawer!'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Available Cash in Drawer:</span>
                    <span
                      className={`font-bold ${
                        (activeUserOpenDrawer?.expectedInDrawer || 0) < paymentForm.amount
                          ? 'text-rose-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      Rs. {(activeUserOpenDrawer?.expectedInDrawer || 0).toLocaleString()}
                    </span>
                  </div>
                  {!activeUserOpenDrawer && (
                    <p className="text-[11px] text-rose-600 mt-2">
                      ⚠️ Cash payout cannot proceed without an active OPEN drawer registered to your user.
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Select Bank / Online Account</label>
                  <select
                    value={paymentForm.onlineAccountId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, onlineAccountId: e.target.value })}
                    className="w-full border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                  >
                    {onlineAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} - {b.accountName} (Bal: Rs. {b.currentBalance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-600 font-medium mb-1">Payment Amount (Rs.)</label>
                <input
                  type="number"
                  min="1"
                  max={paymentTargetPayslip.outstandingAmount}
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                  className="w-full border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <span className="text-[11px] text-slate-400">
                  Partial payments are permitted up to Rs. {paymentTargetPayslip.outstandingAmount.toLocaleString()}
                </span>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">Reference / Voucher Note</label>
                <input
                  type="text"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                  placeholder="e.g. Sept salary payout voucher #12"
                  className="w-full border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    actionLoading ||
                    (paymentForm.method === 'CASH' &&
                      (!activeUserOpenDrawer || activeUserOpenDrawer.expectedInDrawer < paymentForm.amount))
                  }
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold shadow-sm flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm Disbursement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* MODAL: MANUAL SALARY DEDUCTION MODAL                                       */}
      {/* ========================================================================= */}
      {showDeductionModal && deductionTargetPayslip && deductionTargetRun && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                  <MinusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Apply Manual Deduction</h3>
                  <p className="text-xs text-slate-500">
                    {deductionTargetPayslip.staffName} ({deductionTargetPayslip.employeeCode}) • {deductionTargetPayslip.designation}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowDeductionModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplyDeduction} className="p-6 space-y-4 text-xs">
              {/* Summary card */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Net Salary</div>
                  <div className="text-xs font-bold text-slate-800">
                    Rs. {deductionTargetPayslip.netPayable.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Already Paid</div>
                  <div className="text-xs font-bold text-[#00bcd4]">
                    Rs. {(deductionTargetPayslip.paidAmount || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-amber-600 font-medium">Unpaid Balance</div>
                  <div className="text-xs font-bold text-amber-700">
                    Rs. {deductionTargetPayslip.outstandingAmount.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Preset Chips */}
              <div>
                <label className="block text-slate-600 font-medium mb-1.5">Quick Reasons (Click to set)</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Missed Attendance Punch',
                    'Late Penalty',
                    'Unapproved Absence Penalty',
                    'Salon Equipment / Material Damage',
                    'Cash Register Discrepancy',
                    'Disciplinary Fine',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDeductionForm((prev) => ({ ...prev, title: preset }))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                        deductionForm.title === preset
                          ? 'bg-amber-100 border-amber-300 text-amber-900 font-semibold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title / Reason Input */}
              <div>
                <label className="block text-slate-600 font-medium mb-1">Deduction Title / Reason *</label>
                <input
                  type="text"
                  value={deductionForm.title}
                  onChange={(e) => setDeductionForm({ ...deductionForm, title: e.target.value })}
                  placeholder="e.g. Missed punch on 2026-08-12"
                  className="w-full border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              {/* Amount Input */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-slate-600 font-medium">Deduction Amount (Rs.) *</label>
                  <button
                    type="button"
                    onClick={() => setDeductionForm({ ...deductionForm, amount: deductionTargetPayslip.outstandingAmount })}
                    className="text-[11px] text-amber-700 hover:underline font-semibold"
                  >
                    Max: Rs. {deductionTargetPayslip.outstandingAmount.toLocaleString()}
                  </button>
                </div>
                <input
                  type="number"
                  min="1"
                  max={deductionTargetPayslip.outstandingAmount}
                  value={deductionForm.amount || ''}
                  onChange={(e) => setDeductionForm({ ...deductionForm, amount: Number(e.target.value) })}
                  placeholder="e.g. 500"
                  className="w-full border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-amber-500"
                  required
                />
                <span className="text-[11px] text-slate-400">
                  Deduction will be applied to this payslip, reducing net payable salary and unpaid balance.
                </span>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-slate-600 font-medium mb-1">Additional Notes / Remarks (Optional)</label>
                <textarea
                  value={deductionForm.notes}
                  onChange={(e) => setDeductionForm({ ...deductionForm, notes: e.target.value })}
                  placeholder="Explanation or administrative justification..."
                  rows={2}
                  className="w-full border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeductionModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || deductionForm.amount <= 0 || deductionForm.amount > deductionTargetPayslip.outstandingAmount}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-semibold shadow-sm flex items-center gap-1.5"
                >
                  <MinusCircle className="w-4 h-4" />
                  Confirm Deduction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* MODAL 4: PAYMENT HISTORY & REVERSAL MODAL                                 */}
      {/* ========================================================================= */}
      {showHistoryModal && selectedPayslip && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Disbursement History: {selectedPayslip.staffName}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedPayslip.payslipNumber} • Net: Rs. {selectedPayslip.netPayable.toLocaleString()} • Paid: Rs.{' '}
                  {selectedPayslip.paidAmount.toLocaleString()}
                </p>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto max-h-[70vh]">
              {selectedPayslip.payments.length === 0 ? (
                <p className="text-slate-500 text-center py-4">No disbursements recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {selectedPayslip.payments.map((pmt) => (
                    <div
                      key={pmt.id}
                      className={`p-4 rounded-xl border flex items-center justify-between ${
                        pmt.status === 'REVERSED'
                          ? 'bg-rose-50/50 border-rose-100 opacity-75'
                          : 'bg-white border-slate-200 shadow-sm'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">Rs. {pmt.amount.toLocaleString()}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              pmt.status === 'REVERSED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {pmt.status}
                          </span>
                          <span className="text-slate-400">via {pmt.method}</span>
                        </div>
                        <p className="text-slate-500 text-[11px]">
                          Payer: {pmt.paidByName} | Ref: {pmt.paymentNumber} ({new Date(pmt.paidAt).toLocaleString()})
                        </p>
                        {pmt.status === 'REVERSED' && (
                          <p className="text-rose-600 text-[11px] font-medium">
                            Reversed by {pmt.reversedByName} on {new Date(pmt.reversedAt || '').toLocaleString()}:{' '}
                            {pmt.reversalReason}
                          </p>
                        )}
                      </div>

                      {pmt.status === 'COMPLETED' && (
                        <button
                          onClick={() => {
                            setPaymentToReverse({
                              id: pmt.id,
                              amount: pmt.amount,
                              staffName: selectedPayslip.staffName,
                            });
                          }}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-medium flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reverse
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Sub-form for reversal reason */}
              {paymentToReverse && (
                <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
                  <h4 className="font-bold text-rose-900 text-sm">
                    Confirm Reversal of Rs. {paymentToReverse.amount.toLocaleString()}
                  </h4>
                  <p className="text-rose-700 text-xs">
                    Reversal will restore funds back to the original cash drawer or bank account, increment outstanding
                    balance, and maintain an immutable audit trail.
                  </p>
                  <div>
                    <label className="block text-rose-900 font-medium mb-1">Reason for Reversal *</label>
                    <input
                      type="text"
                      value={reverseReason}
                      onChange={(e) => setReverseReason(e.target.value)}
                      placeholder="e.g. Duplicate voucher entered in error"
                      className="w-full border-rose-300 rounded-xl px-3 py-2 text-xs"
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setPaymentToReverse(null)}
                      className="px-3 py-1.5 border border-rose-300 text-rose-800 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReversePayment}
                      disabled={actionLoading || !reverseReason.trim()}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg shadow-sm"
                    >
                      Confirm Reversal
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: CANCEL PAYROLL RUN MODAL                                         */}
      {/* ========================================================================= */}
      {showCancelModal && runToCancel && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden flex flex-col p-6 space-y-4 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Cancel Payroll Run</h3>
                <p className="text-slate-500">{runToCancel.payrollNumber}</p>
              </div>
            </div>

            <p className="text-slate-600">
              Cancelling releases all consumed attendance references and overtime locks so they can be re-evaluated. Runs
              with active payments must have payments reversed first.
            </p>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Cancellation Reason *</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Roster corrections required for August attendance"
                rows={3}
                className="w-full border-slate-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setRunToCancel(null);
                }}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-medium"
              >
                Back
              </button>
              <button
                onClick={handleCancelRun}
                disabled={actionLoading || !cancelReason.trim()}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl font-semibold shadow-sm"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: PAYROLL POLICY CONFIGURATION MODAL                                */}
      {/* ========================================================================= */}
      {showPolicyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Payroll Calculation Policy</h3>
                  <p className="text-xs text-slate-500">Configure divisors, paid leave, and proration rules</p>
                </div>
              </div>
              <button onClick={() => setShowPolicyModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePolicy} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Monthly Absence / Unpaid Leave Divisor
                </label>
                <select
                  value={String(policyForm.monthlyAbsenceDivisor || 30)}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      monthlyAbsenceDivisor: (isNaN(Number(e.target.value))
                        ? e.target.value
                        : Number(e.target.value)) as any,
                    })
                  }
                  className="w-full border-slate-200 rounded-xl px-3 py-2 bg-slate-50"
                >
                  <option value="30">30 Days Divisor (Standard Salon Rule)</option>
                  <option value="26">26 Days Divisor (Working Days Only)</option>
                  <option value="CALENDAR_DAYS">Actual Calendar Days in Month (28/29/30/31)</option>
                  <option value="WORKING_DAYS">Actual Scheduled Working Days in Month</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Determines daily deduction rate: (Base Salary ÷ Divisor) × Absent Days.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Daily Staff Paid Leave Eligibility
                </label>
                <div className="flex items-center gap-4 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="dailyPaidLeave"
                      checked={policyForm.dailyStaffPaidLeaveEligibility === true}
                      onChange={() => setPolicyForm({ ...policyForm, dailyStaffPaidLeaveEligibility: true })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Eligible for Approved Paid Leave</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="dailyPaidLeave"
                      checked={policyForm.dailyStaffPaidLeaveEligibility === false}
                      onChange={() => setPolicyForm({ ...policyForm, dailyStaffPaidLeaveEligibility: false })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Present Days Only</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Mid-Month Proration Method</label>
                <select
                  value={policyForm.prorationMethod || 'CALENDAR_DAYS'}
                  onChange={(e) => setPolicyForm({ ...policyForm, prorationMethod: e.target.value as any })}
                  className="w-full border-slate-200 rounded-xl px-3 py-2 bg-slate-50"
                >
                  <option value="CALENDAR_DAYS">Prorate by Calendar Days (Employed Days ÷ Month Days)</option>
                  <option value="WORKING_DAYS">Prorate by Working Days (Scheduled Days ÷ Total Working Days)</option>
                  <option value="FIXED_26">Fixed 26-Day Divisor Proration</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Applied when an employee joins or exits mid-month or changes compensation tier.
                </p>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policyForm.nonWorkedWeeklyOffPaid ?? false}
                    onChange={(e) => setPolicyForm({ ...policyForm, nonWorkedWeeklyOffPaid: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Pay non-worked weekly offs for daily-rate employees</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={policyForm.nonWorkedHolidayPaid ?? true}
                    onChange={(e) => setPolicyForm({ ...policyForm, nonWorkedHolidayPaid: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Pay gazetted holidays for all employees</span>
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPolicyModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm"
                >
                  Save Policy Configuration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: PRINT PAYSLIP MODAL                                              */}
      {/* ========================================================================= */}
      {showPrintModal && selectedPayslip && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="font-bold text-slate-800 text-sm">Official Employee Payslip</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Now
                </button>
                <button onClick={() => setShowPrintModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Payslip Body */}
            <div className="p-8 space-y-6 text-xs bg-white text-slate-900" id="printable-payslip">
              <div className="text-center pb-4 border-b border-slate-200">
                <h2 className="text-lg font-bold tracking-tight">SALON OS MANAGEMENT</h2>
                <p className="text-xs text-slate-500">Official Monthly Salary Slip</p>
                <div className="mt-2 inline-block px-3 py-1 bg-slate-100 rounded-full font-semibold text-slate-700">
                  Period: {selectedPayslip.startDate || selectedPayslip.month}{selectedPayslip.endDate && selectedPayslip.endDate !== selectedPayslip.startDate ? ` to ${selectedPayslip.endDate}` : ''}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Employee Details</span>
                  <p className="font-bold text-sm text-slate-900">{selectedPayslip.staffName}</p>
                  <p className="text-slate-600">{selectedPayslip.employeeCode} • {selectedPayslip.designation}</p>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px] uppercase">Payslip Reference</span>
                  <p className="font-bold text-slate-900">{selectedPayslip.payslipNumber}</p>
                  <p className="text-slate-600">Status: {selectedPayslip.status}</p>
                </div>
              </div>

              <div className="space-y-2">
                {/* 1. Base Salary & Proration */}
                <p className="text-xs text-slate-600">Divisor: /{selectedPayslip.calculationDetails?.divisorUsed}. {selectedPayslip.calculationDetails?.prorationFormula || selectedPayslip.calculationDetails?.formula}</p>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Contractual Base Salary</span>
                  <span className="font-semibold text-slate-900">Rs. {(selectedPayslip.effectiveBaseSalary ?? selectedPayslip.baseEarnings).toLocaleString()}</span>
                </div>
                {selectedPayslip.calculationDetails?.prorationApplied && (
                  <div className="flex justify-between py-1 border-b border-slate-100 text-amber-700 bg-amber-50/50 px-1 rounded">
                    <span>
                      Proration Adjustment
                      <span className="block text-[10px] text-amber-600 font-normal">
                        {selectedPayslip.calculationDetails.prorationFormula}
                      </span>
                    </span>
                    <span className="font-semibold">
                      -Rs. {Math.max(0, (selectedPayslip.effectiveBaseSalary || 0) - selectedPayslip.baseEarnings).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-slate-100 bg-slate-50/60 px-1 rounded">
                  <span className="text-slate-700 font-medium">Earned Base Salary</span>
                  <span className="font-bold text-slate-900">Rs. {selectedPayslip.baseEarnings.toLocaleString()}</span>
                </div>

                {/* 2. Other Earnings & Overtime */}
                {selectedPayslip.leaveEarnings > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Eligible Paid Leave ({selectedPayslip.paidLeaveDays} days)</span>
                    <span className="font-semibold text-slate-900">Rs. {selectedPayslip.leaveEarnings.toLocaleString()}</span>
                  </div>
                )}
                {(selectedPayslip.holidayEarnings ?? 0) > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Holiday / Weekly-off Pay</span>
                    <span className="font-semibold text-slate-900">+Rs. {selectedPayslip.holidayEarnings!.toLocaleString()}</span>
                  </div>
                )}
                {selectedPayslip.approvedOvertimeAmount > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Approved Overtime ({selectedPayslip.approvedOvertimeMinutes} mins @ Rs. {selectedPayslip.approvedOvertimeHourlyRate}/hr)</span>
                    <span className="font-semibold text-indigo-600">+Rs. {selectedPayslip.approvedOvertimeAmount.toLocaleString()}</span>
                  </div>
                )}
                {(selectedPayslip.allowanceLines ?? []).map((a) => (
                  <div key={a.id} className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">{a.name} Allowance</span>
                    <span className="font-semibold text-slate-900">+Rs. {a.amount.toLocaleString()}</span>
                  </div>
                ))}
                {(selectedPayslip.adjustments ?? []).filter((a) => a.type !== 'DEDUCTION').map((a) => (
                  <div key={a.id} className="flex justify-between py-1 border-b border-slate-100 text-emerald-600">
                    <span>{a.title} ({a.type.toLowerCase()})</span>
                    <span className="font-semibold">+Rs. {a.amount.toLocaleString()}</span>
                  </div>
                ))}

                {/* Gross Earnings Subtotal */}
                <div className="flex justify-between py-1.5 border-b-2 border-slate-200 bg-slate-100/70 px-2 rounded font-semibold text-slate-900">
                  <span>Gross Earnings</span>
                  <span>Rs. {selectedPayslip.grossPayable.toLocaleString()}</span>
                </div>

                {/* 3. Itemized Deductions */}
                {selectedPayslip.absenceDeductions > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-100 text-rose-600">
                    <span>Absence Deductions ({selectedPayslip.absentDays + (selectedPayslip.unpaidLeaveDays || 0)} days)</span>
                    <span className="font-semibold">-Rs. {selectedPayslip.absenceDeductions.toLocaleString()}</span>
                  </div>
                )}
                {selectedPayslip.attendancePenaltyDeductions > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-100 text-rose-600">
                    <span>Late & Early Attendance Penalties</span>
                    <span className="font-semibold">-Rs. {selectedPayslip.attendancePenaltyDeductions.toLocaleString()}</span>
                  </div>
                )}
                {(selectedPayslip.adjustments ?? []).filter((a) => a.type === 'DEDUCTION').map((a) => (
                  <div key={a.id} className="flex justify-between py-1 border-b border-slate-100 text-rose-600">
                    <span>{a.title} (deduction)</span>
                    <span className="font-semibold">-Rs. {a.amount.toLocaleString()}</span>
                  </div>
                ))}

                {/* Loan Recoveries (Itemized separately) */}
                {(selectedPayslip.advanceRecoveries ?? []).map((r) => (
                  <div key={r.advanceId} className="flex justify-between py-1 border-b border-slate-100 text-rose-600">
                    <span>
                      Loan Recovery ({r.advanceNumber}){' '}
                      <span className="text-[10px] text-slate-500 font-normal">
                        ({selectedPayslip.status === 'DRAFT' ? 'Projected balance' : 'Remaining balance'}: Rs. {r.balanceAfter.toLocaleString()})
                      </span>
                    </span>
                    <span className="font-semibold">-Rs. {r.amount.toLocaleString()}</span>
                  </div>
                ))}

                {/* Total Deductions Subtotal */}
                <div className="flex justify-between py-1.5 border-b border-slate-200 text-rose-600 font-semibold px-2">
                  <span>Total Deductions</span>
                  <span>-Rs. {selectedPayslip.totalDeductions.toLocaleString()}</span>
                </div>

                {/* 4. Net Salary Payable */}
                <div className="pt-2 flex justify-between font-bold text-sm text-slate-900 border-t-2 border-slate-900">
                  <span>Net Salary Payable</span>
                  <span>Rs. {(selectedPayslip.salaryNetPayable ?? selectedPayslip.netPayable).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-700">
                  <span>{selectedPayslip.status === 'DRAFT' ? 'Eligible Commission (preview)' : 'Finalized Commission'}</span>
                  <span>+Rs. {(selectedPayslip.commissionPayable ?? 0).toLocaleString()}</span>
                </div>
                <div className="pt-2 flex justify-between font-bold text-sm text-slate-900 border-t-2 border-slate-900">
                  <span>Combined Net Payable</span>
                  <span className="text-indigo-600">Rs. {selectedPayslip.netPayable.toLocaleString()}</span>
                </div>

                <div className="flex justify-between text-slate-500 pt-1">
                  <span>Total Disbursed: Rs. {selectedPayslip.paidAmount.toLocaleString()}</span>
                  <span>Outstanding: Rs. {selectedPayslip.outstandingAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-200 text-[10px] text-slate-400 text-center">
                This payslip is system generated by SalonOS and reflects canonical attendance and locked overtime snapshots.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

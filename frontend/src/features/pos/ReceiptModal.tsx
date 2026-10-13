import React, { useRef } from 'react';
import { Invoice, Branch } from '@/types/salon';
import { formatCurrency } from '@/lib/formatters';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Printer, PlusCircle, CheckCircle2, AlertCircle, Building2, Phone, Calendar, User, Scissors } from 'lucide-react';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  branch: Branch | null;
  onNewSale?: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  invoice,
  branch,
  onNewSale,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const isPaid = invoice.status === 'PAID';
  const isPartial = invoice.status === 'PARTIAL';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto font-sans p-6 print:p-0 print:border-none print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center justify-between text-base font-bold text-slate-900">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Transaction Finalized
            </span>
            <Badge
              variant={isPaid ? 'success' : isPartial ? 'warning' : 'neutral'}
              className="text-xs"
            >
              {invoice.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Printable Receipt Paper */}
        <div
          ref={receiptRef}
          className="receipt-print-area bg-white border border-slate-200 rounded-lg p-5 text-xs text-slate-800 space-y-3.5 shadow-xs print:border-none print:shadow-none print:p-0"
        >
          {/* Header Brand */}
          <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#2254E1] text-white font-bold text-xs mb-1">
              iS
            </div>
            <h2 className="font-bold text-sm tracking-tight text-slate-900">
              {branch?.name || 'iSysware Salon'}
            </h2>
            <p className="text-[11px] text-slate-500">{branch?.address}, {branch?.city}</p>
            <p className="text-[11px] text-slate-500">Tel: {branch?.phone || '+92 42 3578-9101'}</p>
            {branch?.email && <p className="text-[10px] text-slate-400">{branch.email}</p>}
            {branch?.taxRegistrationNumber && (
              <div className="pt-1 text-[10px] text-slate-500 font-mono">
                <span className="text-slate-400 font-sans">
                  {branch.taxAuthority ? `${branch.taxAuthority}: ` : 'Tax Reg: '}
                </span>
                {branch.taxRegistrationNumber}
              </div>
            )}
          </div>

          {/* Invoice Meta */}
          <div className="grid grid-cols-2 gap-2 text-[11px] py-1 border-b border-slate-100">
            <div>
              <span className="text-slate-400 block text-[10px]">Invoice No.</span>
              <span className="font-mono font-bold text-slate-900">{invoice.invoiceNumber}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 block text-[10px]">Date & Time</span>
              <span className="font-medium text-slate-800">{invoice.date} • {invoice.time}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Cashier / Terminal</span>
              <span className="font-medium text-slate-800">{invoice.processedByName}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 block text-[10px]">Customer</span>
              <span className="font-bold text-slate-900">{invoice.clientName}</span>
              {invoice.clientPhone && invoice.clientPhone !== 'N/A' && (
                <span className="text-[10px] text-slate-500 block">{invoice.clientPhone}</span>
              )}
              {invoice.customerSource && invoice.customerSource !== 'WALK_IN' && (
                <span className="text-[9px] text-blue-600 block font-medium">
                  Src: {invoice.customerSource}{invoice.customerSourceDetails ? ` (${invoice.customerSourceDetails})` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-2 py-1">
            <div className="flex justify-between font-semibold text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">
              <span>Item / Service</span>
              <span>Amount (PKR)</span>
            </div>

            {invoice.lineItems.map((li, idx) => (
              <div key={li.id || idx} className="space-y-1 pb-1.5 border-b border-slate-50 text-[11px]">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-semibold text-slate-900">
                      {li.quantity > 1 ? `${li.quantity}x ` : ''}{li.name}
                    </span>
                    <span className="text-[10px] text-slate-500 block flex items-center gap-1">
                      <span>Stylist: {li.staffName}</span>
                      {li.type === 'PACKAGE' && (
                        <span className="px-1 py-0.2 bg-blue-50 text-[#2254E1] rounded text-[9px] font-medium">Package</span>
                      )}
                    </span>
                  </div>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatCurrency(li.unitPrice * li.quantity)}
                  </span>
                </div>

                {/* Package component multi-staff breakdown */}
                {li.type === 'PACKAGE' && (
                  <div className="pl-2 border-l-2 border-blue-200 space-y-0.5 mt-1 text-[10px] text-slate-600">
                    {li.assignedStaff && li.assignedStaff.length > 1 && (
                      <div className="text-blue-600 font-medium pb-0.5">
                        Stylists (Equal Split): {li.assignedStaff.map((s) => s.staffName).join(', ')}
                      </div>
                    )}
                    {li.packageComponents && li.packageComponents.map((comp) => (
                      <div key={comp.serviceId} className="flex justify-between">
                        <span>• {comp.serviceName}</span>
                        {comp.allocatedAmount > 0 && (
                          <span className="font-mono text-slate-500">{formatCurrency(comp.allocatedAmount)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Financial Breakdown */}
          <div className="space-y-1.5 pt-1 text-[11px] border-t border-slate-200">
            <div className="flex justify-between text-slate-600">
              <span>Gross Sales (Subtotal)</span>
              <span className="font-mono">{formatCurrency(invoice.subtotal)}</span>
            </div>

            {invoice.discount > 0 && (
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>Promotional Discount</span>
                <span className="font-mono">- {formatCurrency(invoice.discount)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-700 font-medium pt-0.5">
              <span>Net Sales (Attributable)</span>
              <span className="font-mono">{formatCurrency(invoice.netSales)}</span>
            </div>

            <div className="flex justify-between text-slate-600">
              <span>Sales Tax ({branch?.taxEnabled ? `${((branch.taxRate || 0) * 100).toFixed(1)}%` : 'Exempt/0%'})</span>
              <span className="font-mono">{formatCurrency(invoice.tax)}</span>
            </div>

            <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-200 text-xs">
              <span>Bill Total</span>
              <span className="font-mono text-[#2254E1]">{formatCurrency(invoice.netSales + invoice.tax)}</span>
            </div>

            {invoice.tip > 0 && (
              <div className="flex justify-between text-amber-700 bg-amber-50/70 px-1.5 py-0.5 rounded text-[10px]">
                <span>Staff Gratuity / Tip (100% Direct)</span>
                <span className="font-mono font-semibold">+ {formatCurrency(invoice.tip)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-dashed border-slate-300 text-xs">
              <span>Total Invoice Amount</span>
              <span className="font-mono">{formatCurrency(invoice.total)}</span>
            </div>
          </div>

          {/* Payment Receipts Breakdown */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200 text-[11px]">
            <span className="font-semibold text-slate-800 text-[10px] uppercase tracking-wider block">
              Payment Settlement
            </span>

            {invoice.payments.length === 0 ? (
              <p className="text-rose-600 font-medium text-[11px]">No payment collected. Full bill balance outstanding.</p>
            ) : (
              invoice.payments.map((p, idx) => (
                <div key={p.id || idx} className="p-2 bg-slate-50 border border-slate-200/80 rounded space-y-1">
                  <div className="flex justify-between items-center text-slate-800 font-semibold">
                    <span>
                      {p.notes?.includes('Outstanding collection') ? '⚡ Dues Collection Receipt' : p.method === 'CASH' ? 'Cash Payment' : p.paymentAccountName || 'Online Account'}
                    </span>
                    <span className="font-mono font-bold text-slate-900">{formatCurrency(p.amount)}</span>
                  </div>

                  <div className="text-[10px] text-slate-500 space-y-0.5">
                    {p.previousBalance !== undefined && (
                      <div className="flex justify-between text-amber-800 font-medium bg-amber-50/80 px-1.5 py-0.5 rounded">
                        <span>Original Invoice: <strong className="font-mono">{invoice.invoiceNumber}</strong></span>
                        <span>Prev Balance: <strong className="font-mono">{formatCurrency(p.previousBalance)}</strong></span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span>Collector: <strong className="text-slate-700">{p.processedByName}</strong></span>
                      <span>
                        Method: <strong className="text-slate-700">{p.method === 'CASH' ? 'Cash' : p.paymentAccountName || 'Online'}</strong>
                      </span>
                    </div>

                    {p.cashTendered && p.cashTendered > 0 && (
                      <div className="flex justify-between">
                        <span>Tendered: <strong className="font-mono text-slate-700">{formatCurrency(p.cashTendered)}</strong></span>
                        <span>Change: <strong className="font-mono text-emerald-700">{formatCurrency(p.changeReturned || 0)}</strong></span>
                      </div>
                    )}

                    {p.remainingBalance !== undefined && (
                      <div className="flex justify-between text-slate-800 font-bold border-t border-slate-200 pt-0.5 mt-0.5">
                        <span>Remaining Outstanding:</span>
                        <span className="font-mono text-rose-700">{formatCurrency(p.remainingBalance)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
              <span className="text-slate-500">Total Confirmed Collections:</span>
              <span className="font-mono font-bold text-emerald-700">{formatCurrency(invoice.amountPaid)}</span>
            </div>

            <div className="flex justify-between items-center py-1 px-2 rounded bg-slate-100 font-bold">
              <span className={invoice.amountDue > 0 ? 'text-rose-700' : 'text-slate-800'}>
                {invoice.amountDue > 0 ? 'Current Balance Due (Receivable):' : 'Balance Remaining:'}
              </span>
              <span className={`font-mono text-xs ${invoice.amountDue > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {formatCurrency(invoice.amountDue)}
              </span>
            </div>
          </div>

          {/* Footer note */}
          <div className="text-center text-[10px] text-slate-400 pt-3 border-t border-dashed border-slate-200 space-y-0.5">
            <p>Thank you for choosing {branch?.name || 'iSysware Salon'}!</p>
            <p className="font-mono text-[9px] text-slate-400">Powered by iSysware SalonOS Enterprise</p>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2 print:hidden">
          <Button variant="outline" onClick={onClose} className="text-xs">
            Close
          </Button>
          <Button variant="outline" onClick={handlePrint} className="text-xs gap-1.5">
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            Print Receipt
          </Button>
          {onNewSale && (
            <Button
              onClick={() => {
                onClose();
                onNewSale();
              }}
              className="bg-[#2254E1] hover:bg-[#1B44B8] text-white text-xs gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              New Sale
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

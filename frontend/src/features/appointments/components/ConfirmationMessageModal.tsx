import React, { useState, useEffect } from 'react';
import { AppointmentConfirmationMessage } from '@/types/salon';
import { salonService } from '@/services';
import { useAuth } from '@/context/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react';

interface ConfirmationMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string | null;
}

export const ConfirmationMessageModal: React.FC<ConfirmationMessageModalProps> = ({
  isOpen,
  onClose,
  appointmentId,
}) => {
  const { user } = useAuth();
  const [data, setData] = useState<AppointmentConfirmationMessage | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !appointmentId) {
      setData(null);
      setCopied(false);
      setErrorMsg(null);
      return;
    }

    let isMounted = true;
    async function loadMessage() {
      setLoading(true);
      try {
        const msg = await salonService.prepareConfirmationMessage(appointmentId!, user || undefined);
        if (isMounted) setData(msg);
      } catch (err: any) {
        if (isMounted) setErrorMsg(err.message || 'Failed to prepare confirmation message.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadMessage();
    return () => {
      isMounted = false;
    };
  }, [isOpen, appointmentId, user]);

  const handleCopy = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenWhatsApp = () => {
    if (!data) return;
    window.open(data.whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              Appointment Confirmation Message
            </DialogTitle>
            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-300">
              Manual Dispatch
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            Formatted client notification for SMS, WhatsApp, or direct communication.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Preparing confirmation template...</div>
        ) : errorMsg ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            {errorMsg}
          </div>
        ) : data ? (
          <div className="space-y-4 pt-1">
            {/* Disclaimer Banner */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Unverified External Delivery:</strong> Opening WhatsApp launches the client chat with the pre-filled booking details. Delivery status is not tracked by the system.
              </p>
            </div>

            {/* Message Details */}
            <div className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-inner border border-slate-800 select-all">
              {data.messageText}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span>Client Mobile: <strong className="text-slate-700">{data.clientPhone}</strong></span>
              <span>Ref: <strong className="text-slate-700">{data.appointmentNumber}</strong></span>
            </div>
          </div>
        ) : null}

        <DialogFooter className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!data}
              className="gap-1.5 text-xs text-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied to Clipboard' : 'Copy Message'}
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleOpenWhatsApp}
              disabled={!data}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs font-medium shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open WhatsApp
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import React, { useState, useEffect } from 'react';
import { Appointment } from '@/types/salon';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, Calendar, AlertCircle } from 'lucide-react';

interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  onSuccess: (updatedAppointment: Appointment) => void;
}

export const RescheduleModal: React.FC<RescheduleModalProps> = ({
  isOpen,
  onClose,
  appointment,
  onSuccess,
}) => {
  const { user } = useAuth();

  const [newDate, setNewDate] = useState<string>('');
  const [newStartTime, setNewStartTime] = useState<string>('10:00 AM');
  const [reason, setReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (appointment) {
      setNewDate(appointment.date);
      setNewStartTime(appointment.startTime || appointment.time || '10:00 AM');
      setReason('');
      setErrorMsg(null);
    }
  }, [appointment, isOpen]);

  if (!appointment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!newDate) {
      setErrorMsg('Please select a valid date.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await salonService.rescheduleAppointment(
        appointment.id,
        newDate,
        newStartTime,
        reason.trim() || undefined,
        user || undefined
      );
      setIsSubmitting(false);
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || 'Failed to reschedule appointment. Please check stylist availability.');
    }
  };

  const timeOptions = [
    '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
    '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
    '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
    '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
    '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
    '07:00 PM', '07:30 PM', '08:00 PM',
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#2254E1]" />
            Reschedule Appointment
          </DialogTitle>
          <p className="text-xs text-slate-500">
            Move {appointment.clientName}&apos;s appointment ({appointment.appointmentNumber || appointment.id})
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
            <span className="text-slate-500 block">Current Scheduled Date:</span>
            <span className="font-semibold text-slate-800">
              {appointment.date}
            </span>
          </div>

          <div>
            <Label className="text-xs">New Appointment Date</Label>
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label className="text-xs">Reason for Rescheduling</Label>
            <Input
              placeholder="e.g. Client called to push slot by 2 hours"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1"
            />
          </div>

          <DialogFooter className="pt-4 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-[#2254E1] hover:bg-[#1b43b5] text-white"
            >
              {isSubmitting ? 'Rescheduling...' : 'Confirm Reschedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

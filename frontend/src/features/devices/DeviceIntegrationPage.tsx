import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { salonService } from '@/services';
import { Branch } from '@/types/salon';
import { AccessDeniedView } from '@/features/scaffold/AccessDeniedView';
import { DeviceIntegrationView } from '@/features/branches/components/DeviceIntegrationView';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Building2, Cpu } from 'lucide-react';

export const DeviceIntegrationPage: React.FC = () => {
  const { user, activeBranchId, allBranches } = useAuth();

  // Role guard: Only SUPER_ADMIN and ADMIN
  if (!user || (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN')) {
    return <AccessDeniedView attemptedPath="/admin/devices" />;
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const initialBranchId = isSuperAdmin
    ? (activeBranchId !== 'ALL' ? activeBranchId : allBranches[0]?.id || '')
    : (user.branchId as string);

  const [selectedBranchId, setSelectedBranchId] = useState<string>(initialBranchId);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);

  useEffect(() => {
    if (isSuperAdmin) {
      if (activeBranchId !== 'ALL') {
        setSelectedBranchId(activeBranchId);
      } else if (!selectedBranchId && allBranches.length > 0) {
        setSelectedBranchId(allBranches[0].id);
      }
    }
  }, [activeBranchId, isSuperAdmin, selectedBranchId, allBranches]);

  const loadBranchInfo = async (bId: string) => {
    if (!bId) return;
    try {
      const branches = await salonService.getBranches();
      const br = branches.find((b) => b.id === bId) || null;
      setCurrentBranch(br);
    } catch (err) {
      console.error('Failed to load branch info:', err);
    }
  };

  useEffect(() => {
    if (selectedBranchId) {
      loadBranchInfo(selectedBranchId);
    }
  }, [selectedBranchId]);

  return (
    <div className="space-y-6 font-sans">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="primary" className="gap-1">
              <Cpu className="w-3 h-3" />
              Hardware & Device Integration
            </Badge>
            <span className="text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">Biometric & POS Hardware</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 mt-1">
            Device Integration: {currentBranch?.name || 'Assigned Branch'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure ZKTeco/Hikvision biometric attendance terminals, network sync parameters, and physical POS peripherals.
          </p>
        </div>

        {/* Super Admin Branch Switcher */}
        {isSuperAdmin && (
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              Branch Context:
            </span>
            <Select value={selectedBranchId} onValueChange={(val) => setSelectedBranchId(val)}>
              <SelectTrigger className="w-56 h-9 text-xs">
                <SelectValue placeholder="Select Branch" />
              </SelectTrigger>
              <SelectContent>
                {allBranches.map((b) => (
                  <SelectItem key={b.id} value={b.id} className="text-xs">
                    {b.name} ({b.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* DEDICATED HARDWARE VIEW WITHOUT UNRELATED TABS */}
      <div>
        <DeviceIntegrationView
          branchId={selectedBranchId}
          branchName={currentBranch?.name}
          onRefresh={() => loadBranchInfo(selectedBranchId)}
        />
      </div>
    </div>
  );
};

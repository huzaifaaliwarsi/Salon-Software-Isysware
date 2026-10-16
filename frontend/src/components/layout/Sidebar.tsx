import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from '../../context/RouterContext';
import { NAVIGATION_GROUPS } from '../../config/navigation';
import { NavIcon } from './NavIcon';
import { Scissors, AlertCircle, Building2, ChevronRight, ChevronDown } from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  className?: string;
  onNavigate?: () => void;
}

const isRouteMatching = (targetHref: string, currentPath: string): boolean => {
  const baseTarget = targetHref.split('?')[0];
  if (currentPath === baseTarget) return true;
  if (baseTarget !== '/' && baseTarget !== '/dashboard' && currentPath.startsWith(baseTarget)) return true;
  if (baseTarget === '/operations/inventory' && (currentPath === '/inventory' || currentPath === '/operations/inventory-suppliers')) return true;
  if (baseTarget === '/operations/stock-in' && (currentPath === '/operations/purchases' || currentPath === '/purchases')) return true;
  if (baseTarget === '/operations/suppliers' && (currentPath === '/suppliers' || currentPath === '/operations/vendors')) return true;
  if (baseTarget === '/operations/supplier-ledger' && currentPath === '/operations/supplier-khata') return true;
  if (baseTarget === '/operations/stock-adjustments' && currentPath === '/operations/adjustments') return true;
  if (baseTarget === '/reports/sales-invoices' && currentPath === '/invoices/sales') return true;
  if (baseTarget === '/reports/unpaid-invoices' && currentPath === '/invoices/unpaid') return true;
  if (baseTarget === '/accounts/expenses' && currentPath === '/expenses') return true;
  if (baseTarget === '/reports/detailed-expenses' && currentPath.startsWith('/reports/detailed-expenses')) return true;
  if (baseTarget === '/reports/detailed-income' && (currentPath === '/reports/detailed-income' || currentPath === '/reports/income-drilldown')) return true;
  if (baseTarget === '/reports/debit-credit' && (currentPath === '/reports/debit-credit-statement' || currentPath === '/reports/cash-drawer' || currentPath === '/reports/payment-accounts')) return true;
  if (baseTarget === '/reports/tax' && currentPath === '/reports/tax-management') return true;
  if (baseTarget === '/reports/attendance' && (currentPath === '/reports/attendance-overtime' || currentPath === '/reports/overtime')) return true;
  if (baseTarget === '/reports/operating-profit' && (currentPath === '/reports/cogs' || currentPath === '/reports/cogs-report')) return true;
  if (baseTarget === '/accounts/account-settlement' && currentPath === '/reports/settlement-history') return true;
  if (baseTarget === '/admin/branch-settings' && (currentPath === '/admin/tax-settings' || currentPath === '/admin/payment-accounts')) return true;
  if (baseTarget === '/admin/data-reset' && currentPath === '/admin/reset-data') return true;
  if (baseTarget === '/admin/users' && currentPath === '/admin/users-access') return true;
  return false;
};

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  className = '',
  onNavigate,
}) => {
  const { user, activeBranchId, allBranches } = useAuth();
  const { pathname, navigate } = useRouter();
  const [expandedMenus, setExpandedMenus] = React.useState<Record<string, boolean>>({});

  const toggleSubMenu = (itemId: string, defaultOpen: boolean) => {
    setExpandedMenus((prev) => ({
      ...prev,
      [itemId]: prev[itemId] !== undefined ? !prev[itemId] : !defaultOpen,
    }));
  };

  if (!user) return null;

  // Filter groups and children that the current user has permission to see
  const visibleGroups = NAVIGATION_GROUPS.map((group) => {
    if (!group.allowedRoles.includes(user.role)) return null;
    const visibleItems = group.items
      .filter((item) => item.allowedRoles.includes(user.role))
      .map((item) => ({
        ...item,
        children: item.children
          ? item.children.filter((child) => child.allowedRoles.includes(user.role))
          : undefined,
      }))
      .filter((item) => !item.children || item.children.length > 0);
    if (visibleItems.length === 0) return null;
    return { ...group, items: visibleItems };
  }).filter(Boolean);

  const activeBranchName =
    activeBranchId === 'ALL'
      ? 'All Branches (Consolidated)'
      : allBranches.find((b) => b.id === activeBranchId)?.name || 'Selected Branch';

  const handleItemClick = (href: string) => {
    navigate(href);
    if (onNavigate) {
      onNavigate();
    }
  };

  return (
    <aside
      className={`h-screen bg-white border-r border-slate-200/80 flex flex-col transition-all duration-200 select-none ${
        isCollapsed ? 'w-20' : 'w-72'
      } ${className}`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center px-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden cursor-pointer" onClick={() => handleItemClick('/dashboard')}>
          <div className="w-9 h-9 rounded-xl bg-[#2254E1] flex items-center justify-center text-white shrink-0 shadow-xs">
            <Scissors className="w-5 h-5 -rotate-45" />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold text-slate-900 tracking-tight">iSysware</span>
                <span className="text-[10px] font-bold text-[#2254E1] bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                  SalonOS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">Multi-Branch System</p>
            </div>
          )}
        </div>
      </div>

      {/* Active Branch Notice Banner */}
      {!isCollapsed && (
        <div className="px-3.5 pt-3 pb-1">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-[#2254E1] shrink-0" />
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-slate-800 truncate leading-tight">
                  {activeBranchName}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                  {user.role === 'SUPER_ADMIN'
                    ? activeBranchId === 'ALL'
                      ? 'Consolidated read mode'
                      : 'Active single branch'
                    : 'Assigned branch scope'}
                </p>
              </div>
            </div>
            {activeBranchId === 'ALL' && user.role === 'SUPER_ADMIN' && (
              <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-start gap-1 text-[11px] text-amber-700">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>Transactions require single branch.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-5">
        {visibleGroups.map((group) => {
          if (!group) return null;
          return (
            <div key={group.id} className="space-y-1">
              {!isCollapsed && (
                <p className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const hasChildren = Boolean(item.children && item.children.length > 0);
                const isChildActive = hasChildren && item.children!.some((c) => isRouteMatching(c.href, pathname));
                const isExpanded = expandedMenus[item.id] !== undefined
                  ? expandedMenus[item.id]
                  : isChildActive;
                const isActive = (!hasChildren && isRouteMatching(item.href, pathname)) || (hasChildren && isChildActive);

                return (
                  <div key={item.id} className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (hasChildren && !isCollapsed) {
                          toggleSubMenu(item.id, isChildActive);
                        } else {
                          handleItemClick(item.href);
                        }
                      }}
                      title={isCollapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150 cursor-pointer group text-left ${
                        isActive && !hasChildren
                          ? 'bg-blue-50 text-[#2254E1] font-bold shadow-2xs'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100/80'
                      }`}
                    >
                      <div
                        className={`p-1.5 rounded-lg shrink-0 transition-colors ${
                          isActive
                            ? 'bg-[#2254E1] text-white shadow-xs'
                            : 'text-slate-500 group-hover:text-slate-800 group-hover:bg-slate-200/60'
                        }`}
                      >
                        <NavIcon name={item.iconName} className="w-4 h-4" />
                      </div>

                      {!isCollapsed && (
                        <div className="flex-1 flex items-center justify-between overflow-hidden">
                          <span className="truncate font-semibold text-slate-800 text-[13px]">{item.label}</span>
                          {hasChildren ? (
                            <ChevronDown
                              className={`w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 shrink-0 ${
                                isExpanded ? 'rotate-180 text-blue-600' : ''
                              }`}
                            />
                          ) : item.badge ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-100 text-[#2254E1]">
                              {item.badge}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </button>

                    {/* Submenu Accordion Dropdown */}
                    {hasChildren && isExpanded && !isCollapsed && (
                      <div className="ml-6 pl-3.5 border-l-2 border-slate-200/90 space-y-1 py-1.5 my-1">
                        {item.children!.map((child) => {
                          const isCurrent = isRouteMatching(child.href, pathname);
                          return (
                            <button
                              key={child.id}
                              type="button"
                              onClick={() => handleItemClick(child.href)}
                              className={`w-full text-left py-1.5 px-3 rounded-lg text-[12.5px] transition-colors cursor-pointer block truncate ${
                                isCurrent
                                  ? 'text-[#1E40AF] font-bold bg-blue-50/90 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900 font-medium hover:bg-slate-100/70'
                              }`}
                            >
                              {child.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer Role Badge */}
      <div className="p-3 border-t border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200/60">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          {!isCollapsed && (
            <div className="overflow-hidden">
              <p className="text-[11px] font-semibold text-slate-800 truncate">
                {user.role.replace('_', ' ')}
              </p>
              <p className="text-[10px] text-slate-400 truncate">Active Portal</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

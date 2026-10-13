import { User, Role } from '../types/auth';
import { NAVIGATION_GROUPS } from '../config/navigation';

export function canSwitchBranch(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'SUPER_ADMIN';
}

export function canCreateTransactions(activeBranchId: string | 'ALL'): boolean {
  // Creating or changing branch transactions requires one branch; All Branches is read-only.
  return activeBranchId !== 'ALL';
}

export function canAccessRoute(user: User | null, routePath: string): boolean {
  if (!user) return false;

  // Normalize path without query/hash
  const path = routePath.split('?')[0].split('#')[0];

  // Root or base dashboard redirect is handled contextually
  if (path === '/' || path === '') return true;

  // Staff specific routes
  if (user.role === 'STAFF') {
    const staffAllowed = ['/my-performance', '/my-attendance', '/my-reports', '/profile'];
    return staffAllowed.includes(path);
  }

  // Non-staff should not access staff-only workspace routes
  if (path.startsWith('/my-performance') || path.startsWith('/my-attendance') || path.startsWith('/my-reports')) {
    return false;
  }

  // Check against NAVIGATION_GROUPS with path synonym support
  const normalizedPath =
    path === '/admin/users-access'
      ? '/admin/users'
      : path === '/invoices/sales'
      ? '/reports/sales-invoices'
      : path === '/invoices/unpaid'
      ? '/reports/unpaid-invoices'
      : path === '/operations/pos'
      ? '/pos'
      : path === '/expenses'
      ? '/accounts/expenses'
      : path === '/admin/tax-settings' || path === '/admin/payment-accounts'
      ? '/admin/branch-settings'
      : path === '/operations/overtime'
      ? '/operations/manual-overtime'
      : path === '/accounts/tips' || path === '/accounts/tips-statement' || path === '/reports/tips-statement' || path === '/reports/tips'
      ? '/accounts/tips-management' // Tips Statement is a subview of Tips Management (spec §1: not a report-menu page)
      : path === '/operations/staff-performance'
      ? '/reports/staff-performance'
      : path === '/appointments'
      ? '/operations/appointments'
      : path === '/clients'
      ? '/operations/clients'
      : path === '/reports/appointment-audit'
      ? '/reports/appointments'
      : path === '/operations/inventory' || path === '/inventory' || path === '/operations/suppliers'
      ? '/operations/inventory-suppliers'
      : path === '/reports/inventory' || path === '/reports/stock-movement' || path === '/reports/batches'
      ? '/reports/inventory-movement'
      : path === '/reports/cogs' || path === '/reports/cogs-report'
      ? '/reports/operating-profit'
      : path;

  for (const group of NAVIGATION_GROUPS) {
    for (const item of group.items) {
      if (item.href === normalizedPath || item.href === path) {
        return item.allowedRoles.includes(user.role);
      }
    }
  }

  // Allow profile modal / page
  if (path === '/profile') return true;

  // Default fallback for known sub-routes
  return false;
}

export function canManageBranches(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'SUPER_ADMIN';
}

export function canManageUsers(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
}

export function canManageStaff(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
}

export function getDefaultRouteForRole(role: Role): string {
  switch (role) {
    case 'STAFF':
      return '/my-performance';
    case 'SUPER_ADMIN':
    case 'ADMIN':
    case 'ACCOUNTANT':
    default:
      return '/dashboard';
  }
}

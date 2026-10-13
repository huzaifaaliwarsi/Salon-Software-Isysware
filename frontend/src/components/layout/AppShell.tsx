import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileDrawer } from './MobileDrawer';
import { useRouter } from '../../context/RouterContext';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const { pathname } = useRouter();

  // Generate dynamic breadcrumbs based on pathname
  const generateBreadcrumbs = () => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) {
      return [{ label: 'Workspace' }, { label: 'Dashboard' }];
    }

    const breadcrumbs = [];
    const firstPart = parts[0];

    const categoryMap: Record<string, string> = {
      dashboard: 'Workspace',
      pos: 'Workspace',
      operations: 'Operations',
      accounts: 'Accounts & Finance',
      reports: 'Reporting & Analytics',
      admin: 'Administration',
      'my-performance': 'My Workspace',
      'my-attendance': 'My Workspace',
      'my-reports': 'My Workspace',
    };

    if (categoryMap[firstPart]) {
      breadcrumbs.push({ label: categoryMap[firstPart] });
    }

    // Capitalize and format leaf title
    const leaf = parts[parts.length - 1];
    const leafTitle = leaf
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    breadcrumbs.push({ label: leafTitle });
    return breadcrumbs;
  };

  return (
    <div className="min-h-screen flex bg-[#F5F7FB] text-[#0B1020]">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block shrink-0 sticky top-0 h-screen z-20">
        <Sidebar isCollapsed={isSidebarCollapsed} />
      </div>

      {/* Mobile Drawer */}
      <MobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
      />

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
          breadcrumbs={generateBreadcrumbs()}
        />

        <main className="flex-1 px-4 sm:px-5 lg:px-6 py-5 w-full min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
};

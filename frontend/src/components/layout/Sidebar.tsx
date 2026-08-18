import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

/**
 * The sidebar, once.
 *
 * In the old app this markup was copy-pasted into every one of ~90 HTML files,
 * which made a nav change a 90-file edit and meant pages silently drifted out
 * of sync with each other. Here it is a single component and the nav is data.
 *
 * Items are added as their pages land -- see docs/PLAN.md for the order.
 */

interface NavItem {
  to: string;
  label: string;
  /** React 19 removed the global JSX namespace, hence ReactNode not JSX.Element. */
  icon: ReactNode;
}

const icons = {
  dashboard: (
    <svg className="shrink-0 fill-current" width="16" height="16" viewBox="0 0 16 16">
      <path d="M5.936.278A7.983 7.983 0 0 1 8 0a8 8 0 1 1-8 8c0-.722.104-1.413.278-2.064a1 1 0 1 1 1.932.516A5.99 5.99 0 0 0 2 8a6 6 0 1 0 6-6c-.53 0-1.045.076-1.548.21A1 1 0 1 1 5.936.278Z" />
    </svg>
  ),
  projects: (
    <svg className="shrink-0 fill-current" width="16" height="16" viewBox="0 0 16 16">
      <path d="M2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2Zm0 2h12v3H2V2Zm0 5h5v7H2V7Zm7 0h5v7H9V7Z" />
    </svg>
  ),
  invoices: (
    <svg className="shrink-0 fill-current" width="16" height="16" viewBox="0 0 16 16">
      <path d="M3 0h10a1 1 0 0 1 1 1v14l-3-2-3 2-3-2-3 2V1a1 1 0 0 1 1-1Zm2 4v2h6V4H5Zm0 4v2h6V8H5Z" />
    </svg>
  ),
  payables: (
    <svg className="shrink-0 fill-current" width="16" height="16" viewBox="0 0 16 16">
      <path d="M0 3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V3Zm2 2v2h12V5H2Zm0 4v4h5V9H2Z" />
    </svg>
  ),
  tasks: (
    <svg className="shrink-0 fill-current" width="16" height="16" viewBox="0 0 16 16">
      <path d="M1 1h4v14H1V1Zm5 0h4v9H6V1Zm5 0h4v11h-4V1Z" />
    </svg>
  ),
  clients: (
    <svg className="shrink-0 fill-current" width="16" height="16" viewBox="0 0 16 16">
      <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 1.5c-3 0-6 1.5-6 3.5V15h12v-2c0-2-3-3.5-6-3.5Z" />
    </svg>
  ),
  vendors: (
    <svg className="shrink-0 fill-current" width="16" height="16" viewBox="0 0 16 16">
      <path d="M2 1h12l1 4a2 2 0 0 1-3.5 1.5A2 2 0 0 1 8 6a2 2 0 0 1-3.5.5A2 2 0 0 1 1 5l1-4Zm1 7v7h4v-4h2v4h4V8H3Z" />
    </svg>
  ),
  inventory: (
    <svg className="shrink-0 fill-current" width="16" height="16" viewBox="0 0 16 16">
      <path d="M8 0 0 4v8l8 4 8-4V4L8 0Zm0 2.2 5.5 2.8L8 7.8 2.5 5 8 2.2Z" />
    </svg>
  ),
  rental: (
    <svg className="shrink-0 fill-current" width="16" height="16" viewBox="0 0 16 16">
      <path d="M8 0 1 5v11h5v-5h4v5h5V5L8 0Zm0 2.5L13 6v8h-1V9H4v5H3V6l5-3.5Z" />
    </svg>
  ),
  transactions: (
    <svg className="shrink-0 fill-current" width="16" height="16" viewBox="0 0 16 16">
      <path d="M1 4h11V1l4 4-4 4V6H1V4Zm14 6H4V7L0 11l4 4v-3h11v-2Z" />
    </svg>
  ),
  subscriptions: (
    <svg className="shrink-0 fill-current" width="16" height="16" viewBox="0 0 16 16">
      <path d="M8 0a8 8 0 1 0 8 8h-2A6 6 0 1 1 8 2v3l4-3.5L8 0Zm1 4H7v5l4 2 1-1.7-3-1.8V4Z" />
    </svg>
  ),
};

/**
 * The nav lists only what actually ships, and every item here is verified
 * against real data on the signed-in user's own token.
 *
 * Phase 10a restored the pure-ERPNext surface. Invoices, Studio rental,
 * Transactions and Subscriptions are built and still withdrawn — each waits on
 * a named phase in docs/PLAN-v2.md, and their icons are kept below for when
 * they come back. A nav item leading to a page this release cannot serve is
 * worse than no nav item.
 */
const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
  { to: '/projects', label: 'Projects', icon: icons.projects },
  { to: '/invoices', label: 'Invoices', icon: icons.invoices },
  { to: '/tasks', label: 'Tasks', icon: icons.tasks },
  { to: '/payables', label: 'Payables', icon: icons.payables },
  { to: '/clients', label: 'Clients', icon: icons.clients },
  { to: '/vendors', label: 'Vendors', icon: icons.vendors },
  { to: '/inventory', label: 'Inventory', icon: icons.inventory },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Backdrop, mobile only */}
      <div
        className={`fixed inset-0 bg-gray-900/30 z-40 lg:hidden lg:z-auto transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
        onClick={onClose}
      />

      <aside
        className={`flex flex-col absolute z-40 left-0 top-0 lg:static lg:left-auto lg:top-auto
                    h-[100dvh] overflow-y-scroll lg:overflow-y-auto no-scrollbar w-64 shrink-0
                    bg-white dark:bg-gray-800 p-4 transition-all duration-200 ease-in-out
                    ${open ? 'translate-x-0' : '-translate-x-64'} lg:translate-x-0`}
      >
        <div className="flex justify-between mb-10 pr-3 sm:px-2">
          <button
            className="lg:hidden text-gray-500 hover:text-gray-400"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M10.7 18.7l1.4-1.4L7.8 13H20v-2H7.8l4.3-4.3-1.4-1.4L4 12z" />
            </svg>
          </button>

          <NavLink to="/projects" className="block">
            <span className="text-xl font-bold text-gray-800 dark:text-gray-100">
              Studio<span className="text-violet-500">OS</span>
            </span>
          </NavLink>
        </div>

        <nav className="space-y-8">
          <div>
            <h3 className="text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold pl-3 mb-3">
              Studio
            </h3>
            <ul className="mt-3">
              {navItems.map((item) => (
                <li key={item.to} className="pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0">
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `block truncate transition ${
                        isActive
                          ? 'text-violet-500'
                          : 'text-gray-800 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white'
                      }`
                    }
                  >
                    <div className="flex items-center">
                      {item.icon}
                      <span className="text-sm font-medium ml-4">{item.label}</span>
                    </div>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </aside>
    </>
  );
}

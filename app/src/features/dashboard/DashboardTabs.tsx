import { NavLink } from 'react-router-dom';

/**
 * Main · Analytics · Fintech.
 *
 * The old app shipped these as three separate 130–170 KB HTML files reached
 * through a "Dashboard" dropdown in the sidebar, each carrying its own full
 * copy of the nav. They are three views of the same two endpoints, so here they
 * are three routes under one nav item with a tab strip — the same shape the
 * client detail page uses.
 *
 * They are `NavLink`s rather than local state on purpose: each view is worth a
 * URL, so a link to the Fintech view can be sent to someone.
 */

const TABS = [
  { to: '/dashboard', label: 'Main', end: true },
  { to: '/dashboard/analytics', label: 'Analytics', end: false },
  { to: '/dashboard/fintech', label: 'Fintech', end: false },
];

export function DashboardTabs() {
  return (
    <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700/60 mb-6 overflow-x-auto">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
              isActive
                ? 'border-violet-500 text-violet-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

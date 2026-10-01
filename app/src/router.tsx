import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ProjectsListPage } from './features/projects/ProjectsListPage';
import { ProjectDetailPage } from './features/projects/ProjectDetailPage';
import { ProjectCreatePage, ProjectEditPage } from './features/projects/ProjectFormPages';
import { DashboardPage } from './pages/DashboardPage';
import { AnalyticsPage } from './features/dashboard/AnalyticsPage';
import { FintechPage } from './features/dashboard/FintechPage';
import { PayablesPage } from './features/payables/PayablesPage';
import { TasksKanbanPage } from './features/tasks/TasksKanbanPage';
import { ClientsPage } from './features/directory/ClientsPage';
import { ClientDetailPage } from './features/directory/ClientDetailPage';
import { VendorsPage } from './features/directory/VendorsPage';
import { InventoryPage } from './features/directory/InventoryPage';
import { InvoicesListPage } from './features/invoices/InvoicesListPage';
import { SignInPage } from './features/auth/SignInPage';
import { RequireSession } from './features/auth/RequireSession';
import { HomePage } from './features/marketing/HomePage';

/**
 * One route table for the whole app.
 *
 * This is what replaces ~90 standalone .html files, each of which carried its
 * own full copy of the sidebar and header. Adding a nav item is now one line
 * in Sidebar.tsx instead of an edit to every page in the project.
 *
 * ## The surface of release 1 (docs/RELEASE-1.md)
 *
 * Dashboard (with Analytics and Fintech), Projects (list, create, edit, detail),
 * Invoices, Tasks, Payables, Clients (list and detail), Vendors, Inventory.
 *
 * Not in release 1: studio rental, transactions, subscriptions, and the invoice
 * designer. Their components stay in `features/ledgers/` and are not routed.
 * To add one back is a line here plus mounting its API route, and it waits for
 * release 2.
 *
 * Project expenses that StudioOS does not have are shown as unknown, not as
 * zero -- so a figure derived from them shows a dash, not a number that would
 * be wrong in the flattering direction.
 *
 * ## Home and sign-in sit outside the shell
 *
 * `/` is the public marketing page (`HomePage`) — a signed-out visitor's
 * actual front door, added because there wasn't one: `/` used to be inside
 * RequireSession, so an unauthenticated visit just bounced straight to
 * `/sign-in` with nothing to see. `HomePage` does its own check and redirects
 * a signed-in visitor straight to `/dashboard`, so it never shows a pitch to
 * someone already using the product.
 *
 * `/sign-in` renders with no sidebar and no header, because there is nothing to
 * navigate to until we know which studio this is. Everything else lives behind
 * RequireSession, which checks once rather than letting each page discover its
 * own 401.
 *
 * `AppLayout` is a pathless layout route (no `path: '/'` of its own) precisely
 * so it doesn't compete with the public `/` route above it for the same exact
 * match — its children's relative paths (`dashboard`, `projects`, ...) still
 * resolve the same way with no path segment in the ancestor chain.
 */
export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/sign-in', element: <SignInPage /> },
  {
    element: <RequireSession />,
    children: [
      {
        element: <AppLayout />,
        children: [
          // Three views of the same two endpoints, as in the old app's
          // Dashboard dropdown — one nav item, three URLs, so a link to the
          // Fintech view can be sent to someone.
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'dashboard/analytics', element: <AnalyticsPage /> },
          { path: 'dashboard/fintech', element: <FintechPage /> },
          { path: 'projects', element: <ProjectsListPage /> },
          // Before /projects/:name, or "new" would be read as a project id.
          { path: 'projects/new', element: <ProjectCreatePage /> },
          { path: 'projects/:name', element: <ProjectDetailPage /> },
          { path: 'projects/:name/edit', element: <ProjectEditPage /> },
          { path: 'invoices', element: <InvoicesListPage /> },
          { path: 'tasks', element: <TasksKanbanPage /> },
          { path: 'payables', element: <PayablesPage /> },
          { path: 'clients', element: <ClientsPage /> },
          { path: 'clients/:name', element: <ClientDetailPage /> },
          { path: 'vendors', element: <VendorsPage /> },
          { path: 'inventory', element: <InventoryPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

function NotFound() {
  return (
    <div className="text-center py-20">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
        Page not found
      </h1>
      <p className="text-sm text-gray-400">
        This page does not exist. Use the menu on the left to go back.
      </p>
    </div>
  );
}

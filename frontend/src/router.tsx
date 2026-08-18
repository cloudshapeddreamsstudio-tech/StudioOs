import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ProjectsListPage } from './features/projects/ProjectsListPage';
import { ProjectDetailPage } from './features/projects/ProjectDetailPage';
import { ProjectCreatePage, ProjectEditPage } from './features/projects/ProjectFormPages';
import { DashboardPage } from './pages/DashboardPage';
import { PayablesPage } from './features/payables/PayablesPage';
import { TasksKanbanPage } from './features/tasks/TasksKanbanPage';
import { ClientsPage } from './features/directory/ClientsPage';
import { ClientDetailPage } from './features/directory/ClientDetailPage';
import { VendorsPage } from './features/directory/VendorsPage';
import { InventoryPage } from './features/directory/InventoryPage';
import { SignInPage } from './features/auth/SignInPage';
import { RequireSession } from './features/auth/RequireSession';

/**
 * One route table for the whole app.
 *
 * This is what replaces ~90 standalone .html files, each of which carried its
 * own full copy of the sidebar and header. Adding a nav item is now one line
 * in Sidebar.tsx instead of an edit to every page in the project.
 *
 * ## The surface as of Phase 10a
 *
 * Projects, plus everything the old app did that needs no database of ours:
 * Dashboard, Tasks, Payables, Clients, Vendors, Inventory.
 *
 * Still withdrawn, and each waiting on a named phase in docs/PLAN-v2.md:
 * Invoices (10c), analytics and fintech (10e), studio rental / transactions /
 * subscriptions (10g). Client detail is 10b. Their components stay in the
 * repo; adding one back is a line here plus mounting its API route.
 *
 * `projects/:name` is back as of Phase 7b, with the crew roster and project
 * expenses explicitly declared unavailable rather than silently treated as
 * zero — so any figure derived from them shows a dash, not a number that
 * would be wrong in the flattering direction.
 *
 * ## Sign-in sits outside the shell (Phase 7a)
 *
 * `/sign-in` renders with no sidebar and no header, because there is nothing to
 * navigate to until we know which studio this is. Everything else lives behind
 * RequireSession, which checks once rather than letting each page discover its
 * own 401.
 */
export const router = createBrowserRouter([
  { path: '/sign-in', element: <SignInPage /> },
  {
    element: <RequireSession />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          // The old app's home was index.html, the dashboard. Note that
          // sign-in still lands on /projects — that was chosen deliberately in
          // 7a and is where the work actually is.
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'projects', element: <ProjectsListPage /> },
          // Before /projects/:name, or "new" would be read as a project id.
          { path: 'projects/new', element: <ProjectCreatePage /> },
          { path: 'projects/:name', element: <ProjectDetailPage /> },
          { path: 'projects/:name/edit', element: <ProjectEditPage /> },
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
        Not in this release
      </h1>
      <p className="text-sm text-gray-400">
        Invoices, analytics, studio rental, transactions and subscriptions are built but not yet
        restored — see <code>docs/PLAN-v2.md</code>, Phase 10.
      </p>
    </div>
  );
}

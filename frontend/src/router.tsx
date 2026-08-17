import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ProjectsListPage } from './features/projects/ProjectsListPage';
import { SignInPage } from './features/auth/SignInPage';
import { RequireSession } from './features/auth/RequireSession';

/**
 * One route table for the whole app.
 *
 * This is what replaces ~90 standalone .html files, each of which carried its
 * own full copy of the sidebar and header. Adding a nav item is now one line
 * in Sidebar.tsx instead of an edit to every page in the project.
 *
 * ## Only Projects is routed (Phase 6a)
 *
 * The other pages are built and verified but are not in this release — see
 * docs/PLAN-v2.md. Their components stay in the repo; only their routes are
 * withdrawn, so re-adding one is a single line here plus mounting its API
 * route in the Worker.
 *
 * `projects/:name` is withdrawn too: project detail needs `/api/project`,
 * which reads the crew roster and expenses from a database that no longer
 * exists. Phase 7b brings it back with those inputs explicitly declared
 * unavailable rather than silently treated as zero. Until then a project link
 * lands on NotFound, which says so.
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
          { index: true, element: <Navigate to="/projects" replace /> },
          { path: 'projects', element: <ProjectsListPage /> },
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
        This release covers Projects only — see <code>docs/PLAN-v2.md</code>.
      </p>
    </div>
  );
}

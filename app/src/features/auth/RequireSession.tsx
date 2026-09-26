import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from './api';

/**
 * Nothing inside the app shell renders until we know who is signed in.
 *
 * Without this, every page mounts, fires its own request, and each one fails
 * with its own 401 -- so the person sees a wall of errors instead of being
 * asked to sign in. Checking once here is what turns that into a redirect.
 */
export function RequireSession() {
  const { data: session, isPending, isError } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <p className="text-sm text-gray-400">Checking your sign-in…</p>
      </div>
    );
  }

  // A failed *check* is not the same as being signed out, but the only useful
  // action is the same one, so do not strand the person on a dead screen.
  if (isError || !session) {
    const from = location.pathname + location.search;
    const to = from && from !== '/' ? `/sign-in?next=${encodeURIComponent(from)}` : '/sign-in';
    return <Navigate to={to} replace />;
  }

  return <Outlet />;
}

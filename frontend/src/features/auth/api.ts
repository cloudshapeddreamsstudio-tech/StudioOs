import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Who is signed in.
 *
 * `/auth/*` sits outside `/api` because those routes are browser navigations,
 * not XHR -- sign-in has to *redirect* the browser to the studio's own ERPNext,
 * which fetch cannot do. Only these two are called as XHR.
 */

export interface SessionUser {
  /** The studio's ERPNext host, e.g. `moonlightfilms.erpnext.com`. */
  host: string;
  /** Their ERPNext user id. */
  user: string;
}

export const sessionKey = ['session'] as const;

async function fetchSession(): Promise<SessionUser | null> {
  const res = await fetch('/auth/me');
  // 401 is the normal "not signed in" answer, not a failure to report.
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Could not check sign-in (${res.status})`);
  return (await res.json()) as SessionUser;
}

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: fetchSession,
    // Sign-in state changes only when the person acts on it.
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useSignOut() {
  const qc = useQueryClient();

  return async () => {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    // Drop every cached answer, not just the session: the cache holds one
    // studio's projects, and the next person to sign in on this browser must
    // not be shown them while their own request is still in flight.
    qc.clear();
    window.location.assign('/sign-in');
  };
}

/**
 * Where to send someone to sign in. A full navigation, not fetch: the browser
 * itself has to travel to the studio's ERPNext and back.
 */
export function signInUrl(site: string): string {
  return `/auth/start?site=${encodeURIComponent(site.trim())}`;
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { ApiError } from './lib/api';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import './styles/index.css';

/**
 * TanStack Query replaces the old app's hand-rolled fetch-then-innerHTML
 * pattern. Every page previously repeated its own loading state, error
 * rendering, and cache-less refetching; this centralises all three.
 */
const queryClient = new QueryClient({
  /**
   * A session that lapses while someone is working must send them to sign in,
   * not leave a red error where their projects were. Handling it once here
   * means no page has to remember to.
   */
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.isUnauthenticated) {
        if (window.location.pathname !== '/sign-in') {
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.assign(`/sign-in?next=${next}`);
        }
      }
    },
  }),
  defaultOptions: {
    queries: {
      // ERPNext data changes when the owner changes it, not on its own.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      /**
       * Retrying an authentication or permission answer is pointless -- the
       * second attempt fails identically, it just delays the redirect and
       * doubles the load on the studio's site.
       */
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.isUnauthenticated || error.isForbidden)) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

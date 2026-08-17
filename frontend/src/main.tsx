import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import './styles/index.css';

/**
 * TanStack Query replaces the old app's hand-rolled fetch-then-innerHTML
 * pattern. Every page previously repeated its own loading state, error
 * rendering, and cache-less refetching; this centralises all three.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ERPNext data changes when the owner changes it, not on its own.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
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

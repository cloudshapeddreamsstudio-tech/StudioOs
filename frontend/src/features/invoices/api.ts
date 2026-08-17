import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { InvoiceListRow } from './types';

export const invoiceKeys = {
  all: ['invoices'] as const,
  detail: (name: string) => ['invoices', name] as const,
};

export function useInvoices() {
  return useQuery({
    queryKey: invoiceKeys.all,
    queryFn: () => api.get<InvoiceListRow[]>('/invoices'),
  });
}

/**
 * The branded print view is server-rendered HTML from the Worker, not a React
 * route — it has to be self-contained so it prints identically offline. Opened
 * in a new tab rather than fetched.
 */
export function invoicePrintUrl(name: string): string {
  return `/api/invoices/${encodeURIComponent(name)}/print`;
}

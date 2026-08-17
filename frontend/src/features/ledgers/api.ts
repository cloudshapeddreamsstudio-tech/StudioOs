import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * The three locally-owned ledgers — studio rental, transactions, subscriptions.
 *
 * Unlike every other feature in the app, none of this lives in ERPNext. D1 is
 * the only copy, which is why these tables are what the nightly backup exists
 * for.
 */

/* ------------------------------------------------------------- studio rental */

export interface RentalSession {
  id: string;
  bookingId: string;
  date: string;
  timeIn: string;
  timeOut: string;
  /** What actually happened. */
  hours: number;
  /** What is charged — rounded to the nearest hour, minimum 1. */
  roundedHours: number;
  amount: number;
  paid: boolean;
  paymentDate: string | null;
  /** Set once rolled into a Sales Invoice; blocks double-billing. */
  invoiceRef: string | null;
}

export interface RentalBooking {
  id: string;
  client: string;
  poc: string;
  tag: string;
  rateType: 'hourly' | 'flat';
  rate: number;
  billingCycle: string;
  notes: string;
  createdAt: string | null;
  sessions: RentalSession[];
  totals: {
    sessionCount: number;
    totalHours: number;
    totalPayable: number;
    totalPaid: number;
    /** Money still owed. Independent of billing status. */
    totalPending: number;
    /** Paperwork not yet raised. Independent of payment status. */
    unbilledCount: number;
    unbilledAmount: number;
  };
}

export function useRentalBookings() {
  return useQuery({
    queryKey: ['studio-rental'],
    queryFn: () => api.get<RentalBooking[]>('/studio-rental/bookings'),
  });
}

/** Rolls every unbilled session on a booking into one draft Sales Invoice. */
export function useRollUpInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      api.post<{ invoice: { name: string } }>(
        `/studio-rental/bookings/${encodeURIComponent(bookingId)}/invoice`,
        {},
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studio-rental'] });
      void qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

/* --------------------------------------------------------------- transactions */

export interface Transaction {
  id: number;
  project: string | null;
  date: string;
  amount: number;
  direction: 'income' | 'expense';
  type: string;
  description: string;
  mode: string;
  /** e.g. 'bank-import' or 'manual' — provenance, used for reconciliation. */
  source: string;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  totals: { income: number; expense: number; net: number; count: number };
}

export function useTransactions() {
  return useQuery({
    queryKey: ['transactions'],
    queryFn: () => api.get<TransactionsResponse>('/transactions'),
  });
}

/* -------------------------------------------------------------- subscriptions */

export interface Subscription {
  id: string;
  name: string;
  category: string;
  vendor: string;
  amount: number;
  currency: string;
  cycle: string;
  nextDue: string;
  paymentMode: string;
  billedTo: string;
  active: boolean;
  notes: string;
  createdAt: string;
}

export interface SubscriptionsResponse {
  subscriptions: Subscription[];
  /** Grouped by currency on purpose — the app has no FX rate and will not
   *  invent one to produce a single headline number. */
  totals: Record<string, { monthly: number; yearly: number }>;
  activeCount: number;
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => api.get<SubscriptionsResponse>('/subscriptions'),
  });
}

export function useToggleSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.put<Subscription>(`/subscriptions/${encodeURIComponent(id)}`, { active }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

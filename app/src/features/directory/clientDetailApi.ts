import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { describeSaveError as describe, type SaveError } from '@/lib/saveError';

/**
 * One client's page, from `GET /api/client/:name`.
 *
 * Note how many of these are nullable. `null` means **the server could not read
 * this**, which is not the same as there being none — the route deliberately
 * stopped substituting empty arrays after the detail page was caught reporting
 * ₹0 outstanding for a client the list page said owed ₹2,29,000. Anything
 * derived from a null here must render as a dash, never as a total.
 */

export interface ClientInvoice {
  name: string;
  custom_invoice_number?: string | null;
  posting_date?: string | null;
  due_date?: string | null;
  grand_total?: number | null;
  outstanding_amount?: number | null;
  status?: string | null;
  creation?: string | null;
}

export interface ClientProject {
  name: string;
  project_name?: string | null;
  status?: string | null;
  custom_shoot_date?: string | null;
  custom_brand?: string | null;
  creation?: string | null;
}

export interface ClientAddress {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
}

export interface ClientCustomer {
  name: string;
  customer_name?: string | null;
  customer_type?: string | null;
  email_id?: string | null;
  mobile_no?: string | null;
  customer_primary_contact?: string | null;
  default_currency?: string | null;
  disabled?: number | null;
}

export interface ClientDetail {
  customer: ClientCustomer;
  address: ClientAddress | null;
  /** Null when the invoices could not be read at all. */
  salesInvoices: ClientInvoice[] | null;
  /** Null when the projects could not be read at all. */
  projects: ClientProject[] | null;
  /** Null when it cannot be computed, because the invoices behind it are unread. */
  outstandingReceivables: number | null;
  /** Custom fields this studio's ERPNext does not have. */
  missingFields: string[];
}

export const clientKeys = {
  all: ['clients'] as const,
  detail: (name: string) => ['client', name] as const,
};

export function useClientDetail(name: string) {
  return useQuery({
    queryKey: clientKeys.detail(name),
    queryFn: () => api.get<ClientDetail>(`/client/${encodeURIComponent(name)}`),
    enabled: Boolean(name),
  });
}

export interface ClientEdit {
  email: string;
  phone: string;
  customerType: string;
  address: {
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
}

/**
 * `email` and `phone` do not go to Customer.
 *
 * `email_id` and `mobile_no` are Frappe *fetch-from* fields sourced from the
 * linked Contact and are read-only on Customer; the route writes them to that
 * Contact's child tables instead, creating one if the client has none. That is
 * entirely server-side — it is noted here only so nobody "simplifies" this into
 * a direct Customer patch.
 */
export function useUpdateClient(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: ClientEdit) =>
      api.put<{ customer: ClientCustomer }>(`/client/${encodeURIComponent(name)}`, values),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clientKeys.detail(name) });
      void qc.invalidateQueries({ queryKey: clientKeys.all });
    },
  });
}

export function describeClientSaveError(error: unknown): SaveError {
  return describe(error, {
    failed: 'Something went wrong saving this client.',
    denied:
      "You don't have permission to change clients in ERPNext. Ask whoever administers your studio's ERPNext.",
  });
}

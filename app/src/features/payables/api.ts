import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PayableInvoice {
  name: string;
  project: string | null;
  amount: number;
  grandTotal: number;
  dueDate: string | null;
  postingDate: string | null;
  status: string;
  partyType: 'Crew' | 'Vendor';
  /** Remarks claim the bill may already be paid — needs a human, never netted out. */
  conflict: boolean;
  remarks: string;
}

export interface SupplierGroup {
  supplier: string;
  supplierName: string;
  /** Money owed to the studio owner himself, not an external liability. */
  isOwner: boolean;
  totalOutstanding: number;
  oldestDueDate: string | null;
  invoices: PayableInvoice[];
}

export interface Payables {
  supplierGroups: SupplierGroup[];
  /**
   * `null` when this ERPNext site does not have the fields the commission is
   * calculated from. Not available -- which is a different fact from "nothing
   * is owed", so it must never be shown as ₹0.
   */
  commission:
    | {
        party: string;
        totalOwed: number;
        projects: { project: string; projectName: string; commissionOwed: number; commissionPercent: number; commissionBase: number }[];
      }[]
    | null;
  /** `commissionOwed` and `grandTotal` are `null` together with `commission`. */
  totals: {
    owedToOthers: number;
    owedToOwner: number;
    commissionOwed: number | null;
    grandTotal: number | null;
  };
  poCount: number;
}

export function usePayables() {
  return useQuery({ queryKey: ['payables'], queryFn: () => api.get<Payables>('/payables') });
}

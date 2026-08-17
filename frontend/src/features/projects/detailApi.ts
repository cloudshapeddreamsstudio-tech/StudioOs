import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Shapes returned by `/api/project/:name` — the single aggregate that backs
 * this whole page, so the browser makes one call rather than a dozen.
 */

export interface DetailTask {
  name: string;
  subject: string;
  status: string;
  priority: string | null;
  is_group: number;
  is_milestone: number;
  exp_start_date: string | null;
  exp_end_date: string | null;
  progress: number | null;
  description: string | null;
  lft: number;
  parent_task: string | null;
}

export interface DetailSalesInvoice {
  name: string;
  custom_invoice_number: string | null;
  posting_date: string | null;
  due_date: string | null;
  grand_total: number | null;
  outstanding_amount: number | null;
  status: string;
}

export interface DetailPurchaseInvoice {
  name: string;
  supplier: string;
  supplier_name: string | null;
  posting_date: string | null;
  due_date: string | null;
  grand_total: number | null;
  outstanding_amount: number | null;
  status: string;
  supplier_group: string | null;
}

export interface DetailPayment {
  name: string;
  payment_type: string;
  party: string;
  party_name: string | null;
  posting_date: string | null;
  paid_amount: number | null;
  mode_of_payment: string | null;
  docstatus: number;
}

export interface DetailFile {
  name: string;
  file_name: string;
  is_private: number;
  creation: string;
}

export interface ActivityEntry {
  kind: 'comment' | 'communication';
  id: string;
  subject?: string;
  content: string;
  who: string;
  direction?: string;
  medium?: string;
  when: string;
}

export interface CrewEntry {
  id: string;
  project: string;
  role: 'Crew' | 'Vendor';
  name: string;
  designation: string;
  rate: number;
  days: number;
  total: number;
  contact: string;
  notes: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  project: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  estimatedAmount: number;
  paidBy: string;
  mode: string;
  createdAt: string;
}

/** Why a project is, or is not, considered finished. */
export interface Completion {
  ready: boolean;
  hasTasks: boolean;
  tasksComplete: boolean;
  tasksRemaining: number;
  crewFullyPaid: boolean;
  crewOutstandingCount: number;
  crewOutstandingAmount: number;
  clientFullyPaid: boolean;
  clientOutstandingCount: number;
  clientOutstandingAmount: number;
  /** True when no crew is on the roster — the reason "Crew Payment Made"
   *  must not auto-tick, since "nothing unpaid" would otherwise look like
   *  "everyone paid". */
  noCrewAssigned: boolean;
  hasVendorInvolvement: boolean;
  vendorFullyPaid: boolean;
}

export interface ProjectDetail {
  project: Record<string, unknown> & {
    name: string;
    project_name: string;
    customer: string | null;
    status: string;
    notes?: string | null;
  };
  tasks: DetailTask[];
  salesInvoices: DetailSalesInvoice[];
  purchaseInvoices: DetailPurchaseInvoice[];
  payments: DetailPayment[];
  files: DetailFile[];
  activity: ActivityEntry[];
  expenses: Expense[];
  expensesByCategory: Record<string, number>;
  crewRoster: CrewEntry[];
  completion: Completion;
  expenseOverview: {
    rows: { category: string; planned: number; actual: number }[];
    plannedTotal: number;
    actualTotal: number;
    margin: {
      commissionPlanned: number;
      commissionActual: number;
      productionPlanned: number;
      productionActual: number;
      productionCeilingPlanned: number;
      productionCeilingActual: number;
      profitPlanned: number;
      profitActual: number;
      profitPlannedPercent: number | null;
      profitActualPercent: number | null;
      meetsTargetPlanned: boolean | null;
      meetsTargetActual: boolean | null;
    };
  };
  finance: {
    sanctioned: number;
    billed: number;
    purchaseCost: number;
    expenseTotal: number;
    remaining: number;
    grossMargin: number;
    marginPercent: number;
    commissionPercent: number;
    commissionBase: number;
    commissionOwed: number;
    salesOutstanding: number;
    purchaseOutstanding: number;
  };
}

export const projectDetailKeys = {
  detail: (name: string) => ['project-detail', name] as const,
};

export function useProjectDetail(name: string) {
  return useQuery({
    queryKey: projectDetailKeys.detail(name),
    queryFn: () => api.get<ProjectDetail>(`/project/${encodeURIComponent(name)}`),
    enabled: Boolean(name),
    /**
     * This GET has side effects — it syncs milestone tasks and the derived
     * project status back to ERPNext. Refetching it casually would re-run
     * those writes, so it is not refetched on focus or remount.
     */
    staleTime: 60_000,
    refetchOnMount: false,
  });
}

export function useAddNote(projectName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api.post(`/project/${encodeURIComponent(projectName)}/note`, { content }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectDetailKeys.detail(projectName) });
    },
  });
}

/** Attached documents are proxied through the Worker so the browser never
 *  needs ERPNext credentials. */
export function projectFileUrl(fileId: string): string {
  return `/api/project/files/${encodeURIComponent(fileId)}/download`;
}

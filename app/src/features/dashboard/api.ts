import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Shapes returned by /api/dashboard — computed server-side in one call. */
export interface DashboardKpis {
  totalBilled: number;
  totalPurchaseCost: number;
  totalGrossMargin: number;
  avgMarginPct: number;
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  activeProjects: number;
  totalProjects: number;
  activeVendors: number;
  totalVendors: number;
}

export interface Dashboard {
  kpis: DashboardKpis;
  monthlyBilled: { month: string; total: number }[];
  monthlyPaidVsOverdue: { month: string; paid: number; overdue: number }[];
  monthlyMargin: { month: string; total: number }[];
  monthlyPurchaseCost: { month: string; total: number }[];
  monthlyProjectsStarted: { month: string; count: number }[];
  projectsByStatus: { status: string; count: number }[];
  invoicesByStatus: { status: string; count: number; amount: number }[];
  vendorsByGroup: { group: string; count: number }[];
  topCustomers: { customer: string; projects: number; totalBilled: number; grossMargin: number }[];
  recentProjects: { name: string; project_name?: string; status?: string }[];
  recentInvoices: { name: string; customer?: string; grand_total?: number; status?: string }[];
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/dashboard'),
  });
}

export interface Insight {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  count: number;
  link: string | null;
}

export function useInsights() {
  return useQuery({
    queryKey: ['insights'],
    queryFn: () => api.get<Insight[]>('/insights'),
  });
}

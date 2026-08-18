import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useDashboard, useInsights, type Insight } from '@/features/dashboard/api';
import { DashboardTabs } from '@/features/dashboard/DashboardTabs';
import { PageHeader, StatTile, Card, TableShell } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatPercent } from '@/lib/format';

/**
 * The dashboard, now backed by the real `/api/dashboard` aggregate rather than
 * the placeholder that derived a couple of numbers from `/api/projects`.
 *
 * Chart.js is registered per-module rather than globally: only the pieces this
 * page uses get pulled into the bundle.
 */
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const SEVERITY_STYLE: Record<Insight['severity'], string> = {
  critical: 'border-red-500/40 bg-red-500/5',
  warning: 'border-amber-500/40 bg-amber-500/5',
  info: 'border-sky-500/40 bg-sky-500/5',
};

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  const { data: insights } = useInsights();

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <DashboardTabs />
        <div className="px-4 py-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          Couldn&apos;t load the dashboard: {(error as Error).message}
        </div>
      </>
    );
  }

  const k = data?.kpis;
  const dash = (v: number | undefined, fmt: (n: number) => string) =>
    isLoading || v === undefined ? '…' : fmt(v);

  return (
    <>
      <PageHeader title="Dashboard" />
      <DashboardTabs />

      {/* What needs attention, before any numbers. The Analytics tab shows the
          same cards in full, with their severity visible. */}
      {insights && insights.length > 0 && (
        <div className="grid grid-cols-12 gap-4 mb-6">
          {insights.map((ins) => (
            <div
              key={ins.title}
              className={`col-span-12 lg:col-span-4 rounded-xl border p-4 ${SEVERITY_STYLE[ins.severity]}`}
            >
              <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm">
                {ins.link ? (
                  <Link to={ins.link} className="hover:underline">
                    {ins.title}
                  </Link>
                ) : (
                  ins.title
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{ins.detail}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-12 gap-6 mb-6">
        <StatTile
          label="Outstanding"
          value={dash(k?.totalOutstanding, formatCurrency)}
          sub={k ? `${k.overdueCount} overdue · ${formatCurrency(k.overdueAmount)}` : undefined}
          tone={k && k.totalOutstanding > 0 ? 'danger' : 'good'}
        />
        <StatTile
          label="Billed (project rollup)"
          value={dash(k?.totalBilled, formatCurrency)}
          sub="Sum of each project's rollup, not of invoices"
        />
        <StatTile
          label="Gross margin"
          value={dash(k?.totalGrossMargin, formatCurrency)}
          sub={k ? `${formatPercent(k.avgMarginPct)} average` : undefined}
          tone="good"
        />
        <StatTile
          label="Projects"
          value={dash(k?.totalProjects, String)}
          sub={k ? `${k.activeProjects} open` : undefined}
        />
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-8">
          <Card title="Billed vs collected, last 6 months">
            <div className="p-5">
              {data ? (
                <Bar
                  height={110}
                  data={{
                    labels: data.monthlyBilled.map((m) => m.month),
                    datasets: [
                      {
                        label: 'Billed',
                        data: data.monthlyBilled.map((m) => m.total),
                        backgroundColor: 'rgba(139,92,246,0.7)',
                      },
                      {
                        label: 'Collected',
                        data: data.monthlyPaidVsOverdue.map((m) => m.paid),
                        backgroundColor: 'rgba(34,197,94,0.7)',
                      },
                      {
                        label: 'Overdue',
                        data: data.monthlyPaidVsOverdue.map((m) => m.overdue),
                        backgroundColor: 'rgba(239,68,68,0.7)',
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: { legend: { position: 'bottom' } },
                    scales: {
                      y: {
                        ticks: {
                          callback: (v) => `₹${Number(v).toLocaleString('en-IN')}`,
                        },
                      },
                    },
                  }}
                />
              ) : (
                <div className="text-center text-gray-400 py-12">Loading…</div>
              )}
            </div>
          </Card>
        </div>

        <div className="col-span-12 xl:col-span-4">
          <Card title="Invoices by status">
            <TableShell
              head={
                <tr>
                  <th className="px-2 first:pl-5 py-3 text-left">Status</th>
                  <th className="px-2 py-3 text-right">Count</th>
                  <th className="px-2 last:pr-5 py-3 text-right">Amount</th>
                </tr>
              }
            >
              {(data?.invoicesByStatus ?? []).map((s) => (
                <tr key={s.status}>
                  <td className="px-2 first:pl-5 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-2 py-3 text-right">{s.count}</td>
                  <td className="px-2 last:pr-5 py-3 text-right">{formatCurrency(s.amount)}</td>
                </tr>
              ))}
            </TableShell>
          </Card>
        </div>

        <div className="col-span-12 xl:col-span-6">
          <Card title="Top customers by billed">
            <TableShell
              head={
                <tr>
                  <th className="px-2 first:pl-5 py-3 text-left">Customer</th>
                  <th className="px-2 py-3 text-right">Projects</th>
                  <th className="px-2 py-3 text-right">Billed</th>
                  <th className="px-2 last:pr-5 py-3 text-right">Margin</th>
                </tr>
              }
            >
              {(data?.topCustomers ?? []).map((c) => (
                <tr key={c.customer}>
                  <td className="px-2 first:pl-5 py-3 font-medium text-gray-800 dark:text-gray-100">
                    {c.customer}
                  </td>
                  <td className="px-2 py-3 text-right">{c.projects}</td>
                  <td className="px-2 py-3 text-right">{formatCurrency(c.totalBilled)}</td>
                  <td className="px-2 last:pr-5 py-3 text-right">{formatCurrency(c.grossMargin)}</td>
                </tr>
              ))}
            </TableShell>
          </Card>
        </div>

        <div className="col-span-12 xl:col-span-6">
          <Card title="Projects by status">
            <TableShell
              head={
                <tr>
                  <th className="px-2 first:pl-5 py-3 text-left">Status</th>
                  <th className="px-2 last:pr-5 py-3 text-right">Count</th>
                </tr>
              }
            >
              {(data?.projectsByStatus ?? []).map((s) => (
                <tr key={s.status}>
                  <td className="px-2 first:pl-5 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-2 last:pr-5 py-3 text-right">{s.count}</td>
                </tr>
              ))}
            </TableShell>
          </Card>
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        &ldquo;Billed (project rollup)&rdquo; sums each project&apos;s{' '}
        <code>total_billed_amount</code>, which is a different measure from summing Sales
        Invoices on the Invoices page — not every invoice is attached to a project.
      </p>
    </>
  );
}

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { useDashboard, type Dashboard } from './api';
import { DashboardTabs } from './DashboardTabs';
import { PageHeader, Card } from '@/components/ui/PageHeader';
import { formatCurrency, formatPercent } from '@/lib/format';

/**
 * Fintech — the port of `fintech.html`, the money-shaped view of the same
 * `/api/dashboard` aggregate the Main tab uses.
 *
 * Five cards, in the old page's own order: receivables, studio commission,
 * billed against what it cost to deliver, the three-line six-month trend, and
 * billed split into paid versus outstanding.
 *
 * Chart.js pieces are registered here rather than globally so only what these
 * charts use is pulled in.
 */
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

const rupees = (v: unknown) => `₹${Number(v).toLocaleString('en-IN')}`;

/** Shared axis config: money on the y-axis, everywhere, in rupees. */
const moneyScale = {
  y: { ticks: { callback: rupees } },
} as const;

const noLegend = { legend: { display: false } } as const;

export function FintechPage() {
  const { data, isLoading, error } = useDashboard();

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

  return (
    <>
      <PageHeader title="Dashboard" />
      <DashboardTabs />

      {isLoading || !data ? (
        <div className="text-center text-gray-400 py-20">Loading…</div>
      ) : (
        <Fintech data={data} />
      )}
    </>
  );
}

function Fintech({ data }: { data: Dashboard }) {
  const k = data.kpis;
  const months = data.monthlyBilled.map((m) => m.month);
  const billedInWindow = data.monthlyBilled.reduce((s, m) => s + m.total, 0);

  return (
    <div className="grid grid-cols-12 gap-6">
      <HeadlineCard
        title="Accounts receivable"
        value={formatCurrency(k.totalOutstanding)}
        badge={`${k.overdueCount} overdue`}
        tone="danger"
      >
        <Line
          height={90}
          data={{
            labels: months,
            datasets: [
              {
                label: 'Overdue',
                data: data.monthlyPaidVsOverdue.map((m) => m.overdue),
                borderColor: 'rgb(239,68,68)',
                backgroundColor: 'rgba(239,68,68,0.15)',
                fill: true,
                tension: 0.3,
              },
            ],
          }}
          options={{ responsive: true, plugins: noLegend, scales: moneyScale }}
        />
      </HeadlineCard>

      <HeadlineCard
        title="Studio commission"
        value={formatCurrency(k.totalGrossMargin)}
        badge={`${formatPercent(k.avgMarginPct)} margin`}
        tone="good"
      >
        <Line
          height={90}
          data={{
            labels: months,
            datasets: [
              {
                label: 'Gross margin',
                data: data.monthlyMargin.map((m) => m.total),
                borderColor: 'rgb(34,197,94)',
                backgroundColor: 'rgba(34,197,94,0.15)',
                fill: true,
                tension: 0.3,
              },
            ],
          }}
          options={{ responsive: true, plugins: noLegend, scales: moneyScale }}
        />
      </HeadlineCard>

      <div className="col-span-12 xl:col-span-6">
        <Card title="Billed vs purchase cost">
          <div className="p-5">
            <Bar
              height={140}
              data={{
                labels: months,
                datasets: [
                  {
                    label: 'Billed',
                    data: data.monthlyBilled.map((m) => m.total),
                    backgroundColor: 'rgba(139,92,246,0.7)',
                  },
                  {
                    label: 'Purchase cost',
                    data: data.monthlyPurchaseCost.map((m) => m.total),
                    backgroundColor: 'rgba(148,163,184,0.7)',
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: { legend: { position: 'bottom' } },
                scales: moneyScale,
              }}
            />
          </div>
          <p className="px-5 pb-4 text-xs text-gray-400">
            Purchase cost is what the studio paid crew and vendors to deliver the work. The gap
            between the two bars is the margin.
          </p>
        </Card>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <Card title="Billed vs outstanding">
          <div className="px-5 pt-4 flex items-baseline gap-3">
            <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {formatCurrency(k.totalOutstanding)}
            </div>
            <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-red-500/20 text-red-700 dark:text-red-400">
              {k.overdueCount} overdue
            </span>
          </div>
          <div className="p-5">
            <Bar
              height={140}
              data={{
                labels: months,
                datasets: [
                  {
                    label: 'Paid',
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
                scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: rupees } } },
              }}
            />
          </div>
          <p className="px-5 pb-4 text-xs text-gray-400">
            Each month&apos;s billed amount, split by what has been paid against what is still
            outstanding.
          </p>
        </Card>
      </div>

      <div className="col-span-12 xl:col-span-8">
        <Card title="Billed / purchase cost / margin, last 6 months">
          <div className="px-5 pt-4 flex items-baseline gap-3">
            <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {formatCurrency(billedInWindow)}
            </div>
            <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-gray-500/20 text-gray-600 dark:text-gray-300">
              billed in this window
            </span>
          </div>
          <div className="p-5">
            <Line
              height={110}
              data={{
                labels: months,
                datasets: [
                  {
                    label: 'Billed',
                    data: data.monthlyBilled.map((m) => m.total),
                    borderColor: 'rgb(139,92,246)',
                    tension: 0.3,
                  },
                  {
                    label: 'Purchase cost',
                    data: data.monthlyPurchaseCost.map((m) => m.total),
                    borderColor: 'rgb(148,163,184)',
                    tension: 0.3,
                  },
                  {
                    label: 'Gross margin',
                    data: data.monthlyMargin.map((m) => m.total),
                    borderColor: 'rgb(34,197,94)',
                    tension: 0.3,
                  },
                ],
              }}
              options={{
                responsive: true,
                plugins: { legend: { position: 'bottom' } },
                scales: moneyScale,
              }}
            />
          </div>
        </Card>
      </div>

      <div className="col-span-12 xl:col-span-4">
        <FinancialsSummary kpis={k} />
      </div>
    </div>
  );
}

function HeadlineCard({
  title,
  value,
  badge,
  tone,
  children,
}: {
  title: string;
  value: string;
  badge: string;
  tone: 'good' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <div className="col-span-12 sm:col-span-6 bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700/60">
      <div className="px-5 pt-5">
        <div className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500 mb-2">
          {title}
        </div>
        <div className="flex items-baseline gap-3 mb-3">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{value}</div>
          <span
            className={`text-xs font-medium rounded-full px-2 py-0.5 ${
              tone === 'danger'
                ? 'bg-red-500/20 text-red-700 dark:text-red-400'
                : 'bg-green-500/20 text-green-700 dark:text-green-400'
            }`}
          >
            {badge}
          </span>
        </div>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

/**
 * The money, in the order it moves: billed in, paid out, what is left.
 *
 * ### Backup and Savings are deliberately not here
 *
 * The old page ended this list with "Backup (20% of margin)" and "Savings (80%
 * of margin)". That split is **CSDS's own policy**, written down in its handoff
 * notes, and it has no source in ERPNext — it was arithmetic on a constant.
 *
 * For CSDS it is true. For any other studio it is a confident statement about
 * money they never agreed to, rendered in the same type as figures that came
 * from their books. There is nowhere to store a per-studio split yet, so rather
 * than show every customer CSDS's policy, the rows are omitted until Phase 10f
 * gives studio-owned settings a home. Recorded there as a named item, not
 * dropped.
 */
function FinancialsSummary({ kpis }: { kpis: Dashboard['kpis'] }) {
  const rows = [
    {
      label: 'Total billed (project rollup)',
      value: `+${formatCurrency(kpis.totalBilled)}`,
      dot: 'bg-green-500',
      valueClass: 'text-green-600 dark:text-green-500',
    },
    {
      label: 'Purchase cost (crew and vendor payouts)',
      value: `−${formatCurrency(kpis.totalPurchaseCost)}`,
      dot: 'bg-red-500',
      valueClass: 'text-gray-800 dark:text-gray-100',
    },
    {
      label: 'Gross margin (studio commission)',
      value: `+${formatCurrency(kpis.totalGrossMargin)}`,
      dot: 'bg-violet-500',
      valueClass: 'text-green-600 dark:text-green-500',
    },
  ];

  return (
    <Card title="Financials summary">
      <ul className="px-5 py-2">
        {rows.map((r, i) => (
          <li
            key={r.label}
            className={`flex items-center gap-3 py-3 text-sm ${
              i < rows.length - 1 ? 'border-b border-gray-100 dark:border-gray-700/60' : ''
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${r.dot}`} />
            <span className="grow text-gray-600 dark:text-gray-300">{r.label}</span>
            <span className={`font-medium shrink-0 ${r.valueClass}`}>{r.value}</span>
          </li>
        ))}
      </ul>
      <p className="px-5 pb-2 text-xs text-gray-400">
        These three roll up each <em>project&apos;s</em> own totals, so they can differ from the
        charts above and from the Invoices page — an invoice not attached to a project counts
        there and not here. If this reads ₹0 while receivables do not, that is the difference.
      </p>
      <p className="px-5 pb-4 text-xs text-gray-400">
        The old app also split the margin into &ldquo;backup&rdquo; and &ldquo;savings&rdquo; at
        20/80. That is one studio&apos;s own policy with no source in ERPNext, so it is not shown
        here until there is somewhere to record each studio&apos;s own split.
      </p>
    </Card>
  );
}

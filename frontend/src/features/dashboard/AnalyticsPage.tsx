import { Link } from 'react-router-dom';
import { useInsights, type Insight } from './api';
import { DashboardTabs } from './DashboardTabs';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * Analytics — the port of `analytics.html`.
 *
 * Rule-based alerts, not AI and not a model: four independent ERPNext queries
 * in `routes/insights.ts`, each turned into a plain-language card. The value is
 * that every card is a fact with a number behind it and a page to go and act
 * on, which is why each carries its own link.
 *
 * The Main tab shows the same cards in a condensed row. This is the full view,
 * with the severity actually visible — an overdue-invoice card and a
 * gear-out-of-service card should not look alike.
 */

const SEVERITY_STYLE: Record<Insight['severity'], string> = {
  critical: 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
};

export function AnalyticsPage() {
  const { data, isLoading, error } = useInsights();

  return (
    <>
      <PageHeader title="Dashboard" />
      <DashboardTabs />

      {error ? (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          Couldn&apos;t load insights: {(error as Error).message}
        </div>
      ) : isLoading ? (
        <div className="text-center text-gray-400 py-20">Loading…</div>
      ) : !data?.length ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-xl p-8 text-center text-gray-400">
          Nothing to flag right now.
        </div>
      ) : (
        <div className="grid gap-4">
          {data.map((ins) => (
            <div
              key={ins.title}
              className={`border rounded-xl p-4 flex items-start justify-between gap-4 ${SEVERITY_STYLE[ins.severity]}`}
            >
              <div>
                <div className="font-semibold mb-1">{ins.title}</div>
                <div className="text-sm opacity-90">{ins.detail}</div>
              </div>
              {ins.link && (
                <Link to={ins.link} className="text-sm font-medium underline shrink-0">
                  View
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400">
        Every card here is computed from your ERPNext at the moment you loaded this page. Cards
        appear only when there is something to say — an empty list means the checks passed, not
        that they were skipped.
      </p>
    </>
  );
}

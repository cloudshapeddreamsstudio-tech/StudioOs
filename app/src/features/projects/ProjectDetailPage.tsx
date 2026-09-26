import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjectDetail, type Completion } from './detailApi';
import {
  ChecklistTab,
  MoneyTab,
  ExpensesTab,
  CrewTab,
  DocsTab,
  ActivityTab,
} from './detailTabs';
import { PageHeader, StatTile } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate, formatPercent } from '@/lib/format';

/**
 * Project detail — the port of `project-detail.html`, the largest page in the
 * old app at 245 KB.
 *
 * Everything comes from one `/api/project/:name` call. Note that GET has side
 * effects on the server: it auto-ticks milestone tasks, creates the vendor
 * payment milestone when vendor involvement appears, and syncs the derived
 * project status back to ERPNext. That is why the query is not refetched on
 * focus or remount — see detailApi.ts.
 */

const TABS = ['Checklist', 'Money', 'Expenses', 'Crew', 'Docs', 'Activity'] as const;
type Tab = (typeof TABS)[number];

export function ProjectDetailPage() {
  const { name = '' } = useParams();
  const { data, isLoading, error } = useProjectDetail(name);
  const [tab, setTab] = useState<Tab>('Checklist');

  if (isLoading) {
    return (
      <>
        <PageHeader title="Project" />
        <div className="text-center text-gray-400 py-20">Loading…</div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title="Project" />
        <div className="px-4 py-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          Couldn&apos;t load {name}: {(error as Error)?.message ?? 'not found'}
        </div>
        <Link to="/projects" className="text-violet-500 text-sm mt-4 inline-block">
          ← Back to projects
        </Link>
      </>
    );
  }

  const p = data.project;
  const f = data.finance;

  return (
    <>
      <Link to="/projects" className="text-sm text-violet-500 hover:underline">
        ← Projects
      </Link>

      <PageHeader title={p.project_name || p.name}>
        <StatusBadge status={p.status} />
        <Link
          to={`/projects/${encodeURIComponent(p.name)}/edit`}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5
                     text-sm font-medium text-gray-700 dark:text-gray-200
                     hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
          Edit
        </Link>
      </PageHeader>

      <div className="text-sm text-gray-500 dark:text-gray-400 -mt-4 mb-6">
        {p.name}
        {p.customer ? ` · ${p.customer}` : ''}
        {p.custom_shoot_date ? ` · shoot ${formatDate(String(p.custom_shoot_date))}` : ''}
      </div>

      <CompletionBanner completion={data.completion} status={p.status} />

      <div className="grid grid-cols-12 gap-6 mb-6">
        <StatTile label="Sanctioned" value={formatCurrency(f.sanctioned)} />
        <StatTile label="Billed" value={formatCurrency(f.billed)} />
        <StatTile
          label="To collect"
          value={formatCurrency(f.salesOutstanding)}
          tone={f.salesOutstanding > 0 ? 'danger' : 'good'}
        />
        <StatTile
          label="Gross margin"
          value={formatCurrency(f.grossMargin)}
          sub={f.marginPercent ? formatPercent(f.marginPercent) : undefined}
        />
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700/60 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
              tab === t
                ? 'border-violet-500 text-violet-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t}
            {t === 'Checklist' && data.completion.tasksRemaining > 0 && (
              <span className="ml-1.5 text-xs text-gray-400">
                {data.completion.tasksRemaining}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'Checklist' && <ChecklistTab data={data} />}
      {tab === 'Money' && <MoneyTab data={data} />}
      {tab === 'Expenses' && <ExpensesTab data={data} />}
      {tab === 'Crew' && <CrewTab data={data} />}
      {tab === 'Docs' && <DocsTab data={data} />}
      {tab === 'Activity' && <ActivityTab data={data} />}
    </>
  );
}

/**
 * Why this project is, or is not, finished.
 *
 * Completion is derived, not chosen — so when a project *isn't* done, the owner
 * needs to see exactly which of the three legs is holding it up rather than
 * being left to guess. The `noCrewAssigned` case is called out specially: with
 * no crew on the roster, "no unpaid crew bills" is true for the wrong reason,
 * and the app must not let that masquerade as everyone having been paid.
 */
function CompletionBanner({ completion, status }: { completion: Completion; status: string }) {
  if (status === 'Cancelled') {
    return (
      <div className="mb-6 px-4 py-3 rounded-xl bg-gray-500/10 text-gray-500 text-sm">
        This project is cancelled. Status is set by hand here — the automatic completion rules
        don&apos;t apply.
      </div>
    );
  }

  if (completion.ready) {
    return (
      <div className="mb-6 px-4 py-3 rounded-xl bg-green-500/10 text-green-700 dark:text-green-500 text-sm">
        Everything is done: checklist complete, crew paid, client paid.
      </div>
    );
  }

  const blockers: string[] = [];
  if (!completion.tasksComplete) {
    blockers.push(
      `${completion.tasksRemaining} task${completion.tasksRemaining === 1 ? '' : 's'} still open`,
    );
  }
  if (!completion.clientFullyPaid) {
    blockers.push(
      `client owes ${formatCurrency(completion.clientOutstandingAmount)} across ${completion.clientOutstandingCount} invoice${completion.clientOutstandingCount === 1 ? '' : 's'}`,
    );
  }
  if (!completion.crewFullyPaid) {
    blockers.push(
      `${formatCurrency(completion.crewOutstandingAmount)} still owed on ${completion.crewOutstandingCount} crew/vendor bill${completion.crewOutstandingCount === 1 ? '' : 's'}`,
    );
  }
  if (!completion.hasTasks) blockers.push('no checklist on this project');

  return (
    <div className="mb-6 px-4 py-3 rounded-xl bg-amber-500/10 text-sm">
      <div className="font-semibold text-amber-700 dark:text-amber-500 mb-1">Not done yet</div>
      <ul className="text-gray-600 dark:text-gray-400 list-disc pl-5 space-y-0.5">
        {blockers.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      {completion.noCrewAssigned && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          No crew is on the roster, so &ldquo;crew paid&rdquo; can&apos;t be confirmed — there is
          simply nothing to check against. Add the roster on the Crew tab.
        </p>
      )}
    </div>
  );
}

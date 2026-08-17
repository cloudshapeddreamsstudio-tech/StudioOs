import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjects } from './api';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QueryState } from '@/components/ui/QueryState';
import { formatCurrency, formatDate, formatPercent } from '@/lib/format';

/**
 * Projects list -- the port of `projects-list.html`.
 *
 * The original was a 177 KB file: full sidebar, full header, an inline
 * `renderRow()` building HTML with template literals, a hand-rolled
 * `escapeHtml`, and manual `innerHTML` assignment. All of that is gone. React
 * escapes by construction, the layout lives in AppLayout, and the data flows
 * through TanStack Query.
 */
export function ProjectsListPage() {
  const { data, isLoading, error } = useProjects();
  const [search, setSearch] = useState('');

  const projects = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (p) =>
        p.project_name?.toLowerCase().includes(q) ||
        p.customer?.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <>
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          Projects
        </h1>
        <div className="flex gap-3 items-center mt-4 sm:mt-0">
          <input
            type="search"
            className="form-input w-full sm:w-64"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {/* Always offered. Whether this person may actually create one is
              ERPNext's decision, and it says so on submit rather than here —
              hiding the button would only guess at an answer we have not asked
              for. Reflecting real permissions is 7d. */}
          <Link
            to="/projects/new"
            className="shrink-0 rounded-md bg-violet-500 hover:bg-violet-600 px-3 py-2
                       text-sm font-semibold text-white"
          >
            New project
          </Link>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700/60">
        <header className="px-5 py-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            All projects{' '}
            <span className="text-gray-400 dark:text-gray-500 font-medium">{projects.length}</span>
          </h2>
        </header>

        <div className="overflow-x-auto">
          <table className="table-auto w-full dark:text-gray-300">
            <thead className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
              <tr>
                <th className="px-2 first:pl-5 last:pr-5 py-3 text-left">Project</th>
                <th className="px-2 py-3 text-left">Client</th>
                <th className="px-2 py-3 text-left">Status</th>
                <th className="px-2 py-3 text-left">Phase</th>
                <th className="px-2 py-3 text-left">Progress</th>
                <th className="px-2 py-3 text-right">Billed</th>
                <th className="px-2 py-3 text-right">Margin</th>
                <th className="px-2 py-3 text-left">Shoot date</th>
                <th className="px-2 last:pr-5 py-3 text-left">Next step</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
              <QueryState
                isLoading={isLoading}
                error={error as Error | null}
                isEmpty={projects.length === 0}
                colSpan={9}
                emptyMessage={search ? 'No projects match that search.' : 'No projects found.'}
              >
                {projects.map((p) => (
                  <tr key={p.name}>
                    <td className="px-2 first:pl-5 last:pr-5 py-3">
                      <Link
                        to={`/projects/${encodeURIComponent(p.name)}`}
                        className="font-medium text-gray-800 dark:text-gray-100 hover:text-violet-500"
                      >
                        {p.project_name}
                      </Link>
                      <div className="text-xs text-gray-400">{p.name}</div>
                    </td>
                    <td className="px-2 py-3">{p.customer ?? '—'}</td>
                    <td className="px-2 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-2 py-3 text-gray-500">{p.phase ?? '—'}</td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-violet-500"
                            style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{formatPercent(p.progress)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right font-medium text-gray-800 dark:text-gray-100">
                      {formatCurrency(p.total_billed_amount)}
                    </td>
                    <td className="px-2 py-3 text-right">{formatCurrency(p.gross_margin)}</td>
                    <td className="px-2 py-3">{formatDate(p.custom_shoot_date)}</td>
                    <td className="px-2 last:pr-5 py-3">
                      <span className="text-violet-500 font-medium">{p.smartAction?.label}</span>
                    </td>
                  </tr>
                ))}
              </QueryState>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

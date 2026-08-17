import { useMemo, useState } from 'react';
import { useTransactions } from './api';
import { PageHeader, StatTile, Card, TableShell } from '@/components/ui/PageHeader';
import { QueryState } from '@/components/ui/QueryState';
import { formatCurrency, formatDate } from '@/lib/format';

/**
 * The lightweight transaction ledger — the port of `transactions.html`.
 *
 * This tracks business lines the studio deliberately keeps out of formal
 * ERPNext accounting, mainly Theatre Education. It exists nowhere else, which
 * is why it is one of the tables the nightly backup covers.
 */
export function TransactionsPage() {
  const { data, isLoading, error } = useTransactions();
  const [search, setSearch] = useState('');
  const [project, setProject] = useState('All');
  const [direction, setDirection] = useState('All');

  const all = useMemo(() => data?.transactions ?? [], [data]);

  const projects = useMemo(() => {
    const present = new Set(all.map((t) => t.project).filter(Boolean) as string[]);
    return ['All', ...[...present].sort()];
  }, [all]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((t) => {
        if (project !== 'All' && t.project !== project) return false;
        if (direction !== 'All' && t.direction !== direction) return false;
        if (!q) return true;
        return (
          t.description?.toLowerCase().includes(q) ||
          t.type?.toLowerCase().includes(q) ||
          t.project?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [all, search, project, direction]);

  /** Totals follow the filters, so they stay honest when a view is narrowed. */
  const shown = useMemo(() => {
    const income = rows.filter((t) => t.direction === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = rows.filter((t) => t.direction === 'expense').reduce((s, t) => s + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [rows]);

  return (
    <>
      <PageHeader title="Transactions">
        <select
          className="form-select"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          aria-label="Filter by project"
        >
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          className="form-select"
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          aria-label="Filter by direction"
        >
          <option value="All">All</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <input
          type="search"
          className="form-input w-full sm:w-52"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </PageHeader>

      <div className="grid grid-cols-12 gap-6 mb-6">
        <StatTile label="Entries" value={isLoading ? '…' : String(rows.length)} />
        <StatTile
          label="Income"
          value={isLoading ? '…' : formatCurrency(shown.income)}
          tone="good"
        />
        <StatTile
          label="Expense"
          value={isLoading ? '…' : formatCurrency(shown.expense)}
          tone="danger"
        />
        <StatTile
          label="Net"
          value={isLoading ? '…' : formatCurrency(shown.net)}
          tone={shown.net < 0 ? 'danger' : 'good'}
        />
      </div>

      <Card>
        <TableShell
          head={
            <tr>
              <th className="px-2 first:pl-5 py-3 text-left">Date</th>
              <th className="px-2 py-3 text-left">Project</th>
              <th className="px-2 py-3 text-left">Description</th>
              <th className="px-2 py-3 text-left">Type</th>
              <th className="px-2 py-3 text-left">Mode</th>
              <th className="px-2 py-3 text-left">Source</th>
              <th className="px-2 last:pr-5 py-3 text-right">Amount</th>
            </tr>
          }
        >
          <QueryState
            isLoading={isLoading}
            error={error as Error | null}
            isEmpty={rows.length === 0}
            colSpan={7}
            emptyMessage={all.length ? 'Nothing matches those filters.' : 'No transactions yet.'}
          >
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="px-2 first:pl-5 py-3 whitespace-nowrap">{formatDate(t.date)}</td>
                <td className="px-2 py-3">{t.project || '—'}</td>
                <td className="px-2 py-3 text-gray-600 dark:text-gray-300">
                  {t.description || '—'}
                </td>
                <td className="px-2 py-3 text-gray-500">{t.type}</td>
                <td className="px-2 py-3 text-gray-500">{t.mode}</td>
                <td className="px-2 py-3">
                  {/* Provenance matters for reconciliation: a bank-imported row
                      was matched from a statement, a manual one was typed. */}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      t.source === 'manual'
                        ? 'bg-gray-500/15 text-gray-500'
                        : 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                    }`}
                  >
                    {t.source}
                  </span>
                </td>
                <td
                  className={`px-2 last:pr-5 py-3 text-right font-medium whitespace-nowrap ${
                    t.direction === 'income'
                      ? 'text-green-600 dark:text-green-500'
                      : 'text-red-500'
                  }`}
                >
                  {t.direction === 'income' ? '+' : '−'}
                  {formatCurrency(t.amount)}
                </td>
              </tr>
            ))}
          </QueryState>
        </TableShell>
      </Card>
    </>
  );
}

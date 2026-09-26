import { useMemo, useState } from 'react';
import { useInvoices, invoicePrintUrl } from './api';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QueryState } from '@/components/ui/QueryState';
import { formatCurrency, formatDate } from '@/lib/format';

/**
 * Invoices list — the port of `invoices.html`.
 *
 * Faithful to the original's columns and semantics, with three deliberate
 * differences:
 *
 *  1. The "select all" checkbox column is gone. It was Alpine demo code wired
 *     to nothing — there were no bulk actions to select *for*.
 *  2. The empty row-menu column is now a working Print link, using the branded
 *     print route.
 *  3. Search, a status filter, and totals are new. The old page rendered all
 *     47 rows with no way to narrow them.
 */

const STATUS_ORDER = ['Overdue', 'Unpaid', 'Paid', 'Draft', 'Cancelled'] as const;

export function InvoicesListPage() {
  const { data, isLoading, error } = useInvoices();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('All');

  const all = useMemo(() => data ?? [], [data]);

  /** Only statuses actually present, so the filter never offers a dead option. */
  const statuses = useMemo(() => {
    const present = new Set(all.map((i) => i.status).filter(Boolean) as string[]);
    const known = STATUS_ORDER.filter((s) => present.has(s));
    const extra = [...present].filter((s) => !STATUS_ORDER.includes(s as never)).sort();
    return ['All', ...known, ...extra];
  }, [all]);

  const invoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((inv) => {
      if (status !== 'All' && inv.status !== status) return false;
      if (!q) return true;
      return (
        inv.name.toLowerCase().includes(q) ||
        inv.customer?.toLowerCase().includes(q) ||
        inv.project?.toLowerCase().includes(q) ||
        inv.custom_invoice_number?.toLowerCase().includes(q)
      );
    });
  }, [all, search, status]);

  /**
   * Totals reflect what is on screen, so they stay honest when a filter is
   * applied. Cancelled invoices are excluded from money totals — they have been
   * reversed in the ledger and counting them overstates both figures.
   */
  const totals = useMemo(() => {
    const live = invoices.filter((i) => i.status !== 'Cancelled');
    return {
      billed: live.reduce((s, i) => s + Number(i.grand_total || 0), 0),
      outstanding: live.reduce((s, i) => s + Number(i.outstanding_amount || 0), 0),
      excluded: invoices.length - live.length,
    };
  }, [invoices]);

  return (
    <>
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          Invoices
        </h1>
        <div className="flex gap-2 mt-4 sm:mt-0">
          <select
            className="form-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="search"
            className="form-input w-full sm:w-56"
            placeholder="Search invoices…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 mb-6">
        <SummaryTile label="Showing" value={String(invoices.length)} />
        <SummaryTile label="Billed" value={formatCurrency(totals.billed)} />
        <SummaryTile
          label="Outstanding"
          value={formatCurrency(totals.outstanding)}
          tone={totals.outstanding > 0 ? 'danger' : 'good'}
        />
      </div>

      {totals.excluded > 0 && (
        <p className="text-xs text-gray-400 mb-4">
          {totals.excluded} cancelled invoice{totals.excluded === 1 ? '' : 's'} shown in the table
          but excluded from the totals above — they have been reversed in the ledger.
        </p>
      )}

      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700/60">
        <div className="overflow-x-auto">
          <table className="table-auto w-full dark:text-gray-300">
            <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
              <tr>
                <th className="px-2 first:pl-5 py-3 text-left">Invoice</th>
                <th className="px-2 py-3 text-left">Customer</th>
                <th className="px-2 py-3 text-left">Project</th>
                <th className="px-2 py-3 text-left">Posting date</th>
                <th className="px-2 py-3 text-right">Grand total</th>
                <th className="px-2 py-3 text-right">Outstanding</th>
                <th className="px-2 py-3 text-left">Status</th>
                <th className="px-2 last:pr-5 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
              <QueryState
                isLoading={isLoading}
                error={error as Error | null}
                isEmpty={invoices.length === 0}
                colSpan={8}
                emptyMessage={
                  all.length ? 'No invoices match those filters.' : 'No invoices found.'
                }
              >
                {invoices.map((inv) => {
                  const outstanding = Number(inv.outstanding_amount || 0);
                  return (
                    <tr key={inv.name}>
                      <td className="px-2 first:pl-5 py-3">
                        <div className="font-medium text-sky-600 dark:text-sky-400">
                          {inv.custom_invoice_number || inv.name}
                        </div>
                        {inv.custom_invoice_number && (
                          <div className="text-xs text-gray-400">{inv.name}</div>
                        )}
                      </td>
                      <td className="px-2 py-3 font-medium text-gray-800 dark:text-gray-100">
                        {inv.customer || '—'}
                      </td>
                      <td className="px-2 py-3">{inv.project || '—'}</td>
                      <td className="px-2 py-3">{formatDate(inv.posting_date)}</td>
                      <td className="px-2 py-3 text-right font-medium text-gray-800 dark:text-gray-100">
                        {formatCurrency(inv.grand_total)}
                      </td>
                      <td
                        className={`px-2 py-3 text-right font-medium ${
                          outstanding > 0 ? 'text-red-500' : 'text-green-600 dark:text-green-500'
                        }`}
                      >
                        {formatCurrency(outstanding)}
                      </td>
                      <td className="px-2 py-3">
                        <StatusBadge status={inv.status || 'Draft'} />
                      </td>
                      <td className="px-2 last:pr-5 py-3 text-right whitespace-nowrap">
                        <a
                          className="text-violet-500 hover:text-violet-600 font-medium"
                          href={invoicePrintUrl(inv.name)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Print
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </QueryState>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SummaryTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-500'
      : tone === 'good'
        ? 'text-green-600 dark:text-green-500'
        : 'text-gray-800 dark:text-gray-100';

  return (
    <div className="col-span-12 sm:col-span-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700/60 p-5">
      <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-2">
        {label}
      </div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

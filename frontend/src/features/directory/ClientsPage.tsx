import { useMemo, useState } from 'react';
import { useClients } from './api';
import { PageHeader, StatTile, Card, TableShell } from '@/components/ui/PageHeader';
import { QueryState } from '@/components/ui/QueryState';
import { formatCurrency } from '@/lib/format';

/** Clients directory — the port of `client-list.html`. */
export function ClientsPage() {
  const { data, isLoading, error } = useClients();
  const [search, setSearch] = useState('');

  const all = useMemo(() => data ?? [], [data]);
  const clients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) => c.customer_name?.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [all, search]);

  const totalOwed = clients.reduce((s, c) => s + Number(c.outstandingReceivables || 0), 0);
  const owing = clients.filter((c) => c.outstandingReceivables > 0).length;

  return (
    <>
      <PageHeader title="Clients">
        <input
          type="search"
          className="form-input w-full sm:w-56"
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </PageHeader>

      <div className="grid grid-cols-12 gap-6 mb-6">
        <StatTile label="Clients" value={String(clients.length)} span={4} />
        <StatTile label="With money outstanding" value={String(owing)} span={4} />
        <StatTile
          label="Total receivable"
          value={formatCurrency(totalOwed)}
          tone={totalOwed > 0 ? 'danger' : 'good'}
          span={4}
        />
      </div>

      <Card>
        <TableShell
          head={
            <tr>
              <th className="px-2 first:pl-5 py-3 text-left">Client</th>
              <th className="px-2 py-3 text-left">Type</th>
              <th className="px-2 py-3 text-left">Email</th>
              <th className="px-2 py-3 text-left">Phone</th>
              <th className="px-2 py-3 text-right">Projects</th>
              <th className="px-2 last:pr-5 py-3 text-right">Outstanding</th>
            </tr>
          }
        >
          <QueryState
            isLoading={isLoading}
            error={error as Error | null}
            isEmpty={clients.length === 0}
            colSpan={6}
            emptyMessage={all.length ? 'No clients match that search.' : 'No clients found.'}
          >
            {clients.map((c) => (
              <tr key={c.name}>
                <td className="px-2 first:pl-5 py-3 font-medium text-gray-800 dark:text-gray-100">
                  {c.customer_name || c.name}
                  {c.disabled ? (
                    <span className="ml-2 text-xs text-gray-400">(disabled)</span>
                  ) : null}
                </td>
                <td className="px-2 py-3">{c.customer_type || '—'}</td>
                <td className="px-2 py-3">{c.email_id || '—'}</td>
                <td className="px-2 py-3">{c.mobile_no || '—'}</td>
                <td className="px-2 py-3 text-right">{c.projectCount}</td>
                <td
                  className={`px-2 last:pr-5 py-3 text-right font-medium ${
                    c.outstandingReceivables > 0
                      ? 'text-red-500'
                      : 'text-green-600 dark:text-green-500'
                  }`}
                >
                  {formatCurrency(c.outstandingReceivables)}
                </td>
              </tr>
            ))}
          </QueryState>
        </TableShell>
      </Card>
    </>
  );
}

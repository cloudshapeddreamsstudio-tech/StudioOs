import { useMemo, useState } from 'react';
import { useInventory, inventoryFileUrl } from './api';
import { PageHeader, StatTile, Card, TableShell } from '@/components/ui/PageHeader';
import { QueryState } from '@/components/ui/QueryState';
import { formatCurrency } from '@/lib/format';

/**
 * Gear inventory — the port of `inventory.html`.
 *
 * Two distinct kinds of thing share this table, and the columns that matter
 * differ between them: in-house gear has an `equipment_status`, rental-house
 * catalogue gear has a `rental_source` instead. Both are shown, blank where
 * not applicable, rather than pretending one schema fits both.
 */

const STATUS_STYLE: Record<string, string> = {
  Available: 'bg-green-500/20 text-green-700 dark:text-green-400',
  'Rented Out': 'bg-sky-500/20 text-sky-700 dark:text-sky-400',
  'In Repair': 'bg-red-500/20 text-red-700 dark:text-red-400',
  'In Maintenance': 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
};

export function InventoryPage() {
  const { data, isLoading, error } = useInventory();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('All');

  const all = useMemo(() => data ?? [], [data]);

  const groups = useMemo(() => {
    const present = new Set(all.map((i) => i.item_group).filter(Boolean));
    return ['All', ...[...present].sort()];
  }, [all]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((i) => {
      if (group !== 'All' && i.item_group !== group) return false;
      if (!q) return true;
      return (
        i.item_name?.toLowerCase().includes(q) ||
        i.item_code.toLowerCase().includes(q) ||
        i.rental_source?.toLowerCase().includes(q)
      );
    });
  }, [all, search, group]);

  const inHouse = all.filter((i) => i.item_group === 'In-House Equipment');
  const outOfService = inHouse.filter(
    (i) => i.equipment_status === 'In Repair' || i.equipment_status === 'In Maintenance',
  ).length;

  return (
    <>
      <PageHeader title="Inventory">
        <select
          className="form-select"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          aria-label="Filter by item group"
        >
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <input
          type="search"
          className="form-input w-full sm:w-56"
          placeholder="Search gear…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </PageHeader>

      <div className="grid grid-cols-12 gap-6 mb-6">
        <StatTile label="Total gear" value={String(all.length)} span={4} />
        <StatTile label="Owned in-house" value={String(inHouse.length)} span={4} />
        <StatTile
          label="Out of service"
          value={String(outOfService)}
          tone={outOfService > 0 ? 'warn' : 'good'}
          span={4}
        />
      </div>

      <Card title="Showing" count={items.length}>
        <TableShell
          head={
            <tr>
              <th className="px-2 first:pl-5 py-3 text-left">Item</th>
              <th className="px-2 py-3 text-left">Group</th>
              <th className="px-2 py-3 text-left">Status</th>
              <th className="px-2 py-3 text-left">Rental source</th>
              <th className="px-2 py-3 text-right">Rate</th>
              <th className="px-2 last:pr-5 py-3 text-left">Docs</th>
            </tr>
          }
        >
          <QueryState
            isLoading={isLoading}
            error={error as Error | null}
            isEmpty={items.length === 0}
            colSpan={6}
            emptyMessage={all.length ? 'No gear matches those filters.' : 'No gear found.'}
          >
            {items.map((i) => (
              <tr key={i.item_code}>
                <td className="px-2 first:pl-5 py-3">
                  <div className="font-medium text-gray-800 dark:text-gray-100">{i.item_name}</div>
                  <div className="text-xs text-gray-400">{i.item_code}</div>
                </td>
                <td className="px-2 py-3 text-gray-500">{i.item_group}</td>
                <td className="px-2 py-3">
                  {i.equipment_status ? (
                    <span
                      className={`inline-flex font-medium rounded-full text-center px-2.5 py-0.5 ${
                        STATUS_STYLE[i.equipment_status] ??
                        'bg-gray-500/20 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {i.equipment_status}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-2 py-3">{i.rental_source || '—'}</td>
                <td className="px-2 py-3 text-right">
                  {i.standard_rate ? formatCurrency(i.standard_rate) : '—'}
                </td>
                <td className="px-2 last:pr-5 py-3">
                  {i.documents.length ? (
                    <div className="flex flex-col gap-0.5">
                      {i.documents.map((d) => (
                        <a
                          key={d.id}
                          className="text-violet-500 hover:text-violet-600 text-xs"
                          href={inventoryFileUrl(d.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {d.name}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </QueryState>
        </TableShell>
      </Card>
    </>
  );
}

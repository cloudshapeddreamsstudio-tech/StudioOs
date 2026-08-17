import { useMemo, useState } from 'react';
import { useVendors } from './api';
import { PageHeader, Card, TableShell } from '@/components/ui/PageHeader';
import { QueryState } from '@/components/ui/QueryState';

/** Vendors directory — crew, freelancers and rental houses. Port of `vendors-list.html`. */
export function VendorsPage() {
  const { data, isLoading, error } = useVendors();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('All');

  const all = useMemo(() => data ?? [], [data]);

  const groups = useMemo(() => {
    const present = new Set(all.map((v) => v.supplier_group).filter(Boolean) as string[]);
    return ['All', ...[...present].sort()];
  }, [all]);

  const vendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((v) => {
      if (group !== 'All' && v.supplier_group !== group) return false;
      if (!q) return true;
      return v.supplier_name?.toLowerCase().includes(q) || v.name.toLowerCase().includes(q);
    });
  }, [all, search, group]);

  return (
    <>
      <PageHeader title="Vendors">
        <select
          className="form-select"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          aria-label="Filter by group"
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
          placeholder="Search vendors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </PageHeader>

      <Card title="Suppliers" count={vendors.length}>
        <TableShell
          head={
            <tr>
              <th className="px-2 first:pl-5 py-3 text-left">Name</th>
              <th className="px-2 py-3 text-left">Group</th>
              <th className="px-2 py-3 text-left">Type</th>
              <th className="px-2 py-3 text-left">Email</th>
              <th className="px-2 py-3 text-left">Phone</th>
              <th className="px-2 last:pr-5 py-3 text-left">Country</th>
            </tr>
          }
        >
          <QueryState
            isLoading={isLoading}
            error={error as Error | null}
            isEmpty={vendors.length === 0}
            colSpan={6}
            emptyMessage={all.length ? 'No vendors match those filters.' : 'No vendors found.'}
          >
            {vendors.map((v) => (
              <tr key={v.name}>
                <td className="px-2 first:pl-5 py-3 font-medium text-gray-800 dark:text-gray-100">
                  {v.supplier_name || v.name}
                  {v.disabled ? (
                    <span className="ml-2 text-xs text-gray-400">(disabled)</span>
                  ) : null}
                </td>
                <td className="px-2 py-3">{v.supplier_group || '—'}</td>
                <td className="px-2 py-3">{v.supplier_type || '—'}</td>
                <td className="px-2 py-3">{v.email_id || '—'}</td>
                <td className="px-2 py-3">{v.mobile_no || '—'}</td>
                <td className="px-2 last:pr-5 py-3">{v.country || '—'}</td>
              </tr>
            ))}
          </QueryState>
        </TableShell>
      </Card>
    </>
  );
}

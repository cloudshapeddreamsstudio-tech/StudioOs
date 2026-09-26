import { useState } from 'react';
import { usePayables, type SupplierGroup } from './api';
import { PageHeader, StatTile, Card } from '@/components/ui/PageHeader';
import { formatCurrency, formatDate } from '@/lib/format';

/**
 * Payables — the port of `payables.html`.
 *
 * Two things this page must never do, both inherited from the spec and both
 * visible in the UI: money owed to the owner himself is shown as its own
 * figure rather than folded into "who I owe", and an invoice whose remarks
 * suggest it may already have been paid is flagged for a human rather than
 * quietly netted out.
 */
export function PayablesPage() {
  const { data, isLoading, error } = usePayables();
  const [open, setOpen] = useState<string | null>(null);

  const conflicts =
    data?.supplierGroups.flatMap((g) => g.invoices.filter((i) => i.conflict)) ?? [];

  return (
    <>
      <PageHeader title="Payables" />

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          Couldn&apos;t load payables: {(error as Error).message}
        </div>
      )}

      <div className="grid grid-cols-12 gap-6 mb-6">
        <StatTile
          label="Owed to others"
          value={isLoading ? '…' : formatCurrency(data?.totals.owedToOthers)}
          sub={data ? `${data.poCount} unpaid bills` : undefined}
          tone="danger"
        />
        <StatTile
          label="Owed to owner"
          value={isLoading ? '…' : formatCurrency(data?.totals.owedToOwner)}
          sub="Own crew fees — not an external liability"
        />
        <StatTile
          label="Commission owed"
          value={isLoading ? '…' : formatCurrency(data?.totals.commissionOwed)}
          sub="Owed by formula; payouts aren't tracked"
        />
        <StatTile
          label="Grand total"
          value={isLoading ? '…' : formatCurrency(data?.totals.grandTotal)}
        />
      </div>

      {conflicts.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="font-semibold text-amber-700 dark:text-amber-500 text-sm mb-1">
            {conflicts.length} bill{conflicts.length === 1 ? '' : 's'} need
            {conflicts.length === 1 ? 's' : ''} human reconciliation
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            The remarks suggest these may already have been paid. They are still counted as owed
            above — the amount is never guessed or netted out automatically.
          </p>
          {conflicts.map((i) => (
            <div key={i.name} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span className="font-medium text-gray-700 dark:text-gray-300">{i.name}</span> —{' '}
              {i.remarks}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {isLoading && <div className="text-center text-gray-400 py-8">Loading…</div>}

        {data?.supplierGroups.map((g) => (
          <SupplierCard
            key={g.supplier}
            group={g}
            expanded={open === g.supplier}
            onToggle={() => setOpen(open === g.supplier ? null : g.supplier)}
          />
        ))}

        {data && data.commission.length > 0 && (
          <Card title="Commission owed">
            <div className="p-5 space-y-3">
              {data.commission.map((c) => (
                <div key={c.party}>
                  <div className="flex justify-between font-medium text-gray-800 dark:text-gray-100">
                    <span>{c.party}</span>
                    <span>{formatCurrency(c.totalOwed)}</span>
                  </div>
                  {c.projects.map((p) => (
                    <div
                      key={p.project}
                      className="flex justify-between text-xs text-gray-500 dark:text-gray-400 pl-4 mt-1"
                    >
                      <span>
                        {p.projectName} · {p.commissionPercent}% of{' '}
                        {formatCurrency(p.commissionBase)}
                      </span>
                      <span>{formatCurrency(p.commissionOwed)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function SupplierCard({
  group,
  expanded,
  onToggle,
}: {
  group: SupplierGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700/60">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div>
          <div className="font-semibold text-gray-800 dark:text-gray-100">
            {group.supplierName}
            {group.isOwner && (
              <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-400">
                you
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {group.invoices.length} bill{group.invoices.length === 1 ? '' : 's'} · oldest due{' '}
            {formatDate(group.oldestDueDate)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-gray-800 dark:text-gray-100">
            {formatCurrency(group.totalOutstanding)}
          </div>
          <div className="text-xs text-gray-400">{expanded ? 'Hide' : 'Show'} bills</div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700/60 px-5 py-3 space-y-2">
          {group.invoices.map((i) => (
            <div key={i.name} className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">{i.name}</span>
                <span className="text-xs text-gray-400 ml-2">
                  {i.partyType}
                  {i.project ? ` · ${i.project}` : ''} · due {formatDate(i.dueDate)}
                </span>
                {i.conflict && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-500">
                    check
                  </span>
                )}
              </div>
              <span className="font-medium">{formatCurrency(i.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

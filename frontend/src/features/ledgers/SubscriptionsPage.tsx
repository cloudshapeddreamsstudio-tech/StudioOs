import { useSubscriptions, useToggleSubscription } from './api';
import { PageHeader, StatTile, Card, TableShell } from '@/components/ui/PageHeader';
import { QueryState } from '@/components/ui/QueryState';
import { formatDate } from '@/lib/format';

/**
 * Recurring studio overheads — the port of `subscriptions.html`.
 *
 * Totals are shown per currency and never combined. The studio pays for some
 * things in USD and some in INR; this app has no exchange rate, and inventing
 * one to produce a single headline figure would be guessing at money.
 */

/** Currency-aware amount formatting — ₹ for INR, the ISO code otherwise. */
function money(amount: number, currency: string): string {
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  }
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // An unknown currency code should still render a readable number.
    return `${currency} ${Math.round(amount).toLocaleString('en-IN')}`;
  }
}

export function SubscriptionsPage() {
  const { data, isLoading, error } = useSubscriptions();
  const toggle = useToggleSubscription();

  const subs = data?.subscriptions ?? [];
  const currencies = Object.entries(data?.totals ?? {});

  return (
    <>
      <PageHeader title="Subscriptions" />

      <div className="grid grid-cols-12 gap-6 mb-6">
        <StatTile
          label="Active"
          value={isLoading ? '…' : `${data?.activeCount ?? 0} of ${subs.length}`}
          span={4}
        />
        {currencies.map(([cur, t]) => (
          <StatTile
            key={cur}
            label={`Monthly (${cur})`}
            value={money(t.monthly, cur)}
            sub={`${money(t.yearly, cur)} a year`}
            span={4}
          />
        ))}
        {!isLoading && currencies.length === 0 && (
          <StatTile label="Monthly" value="—" sub="nothing active" span={4} />
        )}
      </div>

      {currencies.length > 1 && (
        <p className="text-xs text-gray-400 mb-4">
          Totals are kept separate per currency — there is no exchange rate in this app, and
          combining them would mean inventing one.
        </p>
      )}

      <Card>
        <TableShell
          head={
            <tr>
              <th className="px-2 first:pl-5 py-3 text-left">Subscription</th>
              <th className="px-2 py-3 text-left">Category</th>
              <th className="px-2 py-3 text-left">Vendor</th>
              <th className="px-2 py-3 text-right">Amount</th>
              <th className="px-2 py-3 text-left">Cycle</th>
              <th className="px-2 py-3 text-left">Next due</th>
              <th className="px-2 last:pr-5 py-3 text-right">Active</th>
            </tr>
          }
        >
          <QueryState
            isLoading={isLoading}
            error={error as Error | null}
            isEmpty={subs.length === 0}
            colSpan={7}
            emptyMessage="No subscriptions tracked yet."
          >
            {subs.map((s) => (
              <tr key={s.id} className={s.active ? '' : 'opacity-55'}>
                <td className="px-2 first:pl-5 py-3">
                  <div className="font-medium text-gray-800 dark:text-gray-100">{s.name}</div>
                  {s.notes && (
                    <div className="text-xs text-gray-400 max-w-md">{s.notes}</div>
                  )}
                </td>
                <td className="px-2 py-3 text-gray-500">{s.category}</td>
                <td className="px-2 py-3">{s.vendor || '—'}</td>
                <td className="px-2 py-3 text-right font-medium whitespace-nowrap">
                  {money(s.amount, s.currency)}
                </td>
                <td className="px-2 py-3 text-gray-500">{s.cycle}</td>
                <td className="px-2 py-3">{s.nextDue ? formatDate(s.nextDue) : '—'}</td>
                <td className="px-2 last:pr-5 py-3 text-right">
                  <button
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      s.active
                        ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                        : 'bg-gray-500/20 text-gray-500'
                    }`}
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ id: s.id, active: !s.active })}
                    title={s.active ? 'Pause this subscription' : 'Resume this subscription'}
                  >
                    {s.active ? 'active' : 'paused'}
                  </button>
                </td>
              </tr>
            ))}
          </QueryState>
        </TableShell>
      </Card>
    </>
  );
}

import { useState } from 'react';
import { useRentalBookings, useRollUpInvoice, type RentalBooking } from './api';
import { PageHeader, StatTile, TableShell } from '@/components/ui/PageHeader';
import { formatCurrency, formatDate } from '@/lib/format';

/**
 * Studio hall rental — the port of `studio-rental.html`.
 *
 * The distinction this page has to keep visible: **paid** and **billed** are
 * independent. A session can be paid in cash with no invoice raised, and a
 * session can be invoiced and still unpaid. Showing one number for both would
 * misreport both.
 */
export function StudioRentalPage() {
  const { data, isLoading, error } = useRentalBookings();
  const [open, setOpen] = useState<string | null>(null);

  const bookings = data ?? [];
  const totals = bookings.reduce(
    (acc, b) => ({
      payable: acc.payable + b.totals.totalPayable,
      pending: acc.pending + b.totals.totalPending,
      unbilled: acc.unbilled + b.totals.unbilledAmount,
      sessions: acc.sessions + b.totals.sessionCount,
    }),
    { payable: 0, pending: 0, unbilled: 0, sessions: 0 },
  );

  return (
    <>
      <PageHeader title="Studio rental" />

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          Couldn&apos;t load bookings: {(error as Error).message}
        </div>
      )}

      <div className="grid grid-cols-12 gap-6 mb-6">
        <StatTile label="Bookings" value={isLoading ? '…' : String(bookings.length)} />
        <StatTile label="Sessions" value={isLoading ? '…' : String(totals.sessions)} />
        <StatTile
          label="Still owed"
          value={isLoading ? '…' : formatCurrency(totals.pending)}
          tone={totals.pending > 0 ? 'danger' : 'good'}
          sub="money not yet received"
        />
        <StatTile
          label="Not yet invoiced"
          value={isLoading ? '…' : formatCurrency(totals.unbilled)}
          tone={totals.unbilled > 0 ? 'warn' : 'good'}
          sub="paperwork not yet raised"
        />
      </div>

      {isLoading && <div className="text-center text-gray-400 py-10">Loading…</div>}

      <div className="space-y-4">
        {bookings.map((b) => (
          <BookingCard
            key={b.id}
            booking={b}
            expanded={open === b.id}
            onToggle={() => setOpen(open === b.id ? null : b.id)}
          />
        ))}
      </div>

      {!isLoading && bookings.length === 0 && (
        <div className="text-center text-gray-400 py-10">No rental bookings yet.</div>
      )}
    </>
  );
}

function BookingCard({
  booking,
  expanded,
  onToggle,
}: {
  booking: RentalBooking;
  expanded: boolean;
  onToggle: () => void;
}) {
  const rollUp = useRollUpInvoice();
  const t = booking.totals;

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700/60">
      <div className="px-5 py-4 flex flex-wrap items-start justify-between gap-3">
        <button className="text-left" onClick={onToggle} aria-expanded={expanded}>
          <div className="font-semibold text-gray-800 dark:text-gray-100">
            {booking.tag}
            <span className="ml-2 text-xs font-normal text-gray-400">
              {booking.rateType === 'hourly'
                ? `${formatCurrency(booking.rate)}/hr`
                : `${formatCurrency(booking.rate)} flat`}
            </span>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {booking.client}
            {booking.poc ? ` · ${booking.poc}` : ''}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {t.sessionCount} sessions · {t.totalHours} billable hours ·{' '}
            {expanded ? 'hide' : 'show'} log
          </div>
        </button>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-xs text-gray-400 uppercase font-semibold">Owed</div>
            <div
              className={`font-bold ${t.totalPending > 0 ? 'text-red-500' : 'text-green-600 dark:text-green-500'}`}
            >
              {formatCurrency(t.totalPending)}
            </div>
            <div className="text-xs text-gray-400">of {formatCurrency(t.totalPayable)}</div>
          </div>

          {t.unbilledCount > 0 && (
            <button
              className="btn-primary"
              disabled={rollUp.isPending}
              onClick={() => rollUp.mutate(booking.id)}
              title={`Roll ${t.unbilledCount} unbilled sessions into one draft invoice`}
            >
              {rollUp.isPending ? 'Creating…' : `Invoice ${formatCurrency(t.unbilledAmount)}`}
            </button>
          )}
        </div>
      </div>

      {booking.billingCycle && (
        <div className="px-5 pb-3 text-xs text-gray-400">Cycle: {booking.billingCycle}</div>
      )}

      {rollUp.isSuccess && (
        <div className="mx-5 mb-4 px-4 py-3 rounded-lg bg-green-500/10 text-green-700 dark:text-green-500 text-sm">
          Draft invoice <strong>{rollUp.data.invoice.name}</strong> created. It is a draft — nothing
          has been posted to the books until you submit it from the Invoices page.
        </div>
      )}
      {rollUp.isError && (
        <div className="mx-5 mb-4 px-4 py-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          {(rollUp.error as Error).message}
        </div>
      )}

      {expanded && (
        <TableShell
          head={
            <tr>
              <th className="px-2 first:pl-5 py-3 text-left">Date</th>
              <th className="px-2 py-3 text-left">In / out</th>
              <th className="px-2 py-3 text-right">Actual</th>
              <th className="px-2 py-3 text-right">Billed</th>
              <th className="px-2 py-3 text-right">Amount</th>
              <th className="px-2 py-3 text-left">Paid</th>
              <th className="px-2 last:pr-5 py-3 text-left">Invoice</th>
            </tr>
          }
        >
          {[...booking.sessions]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((s) => (
              <tr key={s.id}>
                <td className="px-2 first:pl-5 py-3">{formatDate(s.date)}</td>
                <td className="px-2 py-3 text-gray-500">
                  {s.timeIn} – {s.timeOut}
                </td>
                <td className="px-2 py-3 text-right text-gray-400">{s.hours}h</td>
                <td className="px-2 py-3 text-right font-medium">{s.roundedHours}h</td>
                <td className="px-2 py-3 text-right">{formatCurrency(s.amount)}</td>
                <td className="px-2 py-3">
                  {s.paid ? (
                    <span className="text-green-600 dark:text-green-500">
                      {s.paymentDate ? formatDate(s.paymentDate) : 'yes'}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-2 last:pr-5 py-3 text-xs">
                  {s.invoiceRef ? (
                    <span className="text-sky-600 dark:text-sky-400">{s.invoiceRef}</span>
                  ) : (
                    <span className="text-gray-400">not billed</span>
                  )}
                </td>
              </tr>
            ))}
        </TableShell>
      )}
    </div>
  );
}

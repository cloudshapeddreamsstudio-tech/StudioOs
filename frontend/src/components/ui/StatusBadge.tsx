/**
 * Status pill. The old app repeated this Tailwind class soup inline in every
 * table row template string, in every page, with the colour mapping duplicated
 * and occasionally inconsistent between pages.
 */

/**
 * One mapping for every status in the app.
 *
 * The old app defined this separately on each page, and they had drifted: the
 * projects table rendered Draft grey while the invoices table rendered it blue,
 * from two independent copies of `statusBadgeClass`. The invoice colours win
 * here, since that is where these statuses actually appear.
 */
const styles: Record<string, string> = {
  // Project statuses
  Open: 'bg-sky-500/20 text-sky-700 dark:text-sky-400',
  Completed: 'bg-green-500/20 text-green-700 dark:text-green-400',
  // Invoice statuses
  Paid: 'bg-green-500/20 text-green-700 dark:text-green-400',
  Overdue: 'bg-red-500/20 text-red-700 dark:text-red-400',
  Unpaid: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  Draft: 'bg-sky-500/20 text-sky-700 dark:text-sky-400',
  Return: 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
  'Partly Paid': 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  // Shared
  Cancelled: 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
};

const fallback = 'bg-gray-500/20 text-gray-600 dark:text-gray-400';

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-gray-400">—</span>;
  return (
    <div
      className={`inline-flex font-medium rounded-full text-center px-2.5 py-0.5 ${
        styles[status] ?? fallback
      }`}
    >
      {status}
    </div>
  );
}

import type { ReactNode } from 'react';

/** Page title plus optional controls, so every page's header is identical. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="sm:flex sm:justify-between sm:items-center mb-8">
      <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">{title}</h1>
      {children && <div className="flex gap-2 mt-4 sm:mt-0">{children}</div>}
    </div>
  );
}

const TONE_CLASS = {
  neutral: 'text-gray-800 dark:text-gray-100',
  good: 'text-green-600 dark:text-green-500',
  danger: 'text-red-500',
  warn: 'text-amber-500',
} as const;

/**
 * Grid widths as complete literal strings.
 *
 * Tailwind scans source for literal class names, so an interpolated
 * `xl:col-span-${span}` is never emitted and the tile silently falls back to
 * full width. These must stay spelled out.
 */
const SPAN_CLASS = {
  3: 'col-span-12 sm:col-span-6 xl:col-span-3',
  4: 'col-span-12 sm:col-span-6 xl:col-span-4',
  6: 'col-span-12 sm:col-span-6',
  12: 'col-span-12',
} as const;

/** A KPI tile. `span` is the 12-column grid width at xl. */
export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
  span = 3,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: keyof typeof TONE_CLASS;
  span?: keyof typeof SPAN_CLASS;
}) {
  return (
    <div
      className={`${SPAN_CLASS[span]} bg-white dark:bg-gray-800 shadow-sm rounded-xl
                  border border-gray-200 dark:border-gray-700/60 p-5`}
    >
      <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-2">
        {label}
      </div>
      <div className={`text-2xl font-bold ${TONE_CLASS[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

/** Card wrapper used by every table on every page. */
export function Card({ title, count, children }: { title?: string; count?: number; children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700/60">
      {title && (
        <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            {title}
            {count !== undefined && (
              <span className="text-gray-400 dark:text-gray-500 font-medium ml-2">{count}</span>
            )}
          </h2>
        </header>
      )}
      {children}
    </div>
  );
}

/** Standard table shell — horizontal scroll lives here, never on the page body. */
export function TableShell({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-auto w-full dark:text-gray-300">
        <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
          {head}
        </thead>
        <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">{children}</tbody>
      </table>
    </div>
  );
}

import type { ReactNode } from 'react';

/**
 * Shared loading / error / empty rendering for a table body.
 *
 * The old app hand-wrote a `renderError()` per page, each with its own colspan
 * and its own wording ("Couldn't load projects: … Is the bridge server
 * running?"). This keeps that message -- it was genuinely useful -- but in one
 * place, with the hint updated for the new architecture.
 */

interface QueryStateProps {
  isLoading: boolean;
  error: Error | null;
  isEmpty: boolean;
  colSpan: number;
  emptyMessage?: string;
  children: ReactNode;
}

export function QueryState({
  isLoading,
  error,
  isEmpty,
  colSpan,
  emptyMessage = 'Nothing to show.',
  children,
}: QueryStateProps) {
  if (isLoading) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-2 first:pl-5 last:pr-5 py-6 text-center text-gray-400">
          Loading…
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-2 first:pl-5 last:pr-5 py-6 text-center text-red-500">
          Couldn&apos;t load: {error.message}
          <br />
          <span className="text-xs text-gray-400">
            Is the API Worker running? Try <code>bun run dev</code> in <code>backend/</code>.
          </span>
        </td>
      </tr>
    );
  }

  if (isEmpty) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-2 first:pl-5 last:pr-5 py-6 text-center text-gray-400">
          {emptyMessage}
        </td>
      </tr>
    );
  }

  return <>{children}</>;
}

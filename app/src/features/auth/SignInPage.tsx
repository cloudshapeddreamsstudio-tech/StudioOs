import { useSearchParams } from 'react-router-dom';

/**
 * Sign in.
 *
 * A field and a button, not a button alone. Every studio runs its own ERPNext,
 * so there is no shared identity provider and StudioOS genuinely cannot know
 * where to send an anonymous visitor until it is told. Slack and Atlassian ask
 * the same question for the same reason.
 *
 * The form navigates rather than fetching: the browser itself has to travel to
 * the studio's site to authenticate and come back with a code.
 *
 * Remembering the studio per device, so this is typed once ever, is Phase 8.
 */
export function SignInPage() {
  const [params] = useSearchParams();
  const error = params.get('error');
  const hint = params.get('hint');

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg p-6 shadow-sm">
          <div className="text-xs font-bold tracking-[0.2em] text-violet-500 mb-3">STUDIOOS</div>

          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">Sign in</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            Use the ERPNext account you already have. No new password to remember.
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-900/20 px-3 py-2"
            >
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              {hint && <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">{hint}</p>}
            </div>
          )}

          <form method="get" action="/auth/start">
            <label
              htmlFor="site"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Your studio&apos;s ERPNext address
            </label>
            <input
              id="site"
              name="site"
              type="text"
              required
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="yourstudio.erpnext.com"
              defaultValue={params.get('site') ?? ''}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600
                         bg-white dark:bg-gray-900 px-3 py-2 text-sm font-mono
                         text-gray-800 dark:text-gray-100
                         focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            />

            <button
              type="submit"
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md
                         bg-violet-500 hover:bg-violet-600 px-4 py-2
                         text-sm font-semibold text-white
                         focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2
                         dark:focus:ring-offset-gray-800"
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6.5 2.5H3.2A1.2 1.2 0 0 0 2 3.7v8.6a1.2 1.2 0 0 0 1.2 1.2h3.3" />
                <path d="M10.5 11 14 8l-3.5-3" />
                <path d="M14 8H6" />
              </svg>
              Sign in with ERPNext
            </button>
          </form>

          <p className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700/60 text-xs text-gray-500 dark:text-gray-400">
            You&apos;ll sign in on your own ERPNext.{' '}
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              Your password is never sent to StudioOS.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

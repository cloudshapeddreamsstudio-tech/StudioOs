import { useEffect, useState } from 'react';
import { useSession, useSignOut } from '@/features/auth/api';

/**
 * Who is signed in, and which studio.
 *
 * The studio matters as much as the person: someone who works with two studios
 * has two separate identities, and acting on the wrong one is the kind of
 * mistake that only shows up after the damage. It is stated, not implied.
 */
function SignedInAs() {
  const { data: session } = useSession();
  const signOut = useSignOut();

  if (!session) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="hidden sm:block text-right leading-tight">
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{session.user}</div>
        <div className="text-xs font-mono text-gray-400">{session.host}</div>
      </div>
      <button
        onClick={() => void signOut()}
        className="text-xs font-medium text-gray-500 hover:text-gray-700
                   dark:text-gray-400 dark:hover:text-gray-200 underline underline-offset-2"
      >
        Sign out
      </button>
    </div>
  );
}

/**
 * Dark mode reads and writes the same `dark-mode` localStorage key the old
 * Mosaic app used, so the owner's existing preference survives the migration
 * rather than silently resetting to light on first load.
 */
function useDarkMode() {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('dark-mode') === 'true',
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    localStorage.setItem('dark-mode', String(dark));
  }, [dark]);

  return [dark, setDark] as const;
}

interface HeaderProps {
  onOpenSidebar: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const [dark, setDark] = useDarkMode();

  return (
    <header className="sticky top-0 before:absolute before:inset-0 before:backdrop-blur-md before:bg-white/90 dark:before:bg-gray-800/90 before:-z-10 z-30">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 border-b border-gray-200 dark:border-gray-700/60">
          <button
            className="text-gray-500 hover:text-gray-600 lg:hidden"
            onClick={onOpenSidebar}
            aria-label="Open sidebar"
          >
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <rect x="4" y="5" width="16" height="2" />
              <rect x="4" y="11" width="16" height="2" />
              <rect x="4" y="17" width="16" height="2" />
            </svg>
          </button>

          <div className="flex items-center space-x-3 ml-auto">
            <SignedInAs />
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700/60" aria-hidden="true" />
            <button
              className="w-8 h-8 flex items-center justify-center rounded-full
                         bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400
                         hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => setDark(!dark)}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                  <path d="M7 0h2v2H7V0Zm5.66 1.93 1.41 1.41-1.41 1.42-1.42-1.42 1.42-1.41ZM14 7h2v2h-2V7Zm-1.93 5.66-1.42-1.41 1.42-1.42 1.41 1.42-1.41 1.41ZM7 14h2v2H7v-2Zm-3.34-1.93 1.41-1.42 1.42 1.42-1.42 1.41-1.41-1.41ZM0 7h2v2H0V7Zm1.93-5.07 1.42 1.41L1.93 4.76.52 3.34l1.41-1.41ZM8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                  <path d="M6.2 1.1a7 7 0 1 0 8.7 8.7 6 6 0 0 1-8.7-8.7Z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

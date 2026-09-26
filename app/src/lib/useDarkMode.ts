import { useEffect, useState } from 'react';

/**
 * Dark mode reads and writes the same `dark-mode` localStorage key the old
 * Mosaic app used, so the owner's existing preference survives the migration
 * rather than silently resetting to light on first load.
 *
 * Extracted out of `components/layout/Header.tsx` so the public marketing
 * header (`features/marketing/HomePage.tsx`) can share the exact same toggle
 * instead of a second copy that could drift from it.
 */
export function useDarkMode() {
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

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'md-share-theme';

export function getStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'auto';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'auto';
}

export function setStoredTheme(mode: ThemeMode) {
  if (mode === 'auto') localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, mode);
  applyTheme(mode);
}

export function applyTheme(mode: ThemeMode) {
  const html = document.documentElement;
  if (mode === 'auto') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', mode);
  }
  // Update data-color-mode for github-markdown-css
  const resolved = resolveTheme(mode);
  html.setAttribute('data-color-mode', resolved);
  if (resolved === 'dark') {
    html.setAttribute('data-dark-theme', 'dark');
    html.removeAttribute('data-light-theme');
  } else {
    html.setAttribute('data-light-theme', 'light');
    html.removeAttribute('data-dark-theme');
  }
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') return mode;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function watchTheme(callback: (dark: boolean) => void) {
  const stored = getStoredTheme();
  applyTheme(stored);
  callback(resolveTheme(stored) === 'dark');

  const mql = matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', () => {
    const current = getStoredTheme();
    if (current === 'auto') {
      applyTheme('auto');
      callback(mql.matches);
    }
  });
}

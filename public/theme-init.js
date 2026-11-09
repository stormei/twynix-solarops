// Runs before styles load so a saved light preference does not flash dark.
try {
  const saved = localStorage.getItem('solarops.theme');
  const theme = saved === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
} catch {
  document.documentElement.dataset.theme = 'dark';
}

try { document.documentElement.lang = localStorage.getItem('solarops.language') === 'en' ? 'en' : 'nb'; } catch { document.documentElement.lang = 'nb'; }

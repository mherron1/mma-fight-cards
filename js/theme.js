export function getSavedTheme() {
  const savedTheme = localStorage.getItem('fight-cards-theme');
  return ['light', 'dark', 'greyscale'].includes(savedTheme) ? savedTheme : 'light';
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  root.dataset.appearance = theme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute('content', theme === 'dark' ? '#101116' : theme === 'greyscale' ? '#f4f4f4' : '#f4f4f5');
  }
}

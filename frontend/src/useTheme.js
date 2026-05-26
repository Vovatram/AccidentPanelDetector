import { useState, useEffect } from 'react';

function readCookie() {
  const m = document.cookie.match(/(?:^|;\s*)apd_theme=(dark|light)/);
  return m ? m[1] : null;
}

export default function useTheme() {
  const [theme, _setTheme] = useState(() => {
    const c = readCookie();
    if (c) return c;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const setTheme = t => {
    _setTheme(t);
    document.cookie = `apd_theme=${t};path=/;max-age=31536000`;
  };

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = e => { if (!readCookie()) _setTheme(e.matches ? 'dark' : 'light'); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return [theme, setTheme];
}

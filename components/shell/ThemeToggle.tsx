'use client';

import { useEffect, useState } from 'react';
import { Icon } from './icons';

/**
 * Botão só-ícone que alterna a classe `dark` na <html> + persiste em
 * localStorage. O tema inicial real vem do script anti-flash em
 * app/layout.tsx (roda antes do paint); este componente só espelha esse
 * estado depois do mount — por isso a placeholder vazia antes disso, pra
 * não divergir do HTML gerado no servidor (que não sabe o tema salvo).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setDark(next);
  }

  if (!mounted) {
    return <span className={className} aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      aria-label={dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      className={className}
    >
      {dark ? <Icon.Sun className="w-[18px] h-[18px]" /> : <Icon.Moon className="w-[18px] h-[18px]" />}
    </button>
  );
}

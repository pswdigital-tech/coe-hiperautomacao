'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  children: React.ReactNode;
};

/**
 * Wrapper de modal: overlay full-screen + painel centrado + close (ESC/click-outside/X).
 * Ao fechar chama router.back() — retorna pra rota anterior na lista.
 *
 * Usado pelo intercepting route `@modal/(.)opportunities/[id]/page.tsx`.
 */
export function ModalShell({ children }: Props) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  // ESC fecha
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        router.back();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router]);

  // Bloqueia scroll do body enquanto modal aberto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function onOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      router.back();
    }
  }

  function onClose() {
    router.back();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onOverlayClick}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 sm:p-4 overflow-y-auto"
    >
      <div
        ref={panelRef}
        className="relative sm:my-8 w-full max-w-3xl bg-wh sm:rounded-2xl shadow-2xl overflow-hidden min-h-screen sm:min-h-0"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white text-base font-bold flex items-center justify-center"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

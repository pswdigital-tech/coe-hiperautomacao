'use client';

import Link from 'next/link';

type Props = {
  opportunityId: string;
};

export function EditButton({ opportunityId }: Props) {
  return (
    <Link
      href={`/opportunities/${opportunityId}/edit`}
      title="Editar oportunidade"
      className="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/35 text-white text-[11px] font-bold border border-white/30 inline-flex items-center gap-1"
    >
      ✏️ Editar
    </Link>
  );
}

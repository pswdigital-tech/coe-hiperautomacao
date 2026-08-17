// =============================================================================
// priority-labels.ts — aparência ÚNICA das prioridades manuais (0049/0050)
// -----------------------------------------------------------------------------
// A tag da tarefa (`opportunity_tasks.priority`) e a da oportunidade
// (`opportunities.priority_tag`) são enums SEPARADOS no banco — dois domínios
// que hoje coincidem e podem divergir. Mas para quem olha a tela "Alta" é
// "Alta": mesmo vermelho, mesmo ícone, mesmo rótulo. Duas cópias dessa paleta
// divergiriam no primeiro ajuste de cor, então a APARÊNCIA mora aqui e os dois
// domínios a consomem (`task-labels.ts` reexporta com os nomes de tarefa).
//
// A ORDEM do array é semântica: `alta` primeiro é o que faz `PRIORITY_RANK`
// ordenar "mais prioritário primeiro" num sort crescente — e é a MESMA ordem
// de declaração dos enums no banco, então o `order by` do Postgres concorda
// com o `sort` do cliente sem ninguém traduzir nada.
// =============================================================================

/** Valores compartilhados pelos dois enums (`task_priority`, `manual_priority`). */
export type PriorityValue = 'alta' | 'media' | 'baixa';

export type PriorityMeta = {
  value: PriorityValue;
  label: string;
  icon: string;
  /** cor do texto do badge */
  color: string;
  /** fundo do badge (par legível com `color`) */
  bg: string;
};

export const PRIORITY_ORDER: PriorityValue[] = ['alta', 'media', 'baixa'];

export const PRIORITY_META: Record<PriorityValue, PriorityMeta> = {
  alta: { value: 'alta', label: 'Alta', icon: '🔴', color: '#dc2626', bg: '#fee2e2' },
  media: { value: 'media', label: 'Média', icon: '🟡', color: '#b45309', bg: '#fef3c7' },
  baixa: { value: 'baixa', label: 'Baixa', icon: '🟢', color: '#047857', bg: '#d1fae5' },
};

export const PRIORITY_OPTIONS: { value: PriorityValue; label: string; icon: string }[] =
  PRIORITY_ORDER.map((p) => ({
    value: p,
    label: PRIORITY_META[p].label,
    icon: PRIORITY_META[p].icon,
  }));

/** alta(0) < media(1) < baixa(2) — derivado de `PRIORITY_ORDER`, nunca à mão. */
export const PRIORITY_RANK: Record<PriorityValue, number> = Object.fromEntries(
  PRIORITY_ORDER.map((p, i) => [p, i])
) as Record<PriorityValue, number>;

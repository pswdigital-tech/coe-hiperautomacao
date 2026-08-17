import { fieldLabel } from '@/lib/audit/labels';

// =============================================================================
// validation-errors.ts — mensagem específica pt-BR a partir de um
// `ZodError.flatten()`, no lugar do "Dados inválidos." genérico.
// -----------------------------------------------------------------------------
// Toda action de mutação (createOpportunity/updateOpportunity, tasks, risks,
// notes, phases, documents) devolvia só "Dados inválidos." quando o Zod
// rejeitava o input — o `fieldErrors` ia junto na resposta, mas nem toda tela
// que chama a action exibe erro por campo (ex.: a aba Automação do modal de
// oportunidade, onde "Escopo do Projeto" é uma `DynamicList` sem exibição de
// erro própria). Resultado: colar um texto longo num item do escopo (Zod:
// "Item excede 200 caracteres") aparecia só como "Dados inválidos.", sem
// dizer qual campo nem por quê (2026-08-14).
//
// `fieldLabel()` (lib/audit/labels.ts) já mapeia as colunas pra pt-BR pro
// Histórico — reaproveitado aqui pro mesmo vocabulário.
// =============================================================================

type ZodFlatten = {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
};

/**
 * Mensagem única e específica a partir do resultado de `.flatten()`:
 * prioriza um erro de `.superRefine`/`.refine` no nível do objeto todo
 * (`formErrors`, ex.: "Responda todos os 8 critérios..."), senão nomeia o
 * PRIMEIRO campo com erro ("Escopo da automação: Item excede 200
 * caracteres."), sinalizando quando há mais de um campo com problema.
 */
export function describeValidationError(flat: ZodFlatten): string {
  if (flat.formErrors[0]) return flat.formErrors[0];

  const entries = Object.entries(flat.fieldErrors).filter(
    (e): e is [string, string[]] => !!e[1] && e[1].length > 0
  );
  if (entries.length === 0) return 'Dados inválidos.';

  const [field, messages] = entries[0];
  const rest = entries.length - 1;
  const suffix =
    rest > 0 ? ` (+${rest} outro${rest > 1 ? 's' : ''} campo${rest > 1 ? 's' : ''} com erro)` : '';
  return `${fieldLabel(field)}: ${messages[0]}${suffix}`;
}

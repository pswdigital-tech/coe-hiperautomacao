// =============================================================================
// database.types.ts — Types do schema Supabase (multi-tenant CoE)
// =============================================================================
// ⚠️  ARQUIVO MANTIDO À MÃO. O projeto ainda não tem SUPABASE_ACCESS_TOKEN com
//     privilégio no projeto `vxgthycrjetniejsjmee`, então `npm run gen:types`
//     (e o MCP do Supabase, que aponta para OUTRO projeto) não funcionam.
//
//     Estado atual: schema vivo PÓS-migration 0011 (Phase 9), VERIFICADO contra
//     o catálogo do Postgres por introspecção (information_schema/pg_catalog) em
//     2026-06-04 (Phase 10 / Plan 10-01, D-04). Reflete:
//       - opportunities: tempo→frequency_bucket; + fte_horas, fonte, tipo_processo,
//         beneficio_qualitativo, criterios, beneficios, fte, rpa_score (GENERATED)
//       - opportunity_score(): 5 fatores (p_fte fte_bucket adicionado)
//       - view opportunities_with_score (herda as colunas novas + score/priority_level)
//       - tabela opportunity_risks (priority risk_priority, set por trigger)
//
//     Quando houver token com privilégio: rodar `npm run gen:types` deve produzir
//     um superset equivalente deste arquivo (verificação, não mudança funcional).
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------
export type OpportunitySource = 'persona' | 'formulario';

export type OpportunityStatus =
  | 'novo'
  | 'em_analise'
  | 'planejamento'
  | 'backlog'
  | 'desenvolvimento'
  | 'homologacao'
  | 'producao'
  | 'concluido'
  // v0.3 (0016) — fora do fluxo linear datado (sem phase_key correspondente):
  | 'gestao'
  | 'manutencao'
  | 'descontinuado';

export type AutomationTool = 'rpa' | 'n8n' | 'ambos';
export type EffortLevel = 'baixo' | 'medio' | 'alto';
export type ComplexityLevel = 'baixo' | 'medio' | 'alto';
/** @deprecated v0.1 — `tempo` migrou para FrequencyBucket em 0011. Tipo mantido
 * porque o enum `time_bucket` ainda existe no banco e é usado pelo contrato legado
 * da IA (lib/ai/schema.ts) até REALIGN-7.6. */
export type TimeBucket = 'pequeno' | 'medio' | 'grande';

/** v0.2 (0011): `tempo` como frequência. */
export type FrequencyBucket = 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'anual';
/** v0.2 (0011): 5º fator de score (bucket de FTE). */
export type FteBucket = 'muito_baixo' | 'baixo' | 'medio' | 'alto' | 'muito_alto';

// opportunity_risks (0011)
export type RiskType = 'impedimento' | 'risco' | 'oportunidade';
export type RiskImpact = 'alto' | 'significativo' | 'moderado' | 'baixo';
export type RiskProbability = 'provavel' | 'possivel' | 'improvavel' | 'remota';
export type RiskStatus = 'novo' | 'gerenciado' | 'mitigado' | 'ocorrido';
export type RiskPriority = 'critica' | 'alta' | 'media' | 'baixa';

// opportunity_tasks (0037, Phase 16; 5º valor em 0060) — as colunas do Kanban
// de tarefas (D-03): Backlog → Em Andamento → Homologação → Finalizado →
// Bloqueio. A ordem das COLUNAS é a de `TASK_STATUS_ORDER`
// (lib/opportunities/task-labels.ts), não a desta união nem a do enum no banco.
export type TaskStatus =
  | 'backlog'
  | 'em_andamento'
  | 'homologacao'
  | 'finalizado'
  | 'bloqueio';

// opportunity_tasks (0049) — tag de prioridade de tarefa/subtarefa. MESMO
// vocabulário de `priority_level` das oportunidades (alta/media/baixa), não o
// de 4 valores de `opportunity_risks.priority`. Ao contrário daquela, esta é
// INPUT MANUAL — não é GENERATED nem derivada de matriz nenhuma.
export type TaskPriority = 'alta' | 'media' | 'baixa';

// opportunities (0050) — tag de prioridade MANUAL da oportunidade. Mesmos
// valores de `TaskPriority`, tipo SEPARADO de propósito: são dois domínios
// (tarefa e oportunidade) que hoje coincidem e podem divergir amanhã. NÃO
// substitui `priority_level`, que continua DERIVADO do score — as duas
// convivem, com nomes distintos na tela.
export type ManualPriority = 'alta' | 'media' | 'baixa';

export type PhaseKey =
  | 'em_analise'
  | 'planejamento'
  | 'backlog'
  | 'desenvolvimento'
  | 'homologacao'
  | 'producao'
  | 'concluido';

// v0.3-admin (0020) — super-admin de plataforma, cross-tenant, gated via RLS
// aditiva (0021). Nunca concedido via convite self-service (0022, só SQL).
// psw_staff (0039) — pessoa da PSW multi-tenant POR ATRIBUIÇÃO: `tenant_id`
// do profile é sempre o da PSW (nunca o do cliente); o acesso cross-tenant
// vem de `opportunity_assignees` (0032), não de `profiles`. Não confundir com
// `platform_admin` (vê tudo) — o `psw_staff` só vê o que lhe foi atribuído.
export type TenantRole =
  | 'member'
  | 'tenant_admin'
  | 'viewer'
  | 'platform_admin'
  | 'psw_staff';

// audit_log (0038) — o que aconteceu com a linha. Espelha o enum `audit_action`
// e, por construção da trigger, TG_OP em minúsculas.
export type AuditAction = 'insert' | 'update' | 'delete';

// v0.4 (0031) — CARGO é rótulo organizacional, NÃO permissão. A RLS só olha
// `role`. Fonte da lista: lib/security/cargo.ts (espelha o CHECK da 0031).
export type Cargo =
  | 'tech_lead'
  | 'coe_manager'
  | 'dev'
  | 'arquiteto'
  | 'devops'
  | 'engenheiro_dados'
  | 'pm'
  | 'scrum_master'
  | 'outro';

// v0.3 (0017/0018)
export type CriticidadeLevel = 'baixa' | 'media' | 'alta' | 'critica';
export type DocumentKind = 'link' | 'arquivo';

export type OpportunityRequestType =
  | 'nova_oportunidade'
  | 'melhoria_automacao'
  | 'duvidas_terceiros'
  | 'incidente'
  | 'treinamento';

export type AiEnrichmentStatus = 'pending' | 'enriched' | 'failed';

// -----------------------------------------------------------------------------
// JSONB schemas (descritivos; o banco aceita qualquer shape)
// -----------------------------------------------------------------------------
export type PersonaExtras = {
  cargo?: string;
  tempo_funcao?: string;
  local?: string;
  papel?: string;
  sistemas?: string;
  objetivos?: string;
  metricas?: string;
  desafios?: string;
  dados?: string;
  automacao_atual?: string;
  expectativas?: string;
  priorizacao_desc?: string;
  observacoes?: string;
  processos_detalhados?: string[];
};

/** @deprecated v0.1 — domínio uppercase do `formulario_extras.criterios` legado.
 * Os novos `opportunities.criterios` (0011) usam minúsculo sim/nao/parcial. */
export type CriterioValor = 'SIM' | 'NAO' | 'PARCIAL';

export type FormularioExtras = {
  tipo_processo?: string;
  sistemas?: string;
  cargo_solicitante?: string;
  // Discovery v2 — perguntas de levantamento (ver formularioExtrasSchema).
  gatilho?: string;
  formato_entrada?: string;
  descricao?: string;
  dor?: string;
  dados_sensiveis?: string;
  criterios?: {
    regras_claras?: CriterioValor;
    totalmente_manual?: CriterioValor;
    processo_uniforme?: CriterioValor;
    digitacao_manual?: CriterioValor;
    causa_reclamacoes?: CriterioValor;
    padronizacao_docs?: CriterioValor;
    validacao_dados?: CriterioValor;
    schedulable?: CriterioValor;
    tem_documentacao?: CriterioValor;
    decisao_humana?: CriterioValor;
  };
  beneficios?: {
    reducao_tempo?: number;
    eliminacao_erros?: number;
    produtividade?: number;
    qualidade_dados?: number;
    reducao_custos?: number;
    reducao_retrabalho?: number;
    compliance?: number;
    objetivos_estrategicos?: number;
  };
};

export type Prioridade = {
  esforco: EffortLevel | null;
  complexidade: ComplexityLevel | null;
  tempo: FrequencyBucket | null;
  objetivo: number | null;
  fte: FteBucket | null;
};

// -----------------------------------------------------------------------------
// Database (formato compatível com @supabase/ssr generic)
// -----------------------------------------------------------------------------
export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: 'active' | 'suspended';
          // v0.4 (0033) — identidade visual por empresa (/configuracoes).
          // brand_color: hex '#rrggbb' (CHECK); logo_path: path no bucket
          // público 'tenant-branding'. null nos dois = padrão PSW.
          brand_color: string | null;
          logo_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          status?: 'active' | 'suspended';
          brand_color?: string | null;
          logo_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          name: string;
          slug: string;
          status: 'active' | 'suspended';
          brand_color: string | null;
          logo_path: string | null;
          updated_at: string;
        }>;
        Relationships: [];
      };

      profiles: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          full_name: string | null;
          role: TenantRole;
          cargo: Cargo | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          tenant_id: string;
          email: string;
          full_name?: string | null;
          role?: TenantRole;
          cargo?: Cargo | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          tenant_id: string;
          email: string;
          full_name: string | null;
          role: TenantRole;
          cargo: Cargo | null;
          updated_at: string;
        }>;
        Relationships: [
          {
            foreignKeyName: 'profiles_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };

      // v0.3-admin (0022) — allowlist de signup self-service; só platform_admin
      // gerencia (RLS). role nunca é 'platform_admin' aqui (CHECK no DB); 'viewer'
      // passou a ser aceito em 0028. 'psw_staff' aceito desde a 0041 (Phase 17,
      // D-17) — só o platform_admin consegue inserir esse valor (policy
      // invited_emails_insert_tenant_admin barra explicitamente 'psw_staff').
      invited_emails: {
        Row: {
          id: string;
          email: string;
          tenant_id: string;
          role: 'member' | 'tenant_admin' | 'viewer' | 'psw_staff';
          cargo: Cargo | null;
          invited_by: string | null;
          created_at: string;
          used_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          tenant_id: string;
          role?: 'member' | 'tenant_admin' | 'viewer' | 'psw_staff';
          cargo?: Cargo | null;
          invited_by?: string | null;
          created_at?: string;
          used_at?: string | null;
        };
        Update: Partial<{
          email: string;
          tenant_id: string;
          role: 'member' | 'tenant_admin' | 'viewer' | 'psw_staff';
          cargo: Cargo | null;
          invited_by: string | null;
          used_at: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: 'invited_emails_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invited_emails_invited_by_fkey';
            columns: ['invited_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      // Phase 18 (0045, a criar em 18-02) — concessão de admin cross-tenant a
      // `psw_staff`: N:N entre profile e tenant, só inserível/removível por
      // `platform_admin` (RLS da 0045). Hand-maintained — ARQUIVO MANTIDO À
      // MÃO (ver header do arquivo, `npm run gen:types` bloqueado) — este
      // bloco precisa casar com o DDL da 0045 quando ela existir.
      psw_tenant_admins: {
        Row: {
          id: string;
          profile_id: string;
          tenant_id: string;
          granted_at: string;
          granted_by: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          tenant_id: string;
          granted_at?: string;
          granted_by?: string | null;
        };
        Update: Partial<{
          profile_id: string;
          tenant_id: string;
          granted_by: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: 'psw_tenant_admins_profile_id_fkey';
            columns: ['profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'psw_tenant_admins_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'psw_tenant_admins_granted_by_fkey';
            columns: ['granted_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      // v0.4 (0032) — atribuição de pessoas a oportunidades (N:N). Escrita só
      // por tenant_admin (do próprio tenant) ou platform_admin — ver RLS 0032.
      opportunity_assignees: {
        Row: {
          id: string;
          opportunity_id: string;
          profile_id: string;
          tenant_id: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          profile_id: string;
          tenant_id: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          opportunity_id: string;
          profile_id: string;
          tenant_id: string;
          created_by: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: 'opportunity_assignees_opportunity_id_fkey';
            columns: ['opportunity_id'];
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_assignees_profile_id_fkey';
            columns: ['profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_assignees_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };

      // 0053 — recorte de visibilidade por pessoa. `profile_visibility` é o
      // INTERRUPTOR ('all' | 'restricted'; ausência de linha ≡ 'all') e
      // `profile_opportunity_access` é a LISTA, só consultada quando o
      // interruptor está em 'restricted'. `tenant_id` é derivado por trigger —
      // o valor enviado no insert é ignorado, então mandá-lo é só cortesia.
      profile_visibility: {
        Row: {
          profile_id: string;
          tenant_id: string;
          scope: 'all' | 'restricted';
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          profile_id: string;
          tenant_id: string;
          scope?: 'all' | 'restricted';
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<{
          scope: 'all' | 'restricted';
          updated_by: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: 'profile_visibility_profile_id_fkey';
            columns: ['profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_visibility_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };

      // 0054 — o mesmo recorte, pendurado no CONVITE, para valer já no primeiro
      // login. Uma tabela só (com `uuid[]`) e não duas como acima porque esta
      // lista não é lida pela RLS: é escrita por um admin e lida UMA vez, por
      // `handle_new_user()`, no signup. `tenant_id` e `updated_at` são
      // derivados por trigger.
      invite_visibility: {
        Row: {
          invited_email_id: string;
          tenant_id: string;
          scope: 'all' | 'restricted';
          opportunity_ids: string[];
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          invited_email_id: string;
          tenant_id: string;
          scope?: 'all' | 'restricted';
          opportunity_ids?: string[];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<{
          scope: 'all' | 'restricted';
          opportunity_ids: string[];
          updated_by: string | null;
        }>;
        Relationships: [
          {
            foreignKeyName: 'invite_visibility_invited_email_id_fkey';
            columns: ['invited_email_id'];
            referencedRelation: 'invited_emails';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invite_visibility_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };

      profile_opportunity_access: {
        Row: {
          id: string;
          profile_id: string;
          opportunity_id: string;
          tenant_id: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          opportunity_id: string;
          tenant_id: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<{
          profile_id: string;
          opportunity_id: string;
          tenant_id: string;
        }>;
        Relationships: [
          {
            foreignKeyName: 'profile_opportunity_access_profile_id_fkey';
            columns: ['profile_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_opportunity_access_opportunity_id_fkey';
            columns: ['opportunity_id'];
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_opportunity_access_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };

      /**
       * 0055 — catálogo de ferramentas de automação do seletor "Ferramenta
       * Sugerida". `tenant_id` NULL = catálogo global da plataforma (seed:
       * rpa, n8n, databricks, sap, uipath); não-nulo = registrada por um
       * usuário e visível SÓ para aquele tenant. É a única tabela de domínio
       * com `tenant_id` nullable — ver o header da migration.
       */
      automation_tools: {
        Row: {
          id: string;
          tenant_id: string | null;
          slug: string;
          nome: string;
          icone: string | null;
          ordem: number;
          ativo: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          // A app NUNCA insere global (a policy de INSERT exige não-nulo) —
          // o catálogo global só cresce por migration.
          tenant_id: string;
          slug: string;
          nome: string;
          icone?: string | null;
          ordem?: number;
          ativo?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          nome: string;
          icone: string | null;
          ordem: number;
          ativo: boolean;
          updated_at: string;
        }>;
        Relationships: [
          {
            foreignKeyName: 'automation_tools_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'automation_tools_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      opportunities: {
        Row: {
          id: string;
          tenant_id: string;
          seq_id: number;
          source: OpportunitySource;
          request_type: OpportunityRequestType;
          /** 0035 — automação a que esta solicitação se refere (melhoria/incidente). */
          parent_opportunity_id: string | null;
          solicitante: string;
          email: string | null;
          area: string;
          subarea: string | null;
          processo: string;
          frequencia: string | null;
          volume_medio: string | null;
          tempo_execucao: string | null;
          num_pessoas: string | null;
          /** 0055 — DERIVADA de `ferramentas` pelo trigger
           *  `sync_opportunity_ferramentas()`. Mantida só para os consumidores
           *  antigos (mix do relatório) e para os caminhos de escrita que ainda
           *  gravam um valor único (RPCs pública/staff, enriquecimento por IA).
           *  Para ler/escrever a seleção do usuário use `ferramentas`. */
          ferramenta: AutomationTool | null;
          /** 0055 — slugs de `automation_tools`, FONTE DA VERDADE da seleção
           *  (multi-escolha). Normalizado pelo trigger: minúsculo, sem repetido,
           *  ordenado. not null default '{}'. */
          ferramentas: string[];
          escopo_automacao: string[];
          beneficios_esperados: string[];
          esforco: EffortLevel | null;
          complexidade: ComplexityLevel | null;
          tempo: FrequencyBucket | null;
          objetivo: number | null;
          status: OpportunityStatus;
          responsavel: string | null;
          notas: string | null;
          observacao: string | null;
          risco: string | null;
          visivel: boolean; // 0030 — not null default true, alterada só via SQL
          /** 0049 — ordem manual de prioridade, ÚNICA POR TENANT. Input humano
           *  (não é valor derivado: `score`/`priority_level` continuam
           *  calculados e não-persistidos). NULL = nunca posicionada; ordena
           *  por último e some no primeiro reorder do tenant. Escrita SÓ pela
           *  função `set_opportunity_priority_order` — nunca por update solto. */
          priority_order: number | null;
          /** 0050 — tag de prioridade MANUAL. NULL = ninguém classificou ainda
           *  (a UI mostra "—"); sem default, ao contrário de
           *  `opportunity_tasks.priority`. Independente de `priority_level`,
           *  que continua derivado do score. */
          priority_tag: ManualPriority | null;
          // v0.2 (0011)
          fte_horas: number | null;
          fonte: string | null;
          tipo_processo: string[];
          beneficio_qualitativo: string | null;
          criterios: Json | null;
          beneficios: Json | null;
          fte: FteBucket | null;
          rpa_score: number | null; // GENERATED ALWAYS — leitura apenas
          ai_enrichment_status: AiEnrichmentStatus;
          ai_enrichment_error: string | null;
          ai_enriched_at: string | null;
          persona_extras: PersonaExtras | null;
          formulario_extras: FormularioExtras | null;
          // v0.3 (0017) — campos operacionais + criticidade + datas COE
          criticidade: CriticidadeLevel | null;
          azure_boards_codigo: string | null;
          linguagem: string | null;
          execucao: string | null;
          usuarios_servico: string | null;
          execucoes_mes: number | null;
          data_conclusao: string | null;
          data_abertura_coe: string | null;
          data_fechamento_coe: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          seq_id?: number;
          source: OpportunitySource;
          request_type?: OpportunityRequestType;
          parent_opportunity_id?: string | null;
          solicitante: string;
          email?: string | null;
          area: string;
          subarea?: string | null;
          processo: string;
          frequencia?: string | null;
          volume_medio?: string | null;
          tempo_execucao?: string | null;
          num_pessoas?: string | null;
          ferramenta?: AutomationTool | null; // 0055 — derivada, ver nota no Row
          ferramentas?: string[]; // 0055 — ver nota no Row
          escopo_automacao?: string[];
          beneficios_esperados?: string[];
          esforco?: EffortLevel | null;
          complexidade?: ComplexityLevel | null;
          tempo?: FrequencyBucket | null;
          objetivo?: number | null;
          status?: OpportunityStatus;
          responsavel?: string | null;
          notas?: string | null;
          observacao?: string | null;
          risco?: string | null;
          visivel?: boolean;
          priority_order?: number | null; // 0049 — ver nota no Row
          priority_tag?: ManualPriority | null; // 0050 — ver nota no Row
          // v0.2 (0011) — rpa_score é GENERATED (omitido do Insert)
          fte_horas?: number | null;
          fonte?: string | null;
          tipo_processo?: string[];
          beneficio_qualitativo?: string | null;
          criterios?: Json | null;
          beneficios?: Json | null;
          fte?: FteBucket | null;
          ai_enrichment_status?: AiEnrichmentStatus;
          ai_enrichment_error?: string | null;
          ai_enriched_at?: string | null;
          persona_extras?: PersonaExtras | null;
          formulario_extras?: FormularioExtras | null;
          // v0.3 (0017)
          criticidade?: CriticidadeLevel | null;
          azure_boards_codigo?: string | null;
          linguagem?: string | null;
          execucao?: string | null;
          usuarios_servico?: string | null;
          execucoes_mes?: number | null;
          data_conclusao?: string | null;
          data_abertura_coe?: string | null;
          data_fechamento_coe?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['opportunities']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'opportunities_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunities_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      opportunity_phases: {
        Row: {
          id: string;
          opportunity_id: string;
          tenant_id: string;
          phase_key: PhaseKey;
          started_at: string | null;
          finished_at: string | null;
          planned_start_at: string | null;
          planned_end_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          tenant_id: string;
          phase_key: PhaseKey;
          started_at?: string | null;
          finished_at?: string | null;
          planned_start_at?: string | null;
          planned_end_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          phase_key: PhaseKey;
          started_at: string | null;
          finished_at: string | null;
          planned_start_at: string | null;
          planned_end_at: string | null;
          updated_at: string;
        }>;
        Relationships: [
          {
            foreignKeyName: 'opportunity_phases_opportunity_id_fkey';
            columns: ['opportunity_id'];
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_phases_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };

      opportunity_risks: {
        Row: {
          id: string;
          opportunity_id: string;
          tenant_id: string;
          descricao: string;
          tipo: RiskType;
          responsavel: string | null;
          impacto: RiskImpact;
          probabilidade: RiskProbability;
          status: RiskStatus;
          resposta: string | null;
          descricao_impacto: string | null;
          priority: RiskPriority | null; // set por trigger set_risk_priority() — nunca input manual
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          tenant_id: string;
          descricao: string;
          tipo: RiskType;
          responsavel?: string | null;
          impacto: RiskImpact;
          probabilidade: RiskProbability;
          status?: RiskStatus;
          resposta?: string | null;
          descricao_impacto?: string | null;
          priority?: RiskPriority | null; // sobrescrito pelo trigger; não enviar
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['opportunity_risks']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'opportunity_risks_opportunity_id_fkey';
            columns: ['opportunity_id'];
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_risks_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_risks_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      // v0.4/Phase 16 (0037) — tarefas e subtarefas de execução de uma
      // oportunidade. Hand-maintained (gen:types bloqueado — ver header do
      // arquivo). Hierarquia de 2 níveis (parent_task_id self-FK, garantida
      // no banco por trigger, D-01). Nenhuma coluna de span/percentual de
      // conclusão agregado existe aqui — o rollup é SEMPRE calculado em
      // runtime (lib/opportunities/task-rollup.ts), nunca persistido (D-02).
      opportunity_tasks: {
        Row: {
          id: string;
          opportunity_id: string;
          tenant_id: string;
          parent_task_id: string | null;
          title: string;
          description: string | null;
          status: TaskStatus;
          /** 0049 — tag de prioridade, input manual. not null default 'media'. */
          priority: TaskPriority;
          /** 0049 — ordem manual dentro da oportunidade. NULL = nunca
           *  posicionada. Escrita SÓ por `set_task_priority_order`. */
          priority_order: number | null;
          start_date: string | null;
          due_date: string | null;
          assignee_id: string | null;
          blocked_reason: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          tenant_id: string;
          parent_task_id?: string | null;
          title: string;
          description?: string | null;
          status?: TaskStatus;
          priority?: TaskPriority; // 0049
          priority_order?: number | null; // 0049
          start_date?: string | null;
          due_date?: string | null;
          assignee_id?: string | null;
          blocked_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['opportunity_tasks']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'opportunity_tasks_opportunity_id_fkey';
            columns: ['opportunity_id'];
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_tasks_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          // self-FK — sem precedente no bloco de opportunity_risks (riscos
          // não têm hierarquia). parent_task_id aponta para a própria tabela.
          {
            foreignKeyName: 'opportunity_tasks_parent_task_id_fkey';
            columns: ['parent_task_id'];
            referencedRelation: 'opportunity_tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_tasks_assignee_id_fkey';
            columns: ['assignee_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_tasks_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };

      // v0.3 (0018)
      opportunity_documents: {
        Row: {
          id: string;
          opportunity_id: string;
          tenant_id: string;
          kind: DocumentKind;
          nome: string;
          url: string | null;
          storage_path: string | null;
          tipo: string | null;
          size_bytes: number | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          tenant_id: string;
          kind: DocumentKind;
          nome: string;
          url?: string | null;
          storage_path?: string | null;
          tipo?: string | null;
          size_bytes?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['opportunity_documents']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'opportunity_documents_opportunity_id_fkey';
            columns: ['opportunity_id'];
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_documents_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };

      opportunity_notes: {
        Row: {
          id: string;
          opportunity_id: string;
          tenant_id: string;
          texto: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          tenant_id: string;
          texto: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['opportunity_notes']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'opportunity_notes_opportunity_id_fkey';
            columns: ['opportunity_id'];
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_notes_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };

      // Append-only (auditoria) — sem policy/grant de update/delete no DB
      // (0018). O tipo Update existe só por convenção estrutural; a app NUNCA
      // chama .update()/.delete() nesta tabela.
      opportunity_history: {
        Row: {
          id: string;
          opportunity_id: string;
          tenant_id: string;
          resumo: string;
          comentario: string | null;
          changed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          tenant_id: string;
          resumo: string;
          comentario?: string | null;
          changed_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['opportunity_history']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'opportunity_history_opportunity_id_fkey';
            columns: ['opportunity_id'];
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_history_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          }
        ];
      };

      // 0038 — rastreabilidade universal. Escrita EXCLUSIVAMENTE pela trigger
      // `audit_trigger()` (SECURITY DEFINER); `authenticated` só tem grant de
      // select. Não existe Insert/Update válido a partir da app — os tipos
      // abaixo são `never` para que qualquer `.insert()`/`.update()` nesta
      // tabela quebre em tempo de compilação, e não em runtime com 42501.
      audit_log: {
        Row: {
          id: number;
          tenant_id: string | null;
          table_name: string;
          record_id: string | null;
          action: AuditAction;
          actor_id: string | null;
          actor_email: string | null;
          actor_role: string | null;
          /** `{ campo: { de, para } }` — presente só quando action='update'. */
          changes: Record<string, { de: Json; para: Json }> | null;
          old_data: Json | null;
          new_data: Json | null;
          contexto: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'audit_log_tenant_id_fkey';
            columns: ['tenant_id'];
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_log_actor_id_fkey';
            columns: ['actor_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
    };

    Views: {
      opportunities_with_score: {
        Row: Database['public']['Tables']['opportunities']['Row'] & {
          score: number;
          priority_level: 'alta' | 'media' | 'baixa';
        };
        Relationships: [];
      };
    };

    Functions: {
      opportunity_score: {
        Args: {
          p_esforco: EffortLevel;
          p_complexidade: ComplexityLevel;
          p_tempo: FrequencyBucket;
          p_objetivo: number;
          p_fte: FteBucket;
        };
        Returns: number;
      };
      current_tenant_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      // 0049 — reordenação manual. `security invoker`: toda leitura e toda
      // escrita passa pela RLS do chamador (um `viewer` não escreve; um id de
      // outro tenant não é encontrado). Recebem o array ORDENADO dos ids
      // VISÍVEIS e renumeram o escopo inteiro; devolvem quantas linhas mudaram.
      set_opportunity_priority_order: {
        Args: { p_ids: string[] };
        Returns: number;
      };
      set_task_priority_order: {
        Args: { p_opportunity_id: string; p_ids: string[] };
        Returns: number;
      };
      fetch_public_tenant: {
        Args: { p_slug: string };
        Returns: {
          id: string;
          name: string;
          slug: string;
          // 0034 — branding no formulário público.
          brand_color: string | null;
          logo_path: string | null;
        }[];
      };
      // 0035 — automações existentes oferecidas no seletor de "projeto
      // associado" do formulário público (Melhoria / Incidente).
      fetch_public_opportunities: {
        Args: { p_slug: string };
        Returns: {
          id: string;
          seq_id: number;
          processo: string | null;
          area: string | null;
        }[];
      };
      create_public_opportunity: {
        // Overload canônico (21 params, de 0009 + 0012). O overload antigo de 18
        // params foi removido em 0012 (era ambíguo e carregava o mapeamento antigo).
        Args: {
          p_tenant_slug: string;
          p_solicitante: string;
          p_email: string;
          p_area: string;
          p_subarea: string;
          p_processo: string;
          p_frequencia: string;
          p_volume_medio: string;
          p_tempo_execucao: string;
          p_num_pessoas: string;
          p_ferramenta: string;
          p_escopo_automacao: string[];
          p_beneficios_esperados: string[];
          p_esforco: string;
          p_complexidade: string;
          p_tempo: string;
          p_objetivo: number;
          p_formulario_extras: Json;
          p_request_type: string;
          p_observacao: string | null;
          p_risco: string | null;
        };
        Returns: string;
      };
      // 0051 — registro de oportunidade EM NOME de uma empresa cliente
      // (staff PSW / super-admin). `staff_writable_tenant_ids` é a fonte única
      // do "onde posso registrar": alimenta o seletor de empresa da tela E a
      // autorização dentro de `create_staff_opportunity`.
      staff_writable_tenant_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      create_staff_opportunity: {
        // Payload jsonb (e não N params posicionais) — ver cabeçalho da 0051:
        // o chamador é sempre nosso código autenticado, já validado por zod,
        // então o schema evolui sem migration de assinatura.
        Args: { p_tenant_id: string; p_payload: Json };
        Returns: string;
      };
      // 0059 — importação em massa. `import_writable_tenant_ids` é a fonte
      // única do "onde posso importar" (alimenta o seletor da tela E a
      // autorização dentro de `import_opportunities`). Conjunto MENOR que o de
      // `staff_writable_tenant_ids`: aqui o `psw_staff` precisa de concessão de
      // ADMIN da empresa (0045), não basta ter oportunidade atribuída.
      import_writable_tenant_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      import_opportunities: {
        // p_rows: array de objetos (uma oportunidade por posição, com a chave
        // extra `linha` = a linha do arquivo, para a UI apontar o erro).
        // p_assignee_ids: profiles atribuídos a TODAS as linhas criadas.
        Args: { p_tenant_id: string; p_rows: Json; p_assignee_ids?: string[] };
        // { inseridas, ids[], atribuicoes, puladas[{linha,processo,seq_id}] }
        Returns: Json;
      };
      // 0038 — trilha de auditoria de UMA oportunidade (ela + filhos), com
      // gate de tenant explícito dentro da função. É por aqui que a aba
      // "Histórico" lê, já que o select direto em `audit_log` é admin-only.
      opportunity_audit_trail: {
        Args: { p_opportunity_id: string };
        Returns: {
          id: number;
          table_name: string;
          record_id: string | null;
          action: AuditAction;
          actor_email: string | null;
          changes: Record<string, { de: Json; para: Json }> | null;
          old_data: Json | null;
          new_data: Json | null;
          contexto: string | null;
          created_at: string;
        }[];
      };
      // Phase 18 (0045) — fonte única do predicado "é admin deste tenant"
      // (D-I/D-O): true para tenant_admin do próprio tenant OU psw_staff com
      // concessão em `psw_tenant_admins`. Espelhada em TypeScript por
      // `isTenantAdminOf()` (lib/security/role.ts, Plan 18-06) — os dois
      // precisam concordar (tests/schema/tenant-admin-parity.test.ts).
      is_tenant_admin_of: {
        Args: { t: string };
        Returns: boolean;
      };
    };

    Enums: {
      opportunity_source: OpportunitySource;
      opportunity_status: OpportunityStatus;
      opportunity_request_type: OpportunityRequestType;
      automation_tool: AutomationTool;
      effort_level: EffortLevel;
      complexity_level: ComplexityLevel;
      time_bucket: TimeBucket;
      frequency_bucket: FrequencyBucket;
      fte_bucket: FteBucket;
      risk_type: RiskType;
      risk_impact: RiskImpact;
      risk_probability: RiskProbability;
      risk_status: RiskStatus;
      risk_priority: RiskPriority;
      task_status: TaskStatus;
      task_priority: TaskPriority; // 0049
      manual_priority: ManualPriority; // 0050
      ai_enrichment_status: AiEnrichmentStatus;
      phase_key: PhaseKey;
      tenant_role: TenantRole;
      criticidade_level: CriticidadeLevel;
      document_kind: DocumentKind;
      audit_action: AuditAction;
    };

    CompositeTypes: Record<string, never>;
  };
};

// CASL isomórfico (servidor + UI) — segunda camada de autorização independente da RLS do banco
// (docs/adr/0008). Papéis da seção 7.1 do prompt único. Esta é a base estrutural da Fase 0;
// a matriz completa [persona × rota × ação] (seção 7.3) é expandida conforme cada rota nasce,
// e vira o teste `pnpm test:auth` que quebra o build em qualquer divergência.
import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";

export type Role =
  | "titan.owner"
  | "titan.finance"
  | "titan.revenue"
  | "titan.operations"
  | "titan.support"
  | "titan.field"
  | "titan.auditor"
  | "titan.agent"
  | "owner" // proprietário do imóvel (Owner Portal)
  | "vendor" // prestador (Vendor Portal)
  | "guest"; // hóspede

export type Action = "read" | "create" | "update" | "delete" | "approve" | "propose";

export type Subject =
  | "reservation"
  | "rate"
  | "ledger"
  | "fiscal_document"
  | "payout_batch"
  | "evidence"
  | "user_role"
  | "bank_account"
  | "approval_request"
  // Fase 5, Passo 4a (docs/fase-atual.md): contas a pagar (apps/console/app/(staff)/financeiro) —
  // subject próprio em vez de reusar "ledger" porque a decisão aqui é sobre a OBRIGAÇÃO perante o
  // fornecedor (criar/pagar uma linha de accounts_payable), não sobre o lançamento contábil em si
  // (que continua sendo postado como "ledger" pela mesma Server Action, sem checagem CASL
  // separada — mesmo espírito de "approve"/"payout_batch" já existente abaixo).
  | "accounts_payable"
  // Fase 3, Passo 4d (docs/fase-atual.md): cockpit de distribuição (apps/console/app/(staff)/
  // distribuicao) — corrigir divergência de reconciliação, reprocessar item da DLQ e o kill
  // switch manual por canal (ADR-0020, mitigação exigida). Um subject dedicado em vez de reusar
  // "reservation" porque a ação aqui é sobre a SAÚDE DO CANAL (packages/channels, ainda em
  // construção em faixa paralela), não sobre uma reserva individual.
  | "channel_sync"
  // Fase 6, Passo 4c (docs/fase-atual.md): editor de checklist versionado
  // (apps/console/app/(staff)/limpeza/checklists) — subject dedicado porque criar uma NOVA VERSÃO
  // de template é decisão de configuração de padrão de qualidade da operação (o que conta como
  // "virada aprovada"), não uma ação sobre uma virada/reserva individual. Nunca ganha "update":
  // uma versão já criada é imutável por design (mesmo princípio de `tax_rules`/
  // `administration_contracts` — nova versão é linha nova, jamais edição da vigente).
  | "checklist_template"
  // Fase 6, Passo 4c: fila de OS técnica (apps/console/app/(staff)/limpeza/servicos) — já existia
  // como conceito no domínio (`packages/domain/src/work-order/state-machine.ts`, seção 9.10.2)
  // desde a Fase 0, mas nenhuma faixa anterior tinha adicionado o subject CASL correspondente
  // (conferido antes de declarar: nenhuma ocorrência de "work_order" neste arquivo até aqui).
  // "update" cobre abrir uma nova execução de rework/transicionar estado — a transição em si só é
  // aceita se `canTransitionWorkOrder` (FSM do domínio) permitir, checado na Server Action antes de
  // qualquer UPDATE; CASL só decide "este papel pode mexer em OS", não "para qual estado".
  | "work_order"
  // Fase 6, Passo 4d (docs/fase-atual.md): painel de revisão fotográfica de limpeza
  // (apps/console/app/(staff)/limpeza/revisao/[taskId], seção 9.8.1) — decidir sobre uma
  // cleaning_task (aprovar/aprovar com observação/reprovar com motivo). Subject dedicado em vez
  // de reusar "work_order" ou "reservation": a decisão aqui é sobre a TAREFA DE VIRADA
  // (packages/db's cleaning_tasks), distinta da OS técnica (work_order, seção 9.10.2) e da
  // reserva em si — mesmo raciocínio já usado para "channel_sync" acima.
  | "cleaning_task"
  | "all";

export type AppAbility = MongoAbility<[Action, Subject]>;

/**
 * Constrói a ability para um papel. Regras iniciais da Fase 0 — cada rota real adiciona suas
 * próprias regras conforme nasce (ver seção 7.3). `evidence`/`delete` nunca é concedido a
 * NENHUM papel, em nenhuma condição — I10.
 */
export function defineAbilityFor(role: Role): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  switch (role) {
    case "titan.owner":
      can("read", "all");
      can(["create", "update", "approve"], "all");
      break;
    case "titan.finance":
      can("read", ["ledger", "fiscal_document", "payout_batch"]);
      can(["create", "update"], ["ledger", "fiscal_document"]);
      can("approve", "payout_batch");
      // Fase 2, Passo 4 (docs/fase-atual.md): fila central de aprovações
      // (apps/console/app/(staff)/aprovacoes). "approve" cobre AMBAS as decisões possíveis sobre
      // a fila (aprovar e rejeitar) — CASL só decide "este papel pode decidir sobre a fila?",
      // nunca "qual das duas decisões". A regra de negócio real que distingue as duas ("rejeição
      // exige comentário", seção 9.4.2) já é imposta pelo domínio
      // (`rejectApproval`/`RejectionRequiresCommentError`) e pelo Zod na borda
      // (`ApprovalDecisionSchema.refine`), não por uma ability CASL separada — duas abilities
      // (`approve`/`reject`) não acrescentariam nenhuma garantia adicional aqui, só duplicariam a
      // checagem. `titan.auditor` não precisa de regra extra: já tem `can("read","all")`.
      can(["read", "approve"], "approval_request");
      // Fase 4, Passo 4c (docs/fase-atual.md): cockpit fiscal (apps/console/app/(staff)/fiscal).
      // NOTA sobre a premissa desta faixa: o prompt que abriu este passo assumia que `titan.finance`
      // só tinha `can("read", [...])` sobre `fiscal_document` até aqui — na verdade este case já
      // concede `can(["create","update"], ["ledger","fiscal_document"])` acima (linha anterior a
      // esta), então "reprocessar" (que é a Server Action `retryInvoiceIssuanceAction` gravando uma
      // intenção — ver ./actions.ts) já está coberto por "update", sem precisar de regra nova. O
      // único verbo que faltava é "approve": "cancelar" (`cancelInvoiceAction`) é uma decisão mais
      // consequente (I7 — documento fiscal emitido só sai de circulação por cancelamento formal, e
      // o cancelamento de verdade no provedor depende de outra faixa/worker chamá-lo depois) do que
      // uma correção de "update" comum — mesma lógica já usada para `approval_request` acima: uma
      // única ability cobrindo a decisão, em vez de inventar duas (ex. "cancel"/"reprocess"), que
      // não acrescentariam garantia extra aqui (a distinção real entre as duas operações já vem do
      // Zod na borda + do filtro de status na própria Server Action, não de uma ability separada).
      can("approve", "fiscal_document");
      // Fase 5, Passo 4a: fluxo de contas a pagar (AP) — submeter despesa de fornecedor
      // (`submitAccountsPayableAction`) é "create"; marcar como paga (`payAccountsPayableAction`),
      // que só executa depois que a `approval_request` vinculada já foi decidida pela fila
      // existente (/aprovacoes), é "approve" — mesma convenção de "approve"/"payout_batch" e
      // "approve"/"fiscal_document" acima: uma única ability cobrindo a decisão consequente, sem
      // inventar um verbo novo ("pay") que não acrescentaria garantia extra.
      can(["read", "create", "approve"], "accounts_payable");
      cannot("update", "rate"); // finance não altera tarifa — seção 7.1
      break;
    case "titan.revenue":
      can(["read", "update"], "rate");
      cannot(["read", "update"], "payout_batch"); // sem acesso a repasse/bancário
      break;
    case "titan.operations":
      can("read", "reservation");
      // Fase 1, Passo 5 (docs/fase-atual.md): operations cotação/cria reserva a partir do
      // cockpit (apps/console/app/(staff)/reservas/nova) — sem isto a Server Action de criação
      // de reserva não teria nenhuma ability real de "create"/"update" para checar, e o pedido
      // de sessão cairia sempre em "sem permissão" mesmo com sessão válida.
      can(["create", "update"], "reservation");
      can("propose", "rate"); // dentro de faixa — execução real fica com agente/pricing-scientist
      // Fase 3, Passo 4d: operations já lida com distribuição no dia a dia (é quem monitora
      // canal/DLQ/divergência no turno) — "update" cobre resolver divergência e reprocessar item
      // da DLQ (ambas são correção operacional, não decisão financeira). "approve" cobre
      // especificamente o kill switch por canal (ADR-0020): desligar um adapter é uma decisão de
      // maior impacto (derruba disponibilidade do canal inteiro), mas ainda é operações — não
      // finance/revenue — quem precisa reagir rápido "sem precisar de deploy" no momento de um
      // bloqueio/suspensão de canal, por isso não fica atrás de uma segunda aprovação formal como
      // a fila de /aprovacoes.
      can(["read", "update", "approve"], "channel_sync");
      // Fase 6, Passo 4c: editor de checklist é operação de configuração (define o padrão de
      // qualidade de virada), não decisão financeira — por isso `titan.operations`, não
      // `titan.finance`, mesmo espírito de `can("propose", "rate")` acima (operations lida com a
      // ferramenta do dia a dia). Só "read"/"create" — nunca "update": versão já criada é
      // imutável (ver comentário do subject "checklist_template" acima).
      can(["read", "create"], "checklist_template");
      // Abrir OS e transicionar seu estado (dispatch, aceite, execução, rework) é trabalho
      // operacional do turno — "update" cobre a transição de status em si; a FSM
      // (`canTransitionWorkOrder`) decide se aquela transição específica é válida, não esta
      // ability.
      can(["read", "create", "update"], "work_order");
      // Fase 6, Passo 4d: decidir a revisão fotográfica de uma virada (aprovar/aprovar com
      // observação/reprovar com motivo) é decisão operacional do turno, não financeira em si —
      // "approve" cobre as três decisões possíveis (mesma convenção de "approve"/"approval_request"
      // acima: CASL só decide "este papel pode decidir sobre a revisão?", nunca qual das três
      // decisões — a distinção real vem do Zod (`ReviewDecisionSchema`) + do domínio
      // (`enforceAssuranceLevel`), não de abilities separadas). "read" cobre abrir o painel.
      // Fase 6, Passo 4b (docs/fase-atual.md): quadro do dia de limpeza
      // (apps/console/app/(staff)/limpeza) — "create" cobre atribuir a virada a um responsável
      // (`assignCleaningTaskAction`, que também transiciona a unidade dirty->cleaning via
      // `transitionUnit`, I9); "update" cobre reatribuir o responsável
      // (`reassignCleaningTaskAction`, sem mudar status). Já existia `can(["read","approve"],
      // "cleaning_task")` para a revisão fotográfica (Passo 4d, acima) — mesclado numa única
      // chamada em vez de duplicar o subject (CASL soma regras por role, não por chamada; uma
      // segunda `can(..., "cleaning_task")` funcionaria também, mas duplicaria a declaração sem
      // motivo).
      can(["read", "create", "update", "approve"], "cleaning_task");
      break;
    case "titan.support":
      can(["read", "update"], "reservation"); // até alçada — limite real vem de docs/decisoes-de-negocio.md #5
      break;
    case "titan.field":
      can("read", "reservation"); // mínimo — horário + código, nunca PII completa do hóspede
      break;
    case "titan.auditor":
      can("read", "all"); // leitura total, escrita nenhuma
      break;
    case "titan.agent":
      can("propose", ["rate", "payout_batch", "fiscal_document"]); // nunca executa
      cannot(["create", "update", "delete", "approve"], "all");
      break;
    case "owner":
      can("read", "reservation"); // só das próprias unidades — filtro de ownership_share na query
      can("read", "payout_batch");
      break;
    case "vendor":
      can("read", "reservation"); // escopo mínimo — sem PII do hóspede
      break;
    case "guest":
      can(["read", "update"], "reservation"); // só a própria — filtrado por reservation_id
      break;
  }

  // I10 — regra absoluta, DEPOIS de todas as regras por papel: ninguém exclui evidência.
  // CASL resolve por REGRA MAIS RECENTE VENCE — declarar isto ANTES do switch (como na versão
  // original) deixa a garantia estrutural às cegas de qualquer `can("delete", "all")` que um
  // papel futuro venha a conceder (achado F-2/FALHA-D da auditoria de segurança da Fase 0: um
  // probe direto no @casl/ability confirmou que a ordem original permitia `delete` em `evidence`
  // assim que QUALQUER papel ganhasse "delete" sobre "all"). Aqui, por vir por último, nenhuma
  // regra futura pode revogá-la — é a diferença entre a invariante valer "por acidente" (porque
  // nenhum papel hoje pede delete) e valer "estruturalmente".
  cannot("delete", "evidence").because("I10 — evidência nunca é excluída, nenhum papel, nenhuma condição.");

  return build();
}

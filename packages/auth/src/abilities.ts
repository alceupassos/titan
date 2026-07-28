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
  // Fase 7, Passo 4b (docs/fase-atual.md): cadastro de prestador (apps/console/app/(staff)/
  // prestadores) — atualizar regime de tributação + status de compliance
  // (`updateVendorProfileAction`) é decisão financeira/cadastral sobre o FORNECEDOR em si, não
  // sobre uma `accounts_payable` individual (subject já existente acima) — mesmo raciocínio de
  // "channel_sync"/"cleaning_task": a entidade que muda de estado (o prestador) é distinta da
  // transação que ela participa (a conta a pagar). Disparar o pagamento com retenção
  // (`payVendorInvoiceAction`) continua coberto por "approve"/"accounts_payable", já concedido a
  // `titan.finance` desde a Fase 5 — não duplicado aqui.
  | "vendor_profile"
  // Fase 7, Passo 4c (docs/fase-atual.md): estoque e reposição preditiva
  // (apps/console/app/(staff)/estoque) — registrar um movimento de estoque
  // (`recordStockMovementAction`) é decisão operacional do turno (quem faz a virada também
  // registra consumo/perda/compra de enxoval), não financeira em si — mesmo raciocínio já usado
  // para "cleaning_task"/"work_order" acima. Subject dedicado em vez de reusar "cleaning_task":
  // a decisão aqui é sobre o SALDO DE ESTOQUE por unidade/item (packages/db's stock_movements/
  // stock_balances), distinto da tarefa de virada em si. Só "read"/"create" — nunca "update"/
  // "delete": mesmo espírito de `ledger_entries`/`evidence_log`, o histórico de movimento é
  // append-only por convenção desta fase (ver comentário de stock_movements em
  // packages/db/src/schema/stock-movement.ts); corrigir um lançamento errado é um NOVO movimento
  // de ajuste/perda, nunca uma edição do anterior.
  | "stock_movement"
  // Fase 8, Passo 5 (docs/fase-atual.md): snapshot de decisão de pricing (I8 —
  // apps/console/app/(staff)/pricing). Subject dedicado em vez de reusar "rate": a decisão aqui é
  // sobre O REGISTRO RASTREÁVEL de uma sugestão/publicação de preço (comp set usado, piso
  // calculado, sugerido vs. final), não sobre a tarifa em si (que continua sendo "rate", já
  // concedida a titan.revenue desde a Fase 0). "propose" (já existente para titan.operations/
  // titan.agent sobre "rate") cobre rodar a sugestão; "approve" aqui é específico para decidir uma
  // publicação que caiu em price_out_of_band (mesma fila de /aprovacoes, tipo já existente desde
  // a Fase 2), nunca um verbo novo.
  | "pricing_snapshot"
  // Fase 9, Passo 4b (docs/fase-atual.md): escala e custódia de acesso da equipe de campo
  // (apps/console/app/(staff)/equipe, .../equipe/escala). Subject único cobrindo cadastro
  // (onboard), escala (atribuir/responder) e custódia de acesso (emitir/transferir/revogar) do
  // mesmo `WorkforceMember` — não fragmentado em subjects menores porque, ao contrário de
  // "cleaning_task"/"work_order", nenhuma dessas sub-ações tem um dono de papel distinto do
  // cadastro em si nesta fase. NOTA PARA A PRÓXIMA FAIXA (produtividade, Passo 4c, que edita este
  // arquivo em seguida): se a tela de produtividade precisar de uma ability própria (ex. registrar
  // conclusão de tarefa/`task_completion_record`), prefira um subject NOVO em vez de sobrecarregar
  // "workforce_member" — mesmo raciocínio já usado para "cleaning_task" vs. "work_order" acima.
  | "workforce_member"
  // Fase 9, Passo 4c (docs/fase-atual.md): painel de produtividade
  // (apps/console/app/(staff)/equipe/produtividade). Subject NOVO em vez de sobrecarregar
  // "workforce_member" (seguindo a nota deixada pela faixa 4b acima) — registrar uma conclusão de
  // tarefa (`recordTaskCompletionAction`) é um evento de EXECUÇÃO de campo (o quê foi feito, por
  // quem, com qual evidência), distinto da decisão de CADASTRO/escala/custódia de acesso sobre o
  // `WorkforceMember` em si. Só "read"/"create" — nunca "update"/"delete": mesmo espírito de
  // "stock_movement"/"evidence_log", o histórico de conclusão é append-only por convenção (a
  // sinalização de possível reuso de foto, `flagSuspiciousCompletions`, nunca apaga/edita um
  // registro já gravado — só sinaliza para revisão humana).
  | "task_completion_record"
  // Fase 10, Passo 4b (docs/fase-atual.md): console de automação
  // (apps/console/app/(staff)/automacao) — ligar/desligar um agente
  // (`toggleAgentKillSwitchAction`, UPSERT em `agent_kill_switches`) é a AÇÃO ESTRUTURAL do
  // guardrail #10 do ADR-0009 ("kill switch = revogar o token MCP da instância" — aqui, a
  // configuração corrente que a Fase 10b/`packages/agents` lê antes de aceitar rodar uma
  // conversa). Subject dedicado em vez de reusar "pricing_snapshot"/"channel_sync": a decisão
  // aqui é sobre O AGENTE em si (ligado/desligado), não sobre uma proposta/execução individual
  // que ele produz — mesmo raciocínio de "channel_sync" (kill switch por canal, Fase 3) aplicado
  // a agente. Nunca "delete"/"approve": é uma configuração corrente de dois estados, não uma
  // fila de decisão.
  | "agent_kill_switch"
  // Fase 10, Passo 5 (docs/fase-atual.md): rodar uma conversa do Concierge a partir do cockpit
  // (`runConciergeConversationAction`) — cria `agent_conversations`/`agent_traces` reais. Subject
  // dedicado (não "agent_kill_switch"): a decisão aqui é sobre EXECUTAR uma conversa (ainda que em
  // ambiente de teste/demo dentro do cockpit), distinta de ligar/desligar o agente. "create" cobre
  // iniciar a conversa; nunca "approve"/"delete" — a consequência financeira/fiscal eventual que
  // o Concierge propõe já é decidida pela fila de `/aprovacoes` (approval_request tipo
  // "agent_action"), nunca por esta ability.
  | "agent_conversation"
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
      // Fase 7, Passo 4b (docs/fase-atual.md): cadastro de prestador
      // (apps/console/app/(staff)/prestadores) — atualizar regime de tributação + status de
      // compliance é decisão do financeiro (é quem depende do regime correto para calcular
      // retenção antes de pagar, `payVendorInvoiceAction`), não de operações — mesmo raciocínio
      // de "titan.finance" já ser dono de "accounts_payable"/"fiscal_document" acima. "approve"
      // sobre "accounts_payable" (linha acima, já existente desde a Fase 5) já cobre disparar o
      // pagamento com retenção — não duplicado aqui.
      can(["read", "create", "update"], "vendor_profile");
      cannot("update", "rate"); // finance não altera tarifa — seção 7.1
      break;
    case "titan.revenue":
      can(["read", "update"], "rate");
      cannot(["read", "update"], "payout_batch"); // sem acesso a repasse/bancário
      // Fase 8, Passo 5: revenue é quem publica o preço final e decide sobre variação fora da
      // faixa de autonomia (price_out_of_band) — "create" cobre rodar a sugestão/publicar,
      // "approve" cobre decidir uma publicação que exigiu aprovação extra.
      // "update" cobre configurar a autonomia por unidade (modo sugestão/automático + limite de
      // variação diária) — decisão de configuração, mesmo papel de quem publica/aprova o preço.
      can(["read", "create", "update", "approve"], "pricing_snapshot");
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
      // Fase 7, Passo 4c: registrar movimento de estoque (compra/consumo/ajuste/perda/devolução)
      // a partir do painel de /estoque — só "read"/"create", nunca "update"/"delete" (ver
      // comentário de justificativa do subject "stock_movement" acima).
      can(["read", "create"], "stock_movement");
      // Fase 8, Passo 5: rodar a sugestão de preço (comp set→forecast→otimização→explicabilidade,
      // persistindo o snapshot) é trabalho operacional do turno — "create" cobre isso; publicar o
      // preço final e decidir sobre variação fora da faixa continuam exclusivos de titan.revenue
      // ("approve" acima).
      can(["read", "create"], "pricing_snapshot");
      // Fase 9, Passo 4b: cadastro de membro, atribuição de escala e emissão/transferência de
      // credencial de acesso são trabalho operacional do turno — "create"/"update" cobrem isso.
      // "approve" é dedicado ao DESLIGAMENTO (`dismissMemberAction`): é a consequência de maior
      // impacto deste subject (revoga TODA credencial de acesso ativa do membro na mesma
      // transação — ver packages/domain/src/workforce/offboarding.ts), mesmo padrão de "approve"
      // sobre "payout_batch"/"fiscal_document" acima — uma única ability cobrindo a decisão mais
      // consequente, nunca um "update" comum.
      can(["read", "create", "update"], "workforce_member");
      can("approve", "workforce_member");
      // Fase 9, Passo 4c: registrar conclusão de tarefa é trabalho operacional do turno de campo
      // — só "read"/"create", nunca "update"/"delete" (ver comentário de justificativa do subject
      // "task_completion_record" acima).
      can(["read", "create"], "task_completion_record");
      // Fase 10, Passo 4b: ligar/desligar um agente (kill switch, ADR-0009 guardrail #10) é
      // operação do turno — mesmo raciocínio já usado para "channel_sync" (kill switch por canal,
      // Fase 3): quem monitora o operacional precisa reagir rápido, sem esperar uma segunda
      // aprovação formal da fila de /aprovacoes.
      can(["read", "update"], "agent_kill_switch");
      // Fase 10, Passo 5: rodar uma conversa do Concierge a partir do cockpit — "create" cobre
      // iniciar a conversa (grava agent_conversations/agent_traces); a consequência financeira/
      // fiscal eventual continua decidida só pela fila de /aprovacoes (agent_action), nunca aqui.
      can(["read", "create"], "agent_conversation");
      break;
    case "titan.support":
      can(["read", "update"], "reservation"); // até alçada — limite real vem de docs/decisoes-de-negocio.md #5
      break;
    case "titan.field":
      can("read", "reservation"); // mínimo — horário + código, nunca PII completa do hóspede
      // Fase 9, Passo 5 (docs/fase-atual.md): app de campo (apps/field, api/field/**) — ler a
      // lista de tarefas do dia (cleaning_task) é o mínimo necessário para o ciclo de estadia
      // executado no app; abrir OS/registrar conclusão de tarefa já são cobertos por
      // "work_order"/"task_completion_record" concedidos a titan.operations (as Server Actions
      // reusadas pelos Route Handlers não distinguem entre chamada via cockpit ou via app — mesma
      // lacuna de mapeamento usuário->papel já documentada em requireStaffSession()).
      can("read", "cleaning_task");
      break;
    case "titan.auditor":
      can("read", "all"); // leitura total, escrita nenhuma
      break;
    case "titan.agent":
      can("propose", ["rate", "payout_batch", "fiscal_document", "pricing_snapshot"]); // nunca executa
      cannot(["create", "update", "delete", "approve"], "all");
      break;
    case "owner":
      can("read", "reservation"); // só das próprias unidades — filtro de ownership_share na query
      can("read", "payout_batch");
      break;
    case "vendor":
      can("read", "reservation"); // escopo mínimo — sem PII do hóspede
      // Fase 7, Passo 4a (docs/fase-atual.md): Portal do prestador
      // (apps/console/app/(vendor)/portal-prestador) — aceitar, iniciar execução e concluir uma
      // OS técnica atribuída a si. "update" cobre a transição de status em si; a FSM
      // (`canTransitionWorkOrder`) decide se aquela transição é válida a partir do estado atual, e
      // a Server Action (`vendorTransitionWorkOrderAction`) confere ADEMAIS que a OS pertence a
      // este prestador (`row.vendorId === vendorId informado` — ver
      // apps/console/lib/auth/vendor-session.ts, lacuna de mapeamento usuário -> prestador) antes
      // de qualquer UPDATE. CASL só decide "este papel pode mexer em OS", nunca "qual OS" nem
      // "para qual estado" — mesmo espírito já usado para `titan.operations`/"work_order" acima.
      can(["read", "update"], "work_order");
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

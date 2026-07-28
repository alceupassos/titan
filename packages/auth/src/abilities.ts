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

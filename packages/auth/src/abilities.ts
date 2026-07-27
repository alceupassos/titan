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
  | "all";

export type AppAbility = MongoAbility<[Action, Subject]>;

/**
 * Constrói a ability para um papel. Regras iniciais da Fase 0 — cada rota real adiciona suas
 * próprias regras conforme nasce (ver seção 7.3). `evidence`/`delete` nunca é concedido a
 * NENHUM papel, em nenhuma condição — I10.
 */
export function defineAbilityFor(role: Role): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  // I10 — regra absoluta, antes de qualquer regra por papel: ninguém exclui evidência.
  cannot("delete", "evidence").because("I10 — evidência nunca é excluída, nenhum papel, nenhuma condição.");

  switch (role) {
    case "titan.owner":
      can("read", "all");
      can(["create", "update", "approve"], "all");
      break;
    case "titan.finance":
      can("read", ["ledger", "fiscal_document", "payout_batch"]);
      can(["create", "update"], ["ledger", "fiscal_document"]);
      can("approve", "payout_batch");
      cannot("update", "rate"); // finance não altera tarifa — seção 7.1
      break;
    case "titan.revenue":
      can(["read", "update"], "rate");
      cannot(["read", "update"], "payout_batch"); // sem acesso a repasse/bancário
      break;
    case "titan.operations":
      can("read", "reservation");
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

  return build();
}

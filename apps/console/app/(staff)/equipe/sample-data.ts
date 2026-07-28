// Dados de amostra para a visão geral de Equipe (./page.tsx) e para a aba de Escala
// (./escala/page.tsx) — Fase 9 (Pessoas e Campo), Passo 4b (docs/fase-atual.md). Não há Postgres
// vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2"), então nenhuma das duas páginas
// consulta `packages/db` para LER ainda — mesmo espírito de
// apps/console/app/(staff)/limpeza/sample-data.ts e .../estoque/sample-data.ts. Os tipos usados
// são os MESMOS tipos de linha crua do Drizzle (`typeof workforceMembers.$inferSelect`, etc.),
// não interfaces soltas reinventadas, para que trocar por ./queries.ts real seja só trocar a
// fonte, nunca o formato consumido pela lógica de derivação nas páginas.
//
// O CAMINHO DE ESCRITA (`onboardMemberAction`, `assignShiftAction`,
// `respondToShiftAssignmentAction`, `issueAccessCredentialAction`,
// `transferAccessCredentialAction`, `dismissMemberAction` — ./actions.ts) já é real, contra o
// banco via `withTenant`. Ids abaixo são UUIDs v4 válidos por isso mesmo — mesmo padrão de
// apps/console/app/(staff)/pricing/sample-data.ts (nunca strings tipo "member-1", que quebram
// `.uuid()` do Zod).
import type { accessCredentialEvents, shiftAssignments, workforceMembers } from "@titan/db";
import {
  appendAccessCredentialEvent,
  type AccessCredentialEvent,
  type EmploymentType,
} from "@titan/domain";

const TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00"; // mesmo tenant de amostra das demais rotas.

// Mesma âncora de "agora" usada em apps/console/app/(staff)/limpeza/sample-data.ts, para o painel
// de equipe renderizar com o mesmo relógio de amostra do restante do cockpit nesta sessão.
export const NOW_ANCHOR_EPOCH_MS = Date.parse("2026-07-28T14:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

export const MEMBER_FERNANDA = "f0000000-0000-4000-8000-000000000001"; // camareira, employee, ativa
export const MEMBER_RICARDO = "f0000000-0000-4000-8000-000000000002"; // manutenção, contractor, ativo
export const MEMBER_JULIANA = "f0000000-0000-4000-8000-000000000003"; // inspeção, unspecified, ativa
export const MEMBER_MARCOS = "f0000000-0000-4000-8000-000000000004"; // camareira, employee, desligado

type MemberRow = typeof workforceMembers.$inferSelect;

/** 4 membros cobrindo os 3 `EmploymentType` (seção 9.10.6 do prompt único — a pergunta 3 de
 * docs/decisoes-de-negocio.md segue pendente, por isso "unspecified" é um caso real de amostra,
 * não um valor de canto ignorável) mais um desligado (para o KPI "Desligamentos no mês"). */
export const SAMPLE_MEMBERS: readonly MemberRow[] = [
  {
    id: MEMBER_FERNANDA,
    tenantId: TENANT_ID,
    fullName: "Fernanda Souza",
    role: "camareira",
    zones: ["Centro", "Jardins"],
    skills: ["limpeza_padrao", "limpeza_profunda"],
    certifications: [],
    employmentType: "employee" satisfies EmploymentType,
    status: "active",
  },
  {
    id: MEMBER_RICARDO,
    tenantId: TENANT_ID,
    fullName: "Ricardo Alves",
    role: "manutenção",
    zones: ["Enseada"],
    skills: ["eletrica", "hidraulica"],
    certifications: ["nr10"],
    employmentType: "contractor" satisfies EmploymentType,
    status: "active",
  },
  {
    id: MEMBER_JULIANA,
    tenantId: TENANT_ID,
    fullName: "Juliana Prado",
    role: "inspeção",
    zones: ["Centro"],
    skills: ["inspecao_fotografica"],
    certifications: [],
    // "unspecified" — vínculo ainda não confirmado pelo jurídico (pergunta 3 pendente).
    // resolveAssignmentMode trata isso como voluntary (default conservador), nunca mandatory.
    employmentType: "unspecified" satisfies EmploymentType,
    status: "active",
  },
  {
    id: MEMBER_MARCOS,
    tenantId: TENANT_ID,
    fullName: "Marcos Lima",
    role: "camareira",
    zones: ["Jardins"],
    skills: ["limpeza_padrao"],
    certifications: [],
    employmentType: "employee" satisfies EmploymentType,
    // Desligado nesta amostra — credenciais já revogadas (ver SAMPLE_ACCESS_CREDENTIAL_EVENTS
    // abaixo, eventos 5-6), simulando o resultado de um dismissMemberAction já executado.
    status: "dismissed",
  },
];

type ShiftAssignmentRow = typeof shiftAssignments.$inferSelect;

/** Escalas de amostra em estados variados — cobre `mandatory` (employee, sempre `accepted`, sem
 * aceite a fazer — resolveAssignmentMode) e `voluntary` (contractor/unspecified, `proposed`
 * aguardando resposta, ou já `accepted`/`declined`). */
export const SAMPLE_SHIFT_ASSIGNMENTS: readonly ShiftAssignmentRow[] = [
  {
    id: "f1000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    memberId: MEMBER_FERNANDA,
    date: "2026-07-28",
    status: "accepted", // mandatory — employee, sem aceite a fazer.
  },
  {
    id: "f1000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    memberId: MEMBER_FERNANDA,
    date: "2026-07-29",
    status: "accepted",
  },
  {
    id: "f1000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    memberId: MEMBER_RICARDO,
    date: "2026-07-28",
    status: "proposed", // voluntary — contractor, ainda aguardando aceitar/recusar.
  },
  {
    id: "f1000000-0000-4000-8000-000000000004",
    tenantId: TENANT_ID,
    memberId: MEMBER_RICARDO,
    date: "2026-07-30",
    status: "accepted", // voluntary já respondida.
  },
  {
    id: "f1000000-0000-4000-8000-000000000005",
    tenantId: TENANT_ID,
    memberId: MEMBER_JULIANA,
    date: "2026-07-28",
    status: "declined", // voluntary — recusou, mesmo sendo "unspecified" (nunca mandatory).
  },
  {
    id: "f1000000-0000-4000-8000-000000000006",
    tenantId: TENANT_ID,
    memberId: MEMBER_JULIANA,
    date: "2026-07-29",
    status: "proposed",
  },
];

/** Hash determinístico SÓ para esta amostra (djb2) — NÃO é o `hashFn` real usado por
 * ./actions.ts (que usa `node:crypto`'s `createHash("sha256")`, permitido na borda `apps/console`,
 * nunca dentro de `packages/domain`). Aqui o objetivo é só exercitar
 * `appendAccessCredentialEvent`/a forma da cadeia com dados de exibição, não provar hash
 * criptográfico real. */
function sampleHashFn(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return `sample-${(hash >>> 0).toString(16)}`;
}

// Cadeia construída DE VERDADE via `appendAccessCredentialEvent` (packages/domain/src/workforce/
// access-custody.ts) — inclui pelo menos 1 evento de cada `kind` ("issued"/"transferred"/
// "revoked"), incluindo o par emitir->transferir da MESMA credencial (key-101, Ricardo -> Fernanda)
// e o desligamento já revogado de Marcos (app-004).
let chain: AccessCredentialEvent[] = [];
chain = appendAccessCredentialEvent(
  chain,
  { kind: "issued", memberId: MEMBER_FERNANDA, credentialType: "app_access", credentialId: "app-001" },
  sampleHashFn,
);
chain = appendAccessCredentialEvent(
  chain,
  { kind: "issued", memberId: MEMBER_RICARDO, credentialType: "physical_key", credentialId: "key-101" },
  sampleHashFn,
);
chain = appendAccessCredentialEvent(
  chain,
  { kind: "issued", memberId: MEMBER_JULIANA, credentialType: "digital_code", credentialId: "code-55" },
  sampleHashFn,
);
chain = appendAccessCredentialEvent(
  chain,
  {
    kind: "transferred",
    memberId: MEMBER_FERNANDA, // novo dono — Ricardo devolveu a chave física, Fernanda assumiu a zona.
    credentialType: "physical_key",
    credentialId: "key-101",
  },
  sampleHashFn,
);
chain = appendAccessCredentialEvent(
  chain,
  { kind: "issued", memberId: MEMBER_MARCOS, credentialType: "app_access", credentialId: "app-004" },
  sampleHashFn,
);
chain = appendAccessCredentialEvent(
  chain,
  {
    kind: "revoked",
    memberId: MEMBER_MARCOS,
    credentialType: "app_access",
    credentialId: "app-004",
    reason: "Desligamento: fim de contrato — revogação automática (dismissMemberAction).",
  },
  sampleHashFn,
);

type AccessCredentialEventRow = typeof accessCredentialEvents.$inferSelect;

/** Cadeia no shape de DOMÍNIO (`AccessCredentialEvent[]`, não linha crua) — exportada à parte para
 * ./page.tsx poder chamar `activeCredentialsForMember`/`verifyAccessCredentialChain` diretamente,
 * sem reconstruir a partir de `SAMPLE_ACCESS_CREDENTIAL_EVENTS` (mesmo objeto, dois formatos). */
export const SAMPLE_ACCESS_CREDENTIAL_CHAIN: readonly AccessCredentialEvent[] = chain;

/** Espelha `chain` acima no shape de linha crua do Drizzle, com `createdAt` crescente (a ordem de
 * append É a ordem cronológica — mesma convenção de `getAccessCredentialEventsChain` em
 * ./queries.ts, que ordena por `createdAt`). */
export const SAMPLE_ACCESS_CREDENTIAL_EVENTS: readonly AccessCredentialEventRow[] = chain.map((event, index) => ({
  id: `f2000000-0000-4000-8000-00000000000${index + 1}`,
  tenantId: TENANT_ID,
  entryHash: event.entryHash,
  prevHash: event.prevHash,
  kind: event.kind,
  memberId: event.memberId,
  credentialType: event.credentialType,
  credentialId: event.credentialId,
  reason: event.reason ?? null,
  envelope: null,
  createdAt: new Date(NOW_ANCHOR_EPOCH_MS - (chain.length - index) * DAY_MS),
}));

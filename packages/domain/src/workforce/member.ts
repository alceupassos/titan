// Fase 9 (Pessoas e Campo), Passo 1 — bounded context `workforce`, zero I/O. Só nasce agora
// porque a Fase 6 (housekeeping/checklist.ts) documentou explicitamente que `assigned_to` era
// texto livre, sem vínculo formal, ENQUANTO a pergunta 3 de docs/decisoes-de-negocio.md (vínculo
// da equipe de campo: CLT/PJ/terceirizada) seguisse pendente. Ela SEGUE pendente por decisão
// explícita do usuário (recusou responder, optou por seguir com o default documentado em vez de
// esperar ou de o agente presumir) — por isso `employmentType` tem um terceiro valor
// `"unspecified"`, e nenhuma função deste bounded context assume um vínculo que não foi
// confirmado (ver `assignment.ts::resolveAssignmentMode`).
//
// Só o shape do agregado aqui — nenhuma lógica.

export type EmploymentType = "employee" | "contractor" | "unspecified";

export type MemberStatus = "active" | "dismissed";

export interface WorkforceMember {
  readonly id: string;
  readonly tenantId: string;
  readonly fullName: string;
  readonly role: string;
  readonly zones: readonly string[];
  readonly skills: readonly string[];
  readonly certifications: readonly string[];
  readonly employmentType: EmploymentType;
  readonly status: MemberStatus;
}

// Desligamento de membro da equipe de campo — portão de saída da Fase 9 ("revogação de
// desligamento provada"): `dismissMember` é a ÚNICA função que desliga um membro, e ela SEMPRE
// revoga toda credencial de acesso ativa dele na mesma chamada — nunca em duas etapas onde a
// revogação possa ser esquecida por quem chama depois.
import {
  activeCredentialsForMember,
  appendAccessCredentialEvent,
  type AccessCredentialEvent,
  type HashFn,
} from "./access-custody";
import type { MemberStatus, WorkforceMember } from "./member";

export class MemberAlreadyDismissedError extends Error {
  constructor(memberId: string) {
    super(`Membro ${memberId} já está desligado (status "dismissed") — nunca desligar duas vezes silenciosamente.`);
    this.name = "MemberAlreadyDismissedError";
  }
}

export interface DismissMemberResult {
  readonly dismissedMember: WorkforceMember;
  readonly revocationEvents: readonly AccessCredentialEvent[];
  readonly updatedChain: readonly AccessCredentialEvent[];
}

/**
 * Desliga um membro e revoga TODAS as credenciais de acesso ativas dele. Nunca muta `member` nem
 * `credentialChain` — retorna sempre novas estruturas.
 */
export function dismissMember(
  member: WorkforceMember,
  credentialChain: readonly AccessCredentialEvent[],
  reason: string,
  hashFn: HashFn,
): DismissMemberResult {
  if (!reason || reason.trim().length === 0) {
    throw new RangeError("Motivo de desligamento é obrigatório — nunca desligamento silencioso.");
  }
  if (member.status === "dismissed") {
    throw new MemberAlreadyDismissedError(member.id);
  }

  const active = activeCredentialsForMember(credentialChain, member.id);

  let updatedChain = credentialChain;
  const revocationEvents: AccessCredentialEvent[] = [];
  for (const credential of active) {
    updatedChain = appendAccessCredentialEvent(
      updatedChain,
      {
        kind: "revoked",
        memberId: member.id,
        credentialType: credential.credentialType,
        credentialId: credential.credentialId,
        reason,
      },
      hashFn,
    );
    revocationEvents.push(updatedChain[updatedChain.length - 1]!);
  }

  const dismissedStatus: MemberStatus = "dismissed";
  return {
    dismissedMember: { ...member, status: dismissedStatus },
    revocationEvents,
    updatedChain,
  };
}

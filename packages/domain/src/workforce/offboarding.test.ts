import { describe, expect, it } from "vitest";
import { appendAccessCredentialEvent, activeCredentialsForMember, type AccessCredentialEvent } from "./access-custody";
import { MemberAlreadyDismissedError, dismissMember } from "./offboarding";
import type { WorkforceMember } from "./member";

// hash determinístico e trivial só para teste — não é o sha256 real (isso vive na borda de I/O).
const fakeHash = (input: string) => `h(${input})`;

function makeMember(overrides: Partial<WorkforceMember> = {}): WorkforceMember {
  return {
    id: "membro-1",
    tenantId: "tenant-1",
    fullName: "Fulano de Tal",
    role: "camareira",
    zones: ["zona-sul"],
    skills: [],
    certifications: [],
    employmentType: "employee",
    status: "active",
    ...overrides,
  };
}

describe("dismissMember — portão de saída: revogação de desligamento provada", () => {
  it("membro com 3 credenciais ativas de tipos diferentes: todas são revogadas", () => {
    const member = makeMember();
    let chain: AccessCredentialEvent[] = [];
    chain = appendAccessCredentialEvent(
      chain,
      { kind: "issued", memberId: member.id, credentialType: "physical_key", credentialId: "chave-101" },
      fakeHash,
    );
    chain = appendAccessCredentialEvent(
      chain,
      { kind: "issued", memberId: member.id, credentialType: "digital_code", credentialId: "codigo-202" },
      fakeHash,
    );
    chain = appendAccessCredentialEvent(
      chain,
      { kind: "issued", memberId: member.id, credentialType: "app_access", credentialId: "app-303" },
      fakeHash,
    );

    const result = dismissMember(member, chain, "fim de contrato", fakeHash);

    expect(result.revocationEvents).toHaveLength(3);
    expect(result.revocationEvents.every((event) => event.kind === "revoked")).toBe(true);
    expect(activeCredentialsForMember(result.updatedChain, member.id)).toHaveLength(0);
    expect(result.dismissedMember.status).toBe("dismissed");
  });

  it("REJEITA reason vazio", () => {
    const member = makeMember();
    expect(() => dismissMember(member, [], "", fakeHash)).toThrow(RangeError);
    expect(() => dismissMember(member, [], "   ", fakeHash)).toThrow(RangeError);
  });

  it("REJEITA desligar um membro já dismissed", () => {
    const member = makeMember({ status: "dismissed" });
    expect(() => dismissMember(member, [], "motivo", fakeHash)).toThrow(MemberAlreadyDismissedError);
  });

  it("não muta o member nem a credentialChain recebidos", () => {
    const member = makeMember();
    let chain: AccessCredentialEvent[] = [];
    chain = appendAccessCredentialEvent(
      chain,
      { kind: "issued", memberId: member.id, credentialType: "physical_key", credentialId: "chave-1" },
      fakeHash,
    );
    const originalChainLength = chain.length;

    dismissMember(member, chain, "motivo", fakeHash);

    expect(member.status).toBe("active");
    expect(chain).toHaveLength(originalChainLength);
  });
});

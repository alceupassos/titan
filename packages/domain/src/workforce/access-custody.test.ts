import { describe, expect, it } from "vitest";
import {
  activeCredentialsForMember,
  appendAccessCredentialEvent,
  verifyAccessCredentialChain,
  type AccessCredentialEvent,
} from "./access-custody";

// hash determinístico e trivial só para teste — não é o sha256 real (isso vive na borda de I/O).
const fakeHash = (input: string) => `h(${input})`;

describe("appendAccessCredentialEvent", () => {
  it("builda uma cadeia corretamente (issued -> transferred -> revoked)", () => {
    let chain: AccessCredentialEvent[] = [];
    chain = appendAccessCredentialEvent(
      chain,
      { kind: "issued", memberId: "membro-1", credentialType: "physical_key", credentialId: "chave-101" },
      fakeHash,
    );
    chain = appendAccessCredentialEvent(
      chain,
      { kind: "transferred", memberId: "membro-2", credentialType: "physical_key", credentialId: "chave-101" },
      fakeHash,
    );
    chain = appendAccessCredentialEvent(
      chain,
      {
        kind: "revoked",
        memberId: "membro-2",
        credentialType: "physical_key",
        credentialId: "chave-101",
        reason: "fim de expediente",
      },
      fakeHash,
    );

    expect(chain).toHaveLength(3);
    expect(chain[0]!.prevHash).toBeNull();
    expect(chain[1]!.prevHash).toBe(chain[0]!.entryHash);
    expect(chain[2]!.prevHash).toBe(chain[1]!.entryHash);
    expect(verifyAccessCredentialChain(chain, fakeHash)).toBe(true);
  });

  it("REJEITA revogação sem motivo", () => {
    const chain: AccessCredentialEvent[] = [];
    expect(() =>
      appendAccessCredentialEvent(
        chain,
        { kind: "revoked", memberId: "membro-1", credentialType: "digital_code", credentialId: "codigo-9" },
        fakeHash,
      ),
    ).toThrow(RangeError);
  });
});

describe("verifyAccessCredentialChain", () => {
  it("detecta alteração de 1 byte em qualquer campo de qualquer entrada anterior", () => {
    let chain: AccessCredentialEvent[] = [];
    chain = appendAccessCredentialEvent(
      chain,
      { kind: "issued", memberId: "membro-1", credentialType: "app_access", credentialId: "app-1" },
      fakeHash,
    );
    chain = appendAccessCredentialEvent(
      chain,
      {
        kind: "revoked",
        memberId: "membro-1",
        credentialType: "app_access",
        credentialId: "app-1",
        reason: "motivo real",
      },
      fakeHash,
    );
    expect(verifyAccessCredentialChain(chain, fakeHash)).toBe(true);

    // adulterar o motivo de uma entrada já encadeada quebra a verificação.
    const tamperedReason = [chain[0]!, { ...chain[1]!, reason: "motivo forjado" }];
    expect(verifyAccessCredentialChain(tamperedReason, fakeHash)).toBe(false);

    // adulterar o credentialId de uma entrada já encadeada quebra a verificação.
    const tamperedCredentialId = [{ ...chain[0]!, credentialId: "app-2" }, chain[1]!];
    expect(verifyAccessCredentialChain(tamperedCredentialId, fakeHash)).toBe(false);
  });
});

describe("activeCredentialsForMember", () => {
  it("retorna só as credenciais atualmente ativas do membro", () => {
    let chain: AccessCredentialEvent[] = [];
    // emitida -> ativa para membro-1
    chain = appendAccessCredentialEvent(
      chain,
      { kind: "issued", memberId: "membro-1", credentialType: "physical_key", credentialId: "chave-A" },
      fakeHash,
    );
    // emitida -> revogada -> não aparece mais para ninguém
    chain = appendAccessCredentialEvent(
      chain,
      { kind: "issued", memberId: "membro-1", credentialType: "digital_code", credentialId: "codigo-B" },
      fakeHash,
    );
    chain = appendAccessCredentialEvent(
      chain,
      {
        kind: "revoked",
        memberId: "membro-1",
        credentialType: "digital_code",
        credentialId: "codigo-B",
        reason: "perdida",
      },
      fakeHash,
    );
    // emitida -> transferida para outro membro -> não aparece mais para o membro original
    chain = appendAccessCredentialEvent(
      chain,
      { kind: "issued", memberId: "membro-1", credentialType: "app_access", credentialId: "app-C" },
      fakeHash,
    );
    chain = appendAccessCredentialEvent(
      chain,
      { kind: "transferred", memberId: "membro-2", credentialType: "app_access", credentialId: "app-C" },
      fakeHash,
    );

    const activeMember1 = activeCredentialsForMember(chain, "membro-1");
    const activeMember2 = activeCredentialsForMember(chain, "membro-2");

    expect(activeMember1.map((e) => e.credentialId).sort()).toEqual(["chave-A"]);
    expect(activeMember2.map((e) => e.credentialId)).toEqual(["app-C"]);
  });
});

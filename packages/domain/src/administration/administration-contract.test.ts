import { civilDate } from "@titan/dates";
import { describe, expect, it } from "vitest";
import {
  NoAdministrationContractForDateError,
  OverlappingAdministrationContractError,
  resolveAdministrationContractForDate,
  type AdministrationContract,
} from "./administration-contract";

function makeContract(overrides: Partial<AdministrationContract> = {}): AdministrationContract {
  return {
    id: "contract-1",
    tenantId: "tenant-1",
    unitId: "unit-1",
    commissionBasisPoints: 2000, // 20,00%
    itemPaymentModel: "titan_pays_all",
    validFrom: civilDate("2026-01-01"),
    validTo: civilDate("2026-12-31"),
    ...overrides,
  };
}

describe("resolveAdministrationContractForDate", () => {
  it("resolve o contrato vigente quando exatamente um cobre a unidade+data", () => {
    const contract = makeContract();
    const resolved = resolveAdministrationContractForDate([contract], {
      unitId: "unit-1",
      date: civilDate("2026-06-15"),
    });
    expect(resolved).toBe(contract);
  });

  it("lança NoAdministrationContractForDateError quando nenhum contrato cobre a data", () => {
    const contract = makeContract({
      validFrom: civilDate("2026-01-01"),
      validTo: civilDate("2026-03-31"),
    });
    expect(() =>
      resolveAdministrationContractForDate([contract], {
        unitId: "unit-1",
        date: civilDate("2026-06-15"),
      }),
    ).toThrow(NoAdministrationContractForDateError);
  });

  it("lança NoAdministrationContractForDateError quando a unidade não bate", () => {
    const contract = makeContract();
    expect(() =>
      resolveAdministrationContractForDate([contract], {
        unitId: "unit-2", // sem contrato cadastrado
        date: civilDate("2026-06-15"),
      }),
    ).toThrow(NoAdministrationContractForDateError);
  });

  it("lança OverlappingAdministrationContractError quando dois contratos cobrem a mesma unidade+data — nunca escolhe o primeiro em silêncio", () => {
    const contractA = makeContract({ id: "contract-a" });
    const contractB = makeContract({ id: "contract-b" });
    expect(() =>
      resolveAdministrationContractForDate([contractA, contractB], {
        unitId: "unit-1",
        date: civilDate("2026-06-15"),
      }),
    ).toThrow(OverlappingAdministrationContractError);
  });

  it("vigência é inclusiva nos dois extremos", () => {
    const contract = makeContract({
      validFrom: civilDate("2026-01-01"),
      validTo: civilDate("2026-01-31"),
    });
    expect(
      resolveAdministrationContractForDate([contract], { unitId: "unit-1", date: civilDate("2026-01-01") }),
    ).toBe(contract);
    expect(
      resolveAdministrationContractForDate([contract], { unitId: "unit-1", date: civilDate("2026-01-31") }),
    ).toBe(contract);
  });
});

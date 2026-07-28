import { describe, expect, it } from "vitest";
import { InvalidCompSetInputError, buildCompSet, medianCompSetPriceCents, type UnitProfile } from "./comp-set";

function makeUnit(overrides: Partial<UnitProfile> = {}): UnitProfile {
  return {
    unitId: "unit-1",
    category: "studio",
    capacity: 2,
    currentNightlyPriceCents: 20000,
    ...overrides,
  };
}

describe("buildCompSet", () => {
  it("prioriza mesma categoria sobre capacidade/preço próximos", () => {
    const target = makeUnit({ unitId: "target", category: "studio", capacity: 2, currentNightlyPriceCents: 20000 });
    const sameCategoryDifferentCapacity = makeUnit({
      unitId: "same-category",
      category: "studio",
      capacity: 6,
      currentNightlyPriceCents: 20000,
    });
    const differentCategorySameCapacity = makeUnit({
      unitId: "different-category",
      category: "casa",
      capacity: 2,
      currentNightlyPriceCents: 20000,
    });

    const result = buildCompSet(target, [sameCategoryDifferentCapacity, differentCategorySameCapacity], 2);

    expect(result[0]!.unitId).toBe("same-category");
    expect(result[0]!.similarityScore).toBeGreaterThan(result[1]!.similarityScore);
  });

  it("nunca inclui a própria unidade alvo entre os candidatos", () => {
    const target = makeUnit({ unitId: "target" });
    const result = buildCompSet(target, [target, makeUnit({ unitId: "other" })], 5);
    expect(result.some((member) => member.unitId === "target")).toBe(false);
  });

  it("retorna array vazio (nunca lança) quando não há candidatos elegíveis", () => {
    const target = makeUnit({ unitId: "target" });
    expect(buildCompSet(target, [], 5)).toEqual([]);
  });

  it("respeita maxSize", () => {
    const target = makeUnit({ unitId: "target" });
    const candidates = [1, 2, 3, 4, 5].map((n) => makeUnit({ unitId: `candidate-${n}`, capacity: n }));
    expect(buildCompSet(target, candidates, 2)).toHaveLength(2);
  });

  it("lança InvalidCompSetInputError para maxSize não positivo", () => {
    const target = makeUnit();
    expect(() => buildCompSet(target, [], 0)).toThrow(InvalidCompSetInputError);
    expect(() => buildCompSet(target, [], -1)).toThrow(InvalidCompSetInputError);
  });

  it("produz similarityScore finito (nunca NaN/Infinity) quando alvo e candidato têm capacidade zero", () => {
    const target = makeUnit({ unitId: "target", capacity: 0 });
    const candidate = makeUnit({ unitId: "candidate", capacity: 0 });
    const result = buildCompSet(target, [candidate], 5);
    expect(result).toHaveLength(1);
    expect(Number.isFinite(result[0]!.similarityScore)).toBe(true);
    // mesma categoria, capacidade 0 == 0 (distância 0/max(0,0,1) = 0), mesmo preço → similaridade máxima.
    expect(result[0]!.similarityScore).toBe(1);
  });

  it("mantém ordem determinística (ordem de entrada em candidates) para empate exato de similarityScore", () => {
    const target = makeUnit({ unitId: "target" });
    // 3 candidatos idênticos entre si em categoria/capacidade/preço → similarityScore empatado.
    const tied = ["tied-a", "tied-b", "tied-c"].map((unitId) => makeUnit({ unitId }));
    const result = buildCompSet(target, tied, 5);
    expect(result.map((member) => member.unitId)).toEqual(["tied-a", "tied-b", "tied-c"]);
  });

  it("retorna todos os candidatos disponíveis (sem lançar, sem preencher) quando maxSize excede a quantidade", () => {
    const target = makeUnit({ unitId: "target" });
    const candidates = [makeUnit({ unitId: "only-one" })];
    const result = buildCompSet(target, candidates, 50);
    expect(result).toHaveLength(1);
    expect(result[0]!.unitId).toBe("only-one");
  });

  it("remove TODOS os candidatos cuja unitId coincide com a do alvo, não só o primeiro", () => {
    const target = makeUnit({ unitId: "target" });
    const candidates = [
      makeUnit({ unitId: "target" }),
      makeUnit({ unitId: "other" }),
      makeUnit({ unitId: "target" }),
      makeUnit({ unitId: "target" }),
    ];
    const result = buildCompSet(target, candidates, 10);
    expect(result.some((member) => member.unitId === "target")).toBe(false);
    expect(result).toHaveLength(1);
    expect(result[0]!.unitId).toBe("other");
  });
});

describe("medianCompSetPriceCents", () => {
  it("calcula a mediana correta para quantidade ímpar de membros", () => {
    const units = [10000, 20000, 30000].map((price, i) =>
      makeUnit({ unitId: `u${i}`, currentNightlyPriceCents: price }),
    );
    const profilesById = new Map(units.map((u) => [u.unitId, u]));
    const members = units.map((u) => ({ unitId: u.unitId, similarityScore: 1 }));
    expect(medianCompSetPriceCents(members, profilesById)).toBe(20000);
  });

  it("calcula a mediana correta (média dos dois centrais) para quantidade par de membros", () => {
    const units = [10000, 20000, 30000, 40000].map((price, i) =>
      makeUnit({ unitId: `u${i}`, currentNightlyPriceCents: price }),
    );
    const profilesById = new Map(units.map((u) => [u.unitId, u]));
    const members = units.map((u) => ({ unitId: u.unitId, similarityScore: 1 }));
    expect(medianCompSetPriceCents(members, profilesById)).toBe(25000);
  });

  it("retorna null para comp set vazio, nunca inventa uma âncora", () => {
    expect(medianCompSetPriceCents([], new Map())).toBeNull();
  });

  it("ignora membros órfãos (unitId sem profile correspondente) em vez de contá-los como preço zero", () => {
    const units = [10000, 30000].map((price, i) => makeUnit({ unitId: `u${i}`, currentNightlyPriceCents: price }));
    const profilesById = new Map(units.map((u) => [u.unitId, u]));
    const members = [
      { unitId: "u0", similarityScore: 1 },
      { unitId: "orphan-1", similarityScore: 1 },
      { unitId: "u1", similarityScore: 1 },
      { unitId: "orphan-2", similarityScore: 1 },
    ];
    // se os órfãos contassem como preço zero, a mediana de [0, 0, 10000, 30000] seria 5000 —
    // o valor correto, ignorando-os, é a mediana de [10000, 30000] = 20000.
    expect(medianCompSetPriceCents(members, profilesById)).toBe(20000);
  });
});

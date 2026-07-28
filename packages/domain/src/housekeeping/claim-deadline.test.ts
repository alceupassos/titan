import { civilDate } from "@titan/dates";
import { describe, expect, it } from "vitest";
import {
  NoChannelClaimRuleForDateError,
  OverlappingChannelClaimRuleError,
  computeClaimDeadlineEpochMs,
  isClaimDeadlineAtRisk,
  isClaimDeadlineExpired,
  resolveClaimDeadlineForChannel,
  type ChannelClaimRule,
} from "./claim-deadline";

function makeRule(overrides: Partial<ChannelClaimRule> = {}): ChannelClaimRule {
  return {
    id: "rule-1",
    tenantId: "tenant-1",
    channel: "airbnb",
    deadlineHours: 72,
    validFrom: civilDate("2026-01-01"),
    validTo: civilDate("2026-12-31"),
    ...overrides,
  };
}

describe("resolveClaimDeadlineForChannel", () => {
  it("resolve a regra vigente quando exatamente uma cobre a data", () => {
    const rule = makeRule();
    const resolved = resolveClaimDeadlineForChannel([rule], {
      channel: "airbnb",
      date: civilDate("2026-06-15"),
    });
    expect(resolved).toBe(rule);
  });

  it("lança NoChannelClaimRuleForDateError quando nenhuma regra cobre o canal/data", () => {
    const rule = makeRule({ channel: "booking" });
    expect(() =>
      resolveClaimDeadlineForChannel([rule], { channel: "airbnb", date: civilDate("2026-06-15") }),
    ).toThrow(NoChannelClaimRuleForDateError);
  });

  it("lança OverlappingChannelClaimRuleError quando duas regras cobrem o mesmo canal/data", () => {
    const ruleA = makeRule({ id: "rule-a" });
    const ruleB = makeRule({ id: "rule-b" });
    expect(() =>
      resolveClaimDeadlineForChannel([ruleA, ruleB], {
        channel: "airbnb",
        date: civilDate("2026-06-15"),
      }),
    ).toThrow(OverlappingChannelClaimRuleError);
  });
});

describe("computeClaimDeadlineEpochMs", () => {
  it("calcula o prazo somando deadlineHours em ms ao instante de check-out", () => {
    const rule = makeRule({ deadlineHours: 48 });
    const checkoutEpochMs = 1_000_000_000_000;
    expect(computeClaimDeadlineEpochMs(checkoutEpochMs, rule)).toBe(
      checkoutEpochMs + 48 * 60 * 60 * 1000,
    );
  });
});

describe("isClaimDeadlineAtRisk / isClaimDeadlineExpired", () => {
  const deadline = 1_000_000_000_000;

  it("identifica risco dentro da janela de aviso", () => {
    const now = deadline - 60 * 60 * 1000; // 1h antes do prazo
    expect(isClaimDeadlineAtRisk(deadline, now, 2 * 60 * 60 * 1000)).toBe(true);
  });

  it("fora da janela de aviso não é risco", () => {
    const now = deadline - 10 * 60 * 60 * 1000; // 10h antes do prazo
    expect(isClaimDeadlineAtRisk(deadline, now, 2 * 60 * 60 * 1000)).toBe(false);
  });

  it("prazo já vencido não conta como 'em risco' — é isClaimDeadlineExpired, não isClaimDeadlineAtRisk", () => {
    const now = deadline + 1000;
    expect(isClaimDeadlineAtRisk(deadline, now, 2 * 60 * 60 * 1000)).toBe(false);
    expect(isClaimDeadlineExpired(deadline, now)).toBe(true);
  });

  it("prazo exatamente no instante atual é considerado vencido, não em risco", () => {
    expect(isClaimDeadlineExpired(deadline, deadline)).toBe(true);
    expect(isClaimDeadlineAtRisk(deadline, deadline, 1000)).toBe(false);
  });
});

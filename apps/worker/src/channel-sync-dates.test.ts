import { describe, expect, it } from "vitest";
import { addDaysToCivilDate, civilDateFromEpochMs, civilDateRange, InvalidPgDateRangeError, parsePgDateRange } from "./channel-sync-dates";

describe("civilDateFromEpochMs", () => {
  it("converte epoch ms para data civil UTC", () => {
    expect(civilDateFromEpochMs(Date.UTC(2026, 6, 28, 23, 59))).toBe("2026-07-28");
  });
});

describe("addDaysToCivilDate", () => {
  it("soma dias simples dentro do mesmo mês", () => {
    expect(addDaysToCivilDate("2026-07-28" as never, 3)).toBe("2026-07-31");
  });

  it("atravessa virada de mês/ano corretamente", () => {
    expect(addDaysToCivilDate("2026-12-30" as never, 3)).toBe("2027-01-02");
  });
});

describe("civilDateRange", () => {
  it("gera N datas consecutivas a partir de start, incluindo start", () => {
    expect(civilDateRange("2026-07-28" as never, 3)).toEqual(["2026-07-28", "2026-07-29", "2026-07-30"]);
  });

  it("retorna lista vazia para numDays=0", () => {
    expect(civilDateRange("2026-07-28" as never, 0)).toEqual([]);
  });
});

describe("parsePgDateRange", () => {
  it("parseia o formato padrão [checkin,checkout)", () => {
    expect(parsePgDateRange("[2026-06-01,2026-06-04)")).toEqual({ checkin: "2026-06-01", checkout: "2026-06-04" });
  });

  it("lança InvalidPgDateRangeError para formato inesperado", () => {
    expect(() => parsePgDateRange("bogus")).toThrow(InvalidPgDateRangeError);
  });
});

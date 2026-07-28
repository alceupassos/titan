import { civilDate } from "@titan/dates";
import { describe, expect, it } from "vitest";
import { EmptyOccupancyHistoryError, forecastOccupancyProbability, seasonalityFactor } from "./forecast";

// 2026-01-05 é uma segunda-feira (UTC); 2026-01-03 é sábado.
describe("forecastOccupancyProbability", () => {
  it("calcula a taxa histórica de ocupação no mesmo dia da semana do alvo", () => {
    const history = [
      { date: civilDate("2026-01-05"), occupied: true }, // segunda
      { date: civilDate("2026-01-12"), occupied: true }, // segunda
      { date: civilDate("2026-01-19"), occupied: false }, // segunda
      { date: civilDate("2026-01-03"), occupied: true }, // sábado — dia diferente
    ];
    // 3 segundas no histórico: 2 ocupadas, 1 vaga -> 2/3
    expect(forecastOccupancyProbability(history, civilDate("2026-01-26"))).toBeCloseTo(2 / 3);
  });

  it("cai para a taxa geral do histórico quando não há observação no mesmo dia da semana", () => {
    const history = [
      { date: civilDate("2026-01-05"), occupied: true }, // segunda
      { date: civilDate("2026-01-06"), occupied: false }, // terça
    ];
    // alvo é um domingo (2026-01-04), sem observação de domingo no histórico -> taxa geral 1/2
    expect(forecastOccupancyProbability(history, civilDate("2026-01-04"))).toBeCloseTo(0.5);
  });

  it("lança EmptyOccupancyHistoryError para histórico vazio", () => {
    expect(() => forecastOccupancyProbability([], civilDate("2026-01-05"))).toThrow(EmptyOccupancyHistoryError);
  });

  it("com histórico de uma única observação, retorna 0 ou 1 (nunca NaN)", () => {
    const historyOccupied = [{ date: civilDate("2026-01-05"), occupied: true }]; // segunda
    const historyVacant = [{ date: civilDate("2026-01-05"), occupied: false }];
    // mesmo dia da semana do alvo (segunda) e alvo em outro dia (sábado) — pool é sempre o único
    // elemento (mesmo dow) ou o histórico inteiro (fallback), nunca length 0.
    expect(forecastOccupancyProbability(historyOccupied, civilDate("2026-01-12"))).toBe(1);
    expect(forecastOccupancyProbability(historyVacant, civilDate("2026-01-12"))).toBe(0);
    expect(forecastOccupancyProbability(historyOccupied, civilDate("2026-01-03"))).toBe(1); // sábado, cai no fallback
  });

  it("quando o dow do alvo aparece só uma vez no histórico, usa exatamente essa observação (não é caso especial)", () => {
    const history = [
      { date: civilDate("2026-01-05"), occupied: true }, // segunda — única
      { date: civilDate("2026-01-06"), occupied: false }, // terça
      { date: civilDate("2026-01-13"), occupied: false }, // terça
    ];
    // taxa geral seria 1/3, mas a única segunda está ocupada -> pool = [segunda], resultado 1.
    expect(forecastOccupancyProbability(history, civilDate("2026-01-19"))).toBe(1);
  });

  it("quando TODO o histórico é do mesmo dow do alvo, o resultado bate exatamente com a taxa do histórico inteiro", () => {
    const history = [
      { date: civilDate("2026-01-05"), occupied: true }, // segunda
      { date: civilDate("2026-01-12"), occupied: true }, // segunda
      { date: civilDate("2026-01-19"), occupied: false }, // segunda
    ];
    expect(forecastOccupancyProbability(history, civilDate("2026-01-26"))).toBeCloseTo(2 / 3);
  });

  it("data-alvo em 29/02 de ano bissexto (2028) não quebra dayOfWeek nem produz resultado incorreto", () => {
    const history = [
      { date: civilDate("2028-02-29"), occupied: true }, // ano bissexto real
      { date: civilDate("2028-03-07"), occupied: false }, // exatamente 7 dias depois -> mesmo dow
    ];
    // se getUTCDay() tropeçasse no dia 29/02, o filtro por dow não pareirar essas duas datas com
    // 7 dias exatos de distância -> pool cairia para o histórico inteiro em vez das duas.
    expect(forecastOccupancyProbability(history, civilDate("2028-02-29"))).toBeCloseTo(0.5);
  });
});

describe("seasonalityFactor", () => {
  it("retorna fator > 1 quando o dia da semana do alvo ocupa mais que a média geral", () => {
    const history = [
      { date: civilDate("2026-01-05"), occupied: true }, // segunda
      { date: civilDate("2026-01-12"), occupied: true }, // segunda
      { date: civilDate("2026-01-06"), occupied: false }, // terça
      { date: civilDate("2026-01-13"), occupied: false }, // terça
    ];
    // geral: 2/4 = 0.5; segunda: 2/2 = 1 -> fator 2
    expect(seasonalityFactor(history, civilDate("2026-01-19"))).toBeCloseTo(2);
  });

  it("retorna 1 (neutro) quando a taxa geral é zero", () => {
    const history = [{ date: civilDate("2026-01-05"), occupied: false }];
    expect(seasonalityFactor(history, civilDate("2026-01-05"))).toBe(1);
  });

  it("lança EmptyOccupancyHistoryError para histórico vazio", () => {
    expect(() => seasonalityFactor([], civilDate("2026-01-05"))).toThrow(EmptyOccupancyHistoryError);
  });

  it("com histórico de uma única observação, retorna fator sensato (nunca NaN)", () => {
    const history = [{ date: civilDate("2026-01-05"), occupied: true }]; // segunda
    // dow do alvo == único dow do histórico -> dowRate == overallRate == 1 -> fator 1.
    expect(seasonalityFactor(history, civilDate("2026-01-12"))).toBe(1);
  });

  it("retorna exatamente 1 (não só aproximadamente) quando a taxa do dow do alvo é igual à taxa geral," +
    " mesmo vindo de frações com denominadores diferentes", () => {
    const history = [
      { date: civilDate("2026-01-05"), occupied: true }, // segunda
      { date: civilDate("2026-01-12"), occupied: true }, // segunda
      { date: civilDate("2026-01-19"), occupied: false }, // segunda
      { date: civilDate("2026-01-06"), occupied: true }, // terça
      { date: civilDate("2026-01-13"), occupied: true }, // terça
      { date: civilDate("2026-01-20"), occupied: false }, // terça
    ];
    // segunda: 2/3; geral: 4/6 = 2/3 — mesma razão real, denominadores diferentes. Divisão IEEE-754
    // é corretamente arredondada, então o quociente é bit-a-bit idêntico a 1, não "próximo de 1".
    expect(seasonalityFactor(history, civilDate("2026-01-26"))).toBe(1);
  });

  it("data-alvo em 29/02 de ano bissexto (2028) não quebra o cálculo de sazonalidade", () => {
    const history = [
      { date: civilDate("2028-02-29"), occupied: true },
      { date: civilDate("2028-03-07"), occupied: false }, // exatamente 7 dias depois -> mesmo dow
      { date: civilDate("2028-03-01"), occupied: true }, // outro dow
    ];
    // dow do alvo: 1 ocupado de 2 -> 0.5; geral: 2 ocupados de 3 -> 2/3; fator = 0.5 / (2/3) = 0.75.
    expect(seasonalityFactor(history, civilDate("2028-02-29"))).toBeCloseTo(0.75);
  });
});

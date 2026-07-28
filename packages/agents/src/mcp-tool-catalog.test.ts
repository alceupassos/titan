import { describe, expect, it } from "vitest";
import {
  BLOCKED_TOOLS,
  EXPOSED_TOOL_CATALOG,
  FINANCIAL_EXECUTION_TOOL_NAMES,
  NARROW_WRITE_TOOLS,
  READ_TOOLS,
  WRITE_TOOL_NAMES,
  isToolExposed,
} from "./mcp-tool-catalog";

describe("EXPOSED_TOOL_CATALOG", () => {
  it("nunca inclui nenhuma ferramenta bloqueada", () => {
    const exposedNames = new Set(EXPOSED_TOOL_CATALOG.map((t) => t.name));
    for (const blocked of BLOCKED_TOOLS) {
      expect(exposedNames.has(blocked.name)).toBe(false);
    }
  });

  it("inclui todas as ferramentas de leitura e escrita estreita", () => {
    expect(EXPOSED_TOOL_CATALOG).toHaveLength(READ_TOOLS.length + NARROW_WRITE_TOOLS.length);
  });

  it("isToolExposed confirma presença/ausência corretamente", () => {
    expect(isToolExposed("occupancy_report")).toBe(true);
    expect(isToolExposed("draft_message")).toBe(true);
    expect(isToolExposed("raw_sql")).toBe(false);
    expect(isToolExposed("issue_nfse")).toBe(false);
  });
});

describe("WRITE_TOOL_NAMES", () => {
  it("contém só as ferramentas de escrita estreita, nunca as de leitura", () => {
    for (const tool of NARROW_WRITE_TOOLS) {
      expect(WRITE_TOOL_NAMES.has(tool.name)).toBe(true);
    }
    for (const tool of READ_TOOLS) {
      expect(WRITE_TOOL_NAMES.has(tool.name)).toBe(false);
    }
  });
});

describe("FINANCIAL_EXECUTION_TOOL_NAMES", () => {
  it("é um subconjunto das ferramentas bloqueadas — execução financeira nunca é exposta", () => {
    const blockedNames = new Set(BLOCKED_TOOLS.map((t) => t.name));
    for (const name of FINANCIAL_EXECUTION_TOOL_NAMES) {
      expect(blockedNames.has(name)).toBe(true);
    }
  });
});

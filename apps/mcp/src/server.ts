// titan-mcp-dev — catálogo de desenvolvimento, banco local/sintético, consumido por subagentes
// de build (docs/adr/0017-mcps-instalados.md). NUNCA aponta para produção; titan-mcp-prod
// (catálogo restrito da seção 9.12.4, só para o Hermes no plano operador) é um servidor
// separado, criado na Fase 10 — não reusar este processo para isso.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "titan-mcp-dev",
  version: "0.0.0",
});

// Ferramenta de exemplo — prova a forma. Ferramentas reais de leitura/escrita (seção 9.12.4)
// nascem na Fase 10, com o redaction de PII e os caps de valor descritos lá.
server.tool(
  "healthcheck",
  "Confirma que o titan-mcp-dev está no ar e respondendo.",
  { echo: z.string().optional() },
  async ({ echo }) => ({
    content: [{ type: "text", text: `titan-mcp-dev ok${echo ? ` — echo: ${echo}` : ""}` }],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[titan-mcp-dev] conectado via stdio");
}

main().catch((err) => {
  console.error("[titan-mcp-dev] falha ao iniciar:", err);
  process.exit(1);
});

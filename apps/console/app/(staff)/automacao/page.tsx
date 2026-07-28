// Console de agentes — DESIGN.md "Agent Action Badge": toda ação de agente rotulada
// (`agent:<nome> v<versão>`), nunca auto-executando consequência financeira/fiscal (PRODUCT.md
// Positioning). Casca apenas; catálogo `titan-mcp` real chega em F10.
import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function AutomacaoPage() {
  return (
    <div className="p-6">
      <PageHeader title="Automação" description="Console de agentes — o modelo propõe, o humano decide." />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Ações propostas por agentes" value="0" state="empty" />
      </div>
      <EmptyState message="Nenhum agente ativo ainda — catálogo titan-mcp chega em F10." />
    </div>
  );
}

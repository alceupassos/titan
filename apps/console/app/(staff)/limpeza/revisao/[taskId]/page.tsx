// Painel de revisão fotográfica — I10 (evidência append-only, sem rota de exclusão para papel
// algum). Casca apenas; a captura/verificação de cadeia de hash real chega em F6.
import { DetailPlaceholder } from "@/components/DetailPlaceholder";
import { PageHeader } from "@/components/PageHeader";

export default async function RevisaoLimpezaPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return (
    <div className="p-6">
      <PageHeader title="Revisão fotográfica" description="Evidência da tarefa de limpeza (I10)." />
      <DetailPlaceholder kind="tarefa de limpeza" id={taskId} />
    </div>
  );
}

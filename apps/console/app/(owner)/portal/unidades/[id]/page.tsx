import { DetailPlaceholder } from "@/components/DetailPlaceholder";
import { PageHeader } from "@/components/PageHeader";

export default async function PortalUnidadeDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-6">
      <PageHeader title="Unidade" description="Desempenho e histórico desta unidade." />
      <DetailPlaceholder kind="unidade" id={id} />
    </div>
  );
}

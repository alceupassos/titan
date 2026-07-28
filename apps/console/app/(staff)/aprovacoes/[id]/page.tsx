import { DetailPlaceholder } from "@/components/DetailPlaceholder";
import { PageHeader } from "@/components/PageHeader";

export default async function AprovacaoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-6">
      <PageHeader title="Aprovação" description="Item da fila central de aprovações." />
      <DetailPlaceholder kind="aprovação" id={id} />
    </div>
  );
}

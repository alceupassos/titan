import { DetailPlaceholder } from "@/components/DetailPlaceholder";
import { PageHeader } from "@/components/PageHeader";

export default async function PrestadorDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-6">
      <PageHeader title="Prestador" description="Cadastro, certidões, scorecard, ordens de serviço." />
      <DetailPlaceholder kind="prestador" id={id} />
    </div>
  );
}

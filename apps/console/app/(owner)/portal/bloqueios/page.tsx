import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function PortalBloqueiosPage() {
  return (
    <div className="p-6">
      <PageHeader title="Bloqueios" description="Datas bloqueadas por uso do proprietário, manutenção ou obra." />
      <EmptyState message="Nenhum bloqueio cadastrado." />
    </div>
  );
}

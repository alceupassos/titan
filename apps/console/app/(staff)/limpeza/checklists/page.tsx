import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function ChecklistsPage() {
  return (
    <div className="p-6">
      <PageHeader title="Checklists" description="Editor de templates versionados de limpeza." />
      <EmptyState message="Nenhum template de checklist cadastrado ainda." />
    </div>
  );
}

import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function InboxPage() {
  return (
    <div className="p-6">
      <PageHeader title="Inbox" description="Omnichannel — site, WhatsApp, e-mail, OTAs." />
      <EmptyState message="Nenhuma conversa nesta fase." />
    </div>
  );
}

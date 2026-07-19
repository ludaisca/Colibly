import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function BotsLoading() {
  return (
    <ListPageSkeleton
      title="Bots IA"
      description="Configura bots con IA para responder automáticamente mensajes de WhatsApp."
      rows={5}
    />
  );
}

import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function MetaAdsLoading() {
  return (
    <ListPageSkeleton
      title="Meta Ads"
      description="Cuentas de Página/Business para el feedback loop de calificación de leads (Instant Forms + click-to-WhatsApp)."
      rows={3}
    />
  );
}

import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function MetaAdsLoading() {
  return (
    <ListPageSkeleton
      title="Meta Ads"
      description="Cuentas para el feedback loop de calificación de leads hacia Meta."
      rows={3}
    />
  );
}

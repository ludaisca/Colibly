import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function MetaAdsLoading() {
  return (
    <ListPageSkeleton
      title="Meta Ads"
      description="Páginas que reciben leads de anuncios; le avisamos a Meta cuáles resultaron buenos."
      rows={3}
    />
  );
}

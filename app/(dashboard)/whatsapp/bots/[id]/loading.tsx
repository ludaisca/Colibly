import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function BotDetailLoading() {
  return (
    <DetailPageSkeleton
      backLabel="Volver a bots"
      maxWidth="max-w-3xl"
      cardLines={[4, 3]}
    />
  );
}

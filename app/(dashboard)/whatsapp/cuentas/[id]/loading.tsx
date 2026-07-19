import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function CuentaDetailLoading() {
  return (
    <DetailPageSkeleton
      backLabel="Volver"
      maxWidth="max-w-2xl"
      cardLines={[4, 3, 2]}
    />
  );
}

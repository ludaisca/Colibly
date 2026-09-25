import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function PlanLoading() {
  return <DetailPageSkeleton title="Plan y facturación" description="Tu plan, el consumo del mes y tus pagos." cardLines={[2, 3, 3, 4]} />;
}

import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function MiDiaLoading() {
  return <ListPageSkeleton title="Mi día" description="Tareas, citas y conversaciones que esperan respuesta." rows={6} />;
}

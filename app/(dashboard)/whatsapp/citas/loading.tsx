import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function CitasLoading() {
  return (
    <ListPageSkeleton
      title="Citas"
      description="Agenda de citas por contacto — recordatorios automáticos incluidos."
      rows={7}
    />
  );
}

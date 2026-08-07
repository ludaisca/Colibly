import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function WebchatCuentasLoading() {
  return (
    <ListPageSkeleton
      title="Cuentas Web"
      description="Widget de chat en vivo embebible en tu sitio web — el visitante escribe sin necesitar cuenta, la conversación llega al mismo inbox."
      rows={4}
    />
  );
}

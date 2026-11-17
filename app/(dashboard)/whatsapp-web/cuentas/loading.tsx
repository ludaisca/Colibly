import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function WhatsappWebCuentasLoading() {
  return <ListPageSkeleton title="WhatsApp por QR" description="Números vinculados escaneando un código QR." rows={3} />;
}

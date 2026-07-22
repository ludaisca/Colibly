import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function TelegramCuentasLoading() {
  return (
    <ListPageSkeleton
      title="Cuentas Telegram"
      description="Administra los bots de Telegram conectados."
      rows={4}
    />
  );
}

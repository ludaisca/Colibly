"use client";

import { TelegramIcon } from "@/app/components/ui/channel-icons";
import { ChannelAccountsPage } from "@/app/components/channel-accounts/accounts-page";
import { TelegramCuentaFormModal } from "./_form";

export default function Page() {
  return (
    <ChannelAccountsPage
      config={{
        slug: "telegram",
        title: "Cuentas Telegram",
        icon: TelegramIcon,
        feminine: false,
        connectLabel: "Conectar bot",
        deletedToast: "Bot desconectado correctamente",
        emptyTitle: "Sin bots conectados",
        emptyDescription: "No has conectado ningún bot de Telegram. Crea uno con @BotFather y conéctalo aquí.",
        rowSubtitle: "Bot de Telegram",
        deleteTitle: "Desconectar bot",
        deleteDescription: "Esta acción eliminará permanentemente el bot y todos sus chats y mensajes asociados. No se puede deshacer.",
        FormModal: TelegramCuentaFormModal,
      }}
    />
  );
}

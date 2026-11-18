"use client";

import { MessengerIcon } from "@/app/components/ui/channel-icons";
import { ChannelAccountsPage } from "@/app/components/channel-accounts/accounts-page";
import { MessengerCuentaFormModal } from "./_form";

export default function Page() {
  return (
    <ChannelAccountsPage
      config={{
        slug: "messenger",
        title: "Cuentas Messenger",
        icon: MessengerIcon,
        feminine: true,
        connectLabel: "Conectar Página",
        deletedToast: "Página desconectada correctamente",
        emptyTitle: "Sin Páginas conectadas",
        emptyDescription: "No has conectado ninguna Página de Facebook para Messenger. Conéctala desde Meta for Developers y agrégala aquí.",
        rowSubtitle: "Página de Messenger",
        deleteTitle: "Desconectar Página",
        deleteDescription: "Esta acción eliminará permanentemente la Página y todos sus chats y mensajes asociados. No se puede deshacer.",
        FormModal: MessengerCuentaFormModal,
      }}
    />
  );
}

"use client";

import { InstagramIcon } from "@/app/components/ui/channel-icons";
import { ChannelAccountsPage } from "@/app/components/channel-accounts/accounts-page";
import { InstagramCuentaFormModal } from "./_form";

export default function Page() {
  return (
    <ChannelAccountsPage
      config={{
        slug: "instagram",
        title: "Cuentas Instagram",
        icon: InstagramIcon,
        feminine: true,
        connectLabel: "Conectar cuenta",
        deletedToast: "Cuenta desconectada correctamente",
        emptyTitle: "Sin cuentas conectadas",
        emptyDescription: "No has conectado ninguna cuenta de Instagram. Debe estar vinculada a una Página de Facebook (modelo clásico) — conéctala desde Meta for Developers y agrégala aquí.",
        rowSubtitle: "Cuenta de Instagram",
        deleteTitle: "Desconectar cuenta",
        deleteDescription: "Esta acción eliminará permanentemente la cuenta y todos sus chats y mensajes asociados. No se puede deshacer.",
        FormModal: InstagramCuentaFormModal,
      }}
    />
  );
}

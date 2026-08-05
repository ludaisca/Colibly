"use client";

import { MetaChannelAccountFormModal } from "@/app/components/meta-messaging/account-form-modal";

// Wrapper fino — toda la lógica vive en el modal compartido con Instagram.
interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function MessengerCuentaFormModal(props: Props) {
  return <MetaChannelAccountFormModal channel="MESSENGER" {...props} />;
}

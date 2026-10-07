"use client";

import { useState } from "react";
import { Sheet, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/app/components/kit/sheet";
import { ContactPanel } from "@/app/components/crm/contact-panel";

// Cajón con la ficha del contacto (desde Contactos, Ventas y la bandeja en
// pantallas angostas). El contenido es `ContactPanel`, el mismo que la bandeja
// muestra fijo a la derecha en pantallas anchas.
export function ContactDrawer({
  contactId,
  onClose,
  onUpdated,
}: {
  contactId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [title, setTitle] = useState("Contacto");
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <Sheet defaultOpen modal={!dialogOpen} onOpenChangeComplete={(open) => { if (!open) onClose(); }}>
      <SheetPopup side="right" className="max-w-md">
        <SheetHeader className="border-b pb-4 pr-14">
          <SheetTitle className="truncate text-base">{title}</SheetTitle>
        </SheetHeader>
        <SheetPanel className="p-0">
          <ContactPanel contactId={contactId} onUpdated={onUpdated} onTitle={setTitle} onModalOpenChange={setDialogOpen} />
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}

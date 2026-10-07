"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { TriangleAlert } from "lucide-react";
import { Alert } from "@/app/components/kit/alert";
import { Button } from "@/app/components/kit/button";
import { Dialog, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle, DialogDescription } from "@/app/components/kit/dialog";
import { Field, FieldLabel } from "@/app/components/kit/field";
import { Input } from "@/app/components/kit/input";
import { useToast } from "@/app/components/ui/toast";
import { EntityPicker, createCompanyOption, searchCompanies, type PickerOption } from "@/app/components/crm/entity-picker";
import { SimpleSelect } from "@/app/components/crm/simple-select";
import { useTeam } from "@/app/components/crm/use-crm-lookups";

// Alta de un contacto. Si ya hay alguien con ese correo o teléfono (52…/521…
// cuentan igual) el servidor lo avisa y aquí se muestra con un enlace: se puede
// abrir el existente o crear de todos modos.

interface Match {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  reasons: string[];
}

export const LIFECYCLE_OPTIONS = [
  { value: "LEAD", label: "Prospecto" },
  { value: "CUSTOMER", label: "Cliente" },
];

export function PersonFormDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (personId: string) => void }) {
  const { success } = useToast();
  const { data: session } = useSession();
  const canAssign = session?.user?.role !== "ejecutivo";
  const team = useTeam(open && canAssign);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState<PickerOption | null>(null);
  const [ownerId, setOwnerId] = useState("");
  const [lifecycle, setLifecycle] = useState("LEAD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicio del formulario al abrirlo
    setName(""); setPhone(""); setEmail(""); setJobTitle(""); setCompany(null); setOwnerId(""); setLifecycle("LEAD"); setError(""); setMatches([]);
  }, [open]);

  async function submit(allowDuplicate = false) {
    setError("");
    if (!name.trim()) return setError("Indica el nombre");
    setSaving(true);
    try {
      const res = await fetch("/api/crm/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          jobTitle: jobTitle.trim() || null,
          companyId: company?.id ?? null,
          ...(canAssign && ownerId ? { ownerId } : {}),
          lifecycle,
          ...(allowDuplicate ? { allowDuplicate: true } : {}),
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === "duplicate_person") {
        setMatches(data.matches ?? []);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el contacto");
      success("Contacto creado");
      onCreated(data.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el contacto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogPopup>
        <form onSubmit={(e) => { e.preventDefault(); void submit(false); }} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Nuevo contacto</DialogTitle>
            <DialogDescription>Una persona de tu directorio. Sus chats se vinculan solos cuando escriba por un canal conectado.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-4">
              {error && <Alert variant="error">{error}</Alert>}
              {matches.length > 0 && (
                <Alert variant="warning">
                  <TriangleAlert />
                  <div className="space-y-2">
                    <p className="font-medium">Ya existe alguien con ese correo o teléfono</p>
                    <ul className="space-y-1">
                      {matches.map((m) => (
                        <li key={m.id} className="text-sm">
                          <Link href={`/contactos/${m.id}`} className="font-medium underline underline-offset-2" onClick={onClose}>{m.name}</Link>
                          <span className="text-muted-foreground"> · coincide {m.reasons.map((r) => (r === "email" ? "el correo" : "el teléfono")).join(" y ")}</span>
                        </li>
                      ))}
                    </ul>
                    <Button type="button" size="sm" variant="outline" loading={saving} onClick={() => void submit(true)}>Crear de todos modos</Button>
                  </div>
                </Alert>
              )}
              <Field>
                <FieldLabel>Nombre</FieldLabel>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus placeholder="Nombre y apellido" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Teléfono</FieldLabel>
                  <Input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setMatches([]); }} maxLength={40} placeholder="+52 55 1234 5678" />
                </Field>
                <Field>
                  <FieldLabel>Correo</FieldLabel>
                  <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setMatches([]); }} maxLength={254} placeholder="nombre@empresa.com" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Puesto</FieldLabel>
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={120} />
                </Field>
                <Field>
                  <FieldLabel>Tipo</FieldLabel>
                  <SimpleSelect ariaLabel="Tipo de contacto" value={lifecycle} onChange={setLifecycle} options={LIFECYCLE_OPTIONS} />
                </Field>
              </div>
              <Field>
                <FieldLabel>Empresa</FieldLabel>
                <div className="w-full"><EntityPicker ariaLabel="Empresa" value={company} onChange={setCompany} search={searchCompanies} onCreate={createCompanyOption} placeholder="Buscar o crear empresa" /></div>
              </Field>
              {canAssign && (
                <Field>
                  <FieldLabel>Responsable</FieldLabel>
                  <SimpleSelect ariaLabel="Responsable" value={ownerId} onChange={setOwnerId} options={[{ value: "", label: "Sin responsable" }, ...team.map((u) => ({ value: u.id, label: u.name ?? u.email }))]} />
                </Field>
              )}
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" loading={saving}>Crear contacto</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

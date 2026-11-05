"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { PlanId } from "@prisma/client";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Banner } from "@/app/components/ui/banner";
import { Checkbox } from "@/app/components/ui/checkbox";
import { FormField } from "@/app/components/ui/form-field";
import { useToast } from "@/app/components/ui/toast";
import { formatMxn, PLANS } from "@/lib/billing/plans";
import { LicenseSelect, needsPurchase, type LicenseStateView } from "./_licenses";

interface Props {
  user: { id: string; name: string | null; email: string; license: PlanId } | null;
  licenses: LicenseStateView | null;
  onClose: () => void;
  onChanged: () => void;
}

// Cambiar la licencia de una persona (PATCH /api/usuarios/[id]/licencia):
// avisa lo que deja de funcionar y, sin licencia libre, ofrece comprarla.
export function LicenseModal({ user, licenses, onClose, onChanged }: Props) {
  const { success } = useToast();
  // El padre lo monta con key = id de la persona: el estado arranca limpio.
  const [license, setLicense] = useState<PlanId>(user?.license ?? "PRO");
  const [adjustBilling, setAdjustBilling] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  const purchase = !!user && license !== user.license && needsPurchase(licenses, license);
  const canBuy = purchase && !!licenses?.hasSubscription;

  async function submit(confirm: boolean) {
    if (!user) return;
    setSaving(true);
    setError("");
    setInvoiceUrl(null);
    try {
      const res = await fetch(`/api/usuarios/${user.id}/licencia`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license, confirm, adjustBilling: canBuy ? adjustBilling : true }),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === "confirm_required") {
        setWarnings(data.impact?.warnings ?? [data.error]);
        return;
      }
      if (res.status === 402 && data.code === "payment_pending") {
        setError(data.error);
        setInvoiceUrl(data.invoiceUrl ?? null);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "No se pudo cambiar la licencia");
      success(`${user.name ?? user.email} ahora tiene licencia ${PLANS[license].name}`);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la licencia");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`Licencia de ${user?.name ?? user?.email ?? ""}`}
      description="Define sus funciones, sus créditos de IA y el plan con el que funcionan los canales de los que es dueña."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {warnings ? (
            <Button loading={saving} onClick={() => submit(true)}>
              Confirmar cambio
            </Button>
          ) : (
            <Button loading={saving} disabled={!user || license === user.license || (purchase && !canBuy)} onClick={() => submit(false)}>
              Cambiar licencia
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <Banner tone="danger">
            {error}
            {invoiceUrl && (
              <div className="mt-2">
                <Button size="sm" href={invoiceUrl} external icon={ExternalLink}>
                  Pagar la factura
                </Button>
              </div>
            )}
          </Banner>
        )}
        <FormField label="Licencia">
          {(id) => (
            <LicenseSelect
              id={id}
              value={license}
              onChange={(l) => {
                setLicense(l);
                setWarnings(null);
              }}
              state={licenses}
            />
          )}
        </FormField>
        {purchase && canBuy && (
          <Checkbox
            checked={adjustBilling}
            onChange={setAdjustBilling}
            label={`Agregar una licencia ${PLANS[license].name} (${formatMxn(PLANS[license].pricePerSeatMxn)}/mes, Stripe prorratea) y dejar de pagar la ${PLANS[user!.license].name} que queda libre`}
          />
        )}
        {purchase && !canBuy && (
          <Banner tone="warning">
            No hay licencias {PLANS[license].name} libres.{" "}
            <a href="/configuracion/plan#licencias" className="font-medium underline underline-offset-2">Contrátalas en Plan y facturación</a>.
          </Banner>
        )}
        {warnings && (
          <Banner tone="warning">
            <p className="text-sm font-medium">Al cambiar la licencia:</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">La configuración se conserva y vuelve a funcionar si recupera la licencia.</p>
          </Banner>
        )}
      </div>
    </Modal>
  );
}

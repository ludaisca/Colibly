"use client";

import { useCallback, useState } from "react";
import type { PlanId } from "@prisma/client";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/select";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { Badge } from "@/app/components/ui/badge";
import { Spinner } from "@/app/components/ui/spinner";
import { useToast } from "@/app/components/ui/toast";
import { PLANS } from "@/lib/billing/plans";
import { useRunOnChange } from "@/app/components/ui/use-run-on-change";

export interface ChannelOwnerInfo {
  id: string;
  name: string | null;
  email: string;
  license: PlanId;
  disabledAt: string | null;
}

/** Plan con el que funciona el canal: el de su dueño; sin dueño activo, Básico. */
export function ChannelOwnerBadge({ owner }: { owner: ChannelOwnerInfo | null | undefined }) {
  if (!owner || owner.disabledAt) {
    return (
      <Badge tone="warning" size="sm">
        Sin titular · Básico
      </Badge>
    );
  }
  return (
    <Badge tone={owner.license === "PRO" ? "accent" : owner.license === "BUSINESS" ? "info" : "neutral"} size="sm">
      {PLANS[owner.license].name} · {owner.name ?? owner.email}
    </Badge>
  );
}

interface Candidate {
  id: string;
  name: string;
  email: string;
  license: PlanId;
  ownsOtherOfType: string | null;
}

// Cambiar el dueño de un canal (GET/PATCH /api/canales/dueno). El canal
// funciona con la licencia de su dueño; una persona es dueña de a lo más un
// canal de cada tipo. Solo admin.
export function ChannelOwnerModal({
  open,
  onClose,
  kind,
  account,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  kind: "whatsapp" | "channel";
  account: { id: string; name: string } | null;
  onChanged: () => void;
}) {
  const { success } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [currentOwner, setCurrentOwner] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/canales/dueno?kind=${kind}&accountId=${encodeURIComponent(account.id)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar la persona titular");
      setCandidates(data.candidates);
      setCurrentOwner(data.account.ownerId);
      setChosen(data.account.ownerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la persona titular");
    } finally {
      setLoading(false);
    }
  }, [account, kind]);

  useRunOnChange(() => {
    if (open) void load();
  }, [open, load]);

  async function save() {
    if (!account) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/canales/dueno", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, accountId: account.id, ownerId: chosen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cambiar la persona titular");
      success(chosen ? "Titular actualizado" : "El canal quedó sin titular (funciona como Básico)");
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la persona titular");
    } finally {
      setSaving(false);
    }
  }

  const selected = candidates.find((c) => c.id === chosen) ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Titular de ${account?.name ?? "el canal"}`}
      description="El canal funciona con la licencia de su titular: bots, difusiones, automatizaciones y lo demás dependen de ese plan. Cada licencia incluye un canal de cada tipo."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} disabled={loading || chosen === currentOwner || !!selected?.ownsOtherOfType} onClick={save}>
            Guardar
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          {error && <Banner tone="danger">{error}</Banner>}
          <FormField label="Titular" hint="Sin titular, el canal funciona como Básico (sin bots, difusiones ni automatizaciones).">
            {(id) => (
              <Select id={id} value={chosen ?? ""} onChange={(e) => setChosen(e.target.value || null)}>
                <option value="">Sin titular (Básico)</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {PLANS[c.license].name}
                    {c.ownsOtherOfType ? ` · ya es titular de ${c.ownsOtherOfType}` : ""}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          {selected?.ownsOtherOfType && (
            <Banner tone="warning">
              {selected.name} ya es titular de «{selected.ownsOtherOfType}», del mismo tipo. Cada licencia incluye uno de cada tipo: cambia o quita el dueño de ese canal primero.
            </Banner>
          )}
        </div>
      )}
    </Modal>
  );
}

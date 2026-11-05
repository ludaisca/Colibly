"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlanId } from "@prisma/client";
import { Select } from "@/app/components/ui/select";
import { LICENSE_ORDER, type CatalogMode, type LicenseCounts } from "@/lib/billing/licenses";
import { formatMxn, PLANS } from "@/lib/billing/plans";

// Licencias de la organización para /usuarios: contratadas, asignadas (personas
// activas + invitaciones) y libres por plan (GET /api/billing/licenses).

export interface LicenseStateView {
  mode: CatalogMode;
  trialing: boolean;
  hasSubscription: boolean;
  isInternal: boolean;
  legacyUntil: string | null;
  purchased: LicenseCounts;
  assigned: LicenseCounts;
  free: LicenseCounts;
  overAssigned: LicenseCounts;
  suggested: PlanId;
  trialMaxUsers: number;
}

export function useLicenseState(enabled = true) {
  const [state, setState] = useState<LicenseStateView | null>(null);
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/licenses", { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } catch {
      // Sin el dato la pantalla sigue: el servidor valida igual.
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    if (enabled) void reload();
  }, [enabled, reload]);
  return { state, reload };
}

/** ¿Hace falta comprar para asignar esta licencia? (prueba e internas: no). */
export function needsPurchase(state: LicenseStateView | null, license: PlanId): boolean {
  if (!state || state.isInternal || state.mode !== "license") return false;
  if (state.trialing && !state.hasSubscription) return false;
  return state.free[license] < 1;
}

function optionLabel(state: LicenseStateView | null, id: PlanId): string {
  const base = `${PLANS[id].name} · ${formatMxn(PLANS[id].pricePerSeatMxn)}/mes`;
  if (!state || state.isInternal || state.mode !== "license" || (state.trialing && !state.hasSubscription)) return base;
  const free = state.free[id];
  return `${base} · ${free === 0 ? "sin libres" : free === 1 ? "1 libre" : `${free} libres`}`;
}

export function LicenseSelect({
  id,
  value,
  onChange,
  state,
}: {
  id: string;
  value: PlanId;
  onChange: (license: PlanId) => void;
  state: LicenseStateView | null;
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value as PlanId)}>
      {[...LICENSE_ORDER].reverse().map((p) => (
        <option key={p} value={p}>
          {optionLabel(state, p)}
        </option>
      ))}
    </Select>
  );
}

/** Texto de ayuda bajo el selector. */
export function licenseHint(state: LicenseStateView | null): string {
  if (!state) return "Cada persona paga una licencia; define sus funciones y sus créditos de IA.";
  if (state.isInternal) return "Cuenta interna: sin cobro.";
  if (state.mode === "legacy") return "Tu organización conserva el plan anterior: la licencia se aplicará al pasarte a licencias.";
  if (state.trialing && !state.hasSubscription) return `En la prueba gratis cualquier licencia vale, hasta ${state.trialMaxUsers} personas.`;
  return "Cada persona ocupa una licencia de su plan. Sin licencias libres, agrégalas en Plan y facturación.";
}

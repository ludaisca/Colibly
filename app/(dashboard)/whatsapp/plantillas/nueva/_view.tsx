"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner } from "@/app/components/ui/banner";
import { Spinner } from "@/app/components/ui/spinner";
import { Button } from "@/app/components/ui/button";
import { DetailPage } from "@/app/components/ui/detail-page";
import { TemplateForm } from "../_form";

interface Account { id: string; name: string; channel: string; wabaId: string | null }

export function TemplateCreatePage({ defaultAccountId }: { defaultAccountId: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/whatsapp/accounts")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error(data.error ?? "No se pudieron cargar las cuentas");
        return data as Account[];
      })
      .then((data) => setAccounts(data.filter((account) => account.channel === "WHATSAPP" && !!account.wabaId)))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudieron cargar las cuentas"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial; loadAccounts también se usa al reintentar
    loadAccounts();
  }, [loadAccounts]);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error || accounts.length === 0) return (
    <DetailPage backHref="/whatsapp/plantillas" backLabel="Volver a plantillas" title="Crear plantilla">
      <Banner tone={error ? "danger" : "warning"}>
        {error ?? "Conecta una cuenta de WhatsApp con WABA ID antes de crear una plantilla."}
      </Banner>
      <div className="mt-4">
        {error
          ? <Button variant="secondary" onClick={loadAccounts}>Reintentar</Button>
          : <Button href="/whatsapp/cuentas" variant="secondary">Ver cuentas WhatsApp</Button>}
      </div>
    </DetailPage>
  );

  const selected = accounts.some((account) => account.id === defaultAccountId)
    ? defaultAccountId
    : accounts.length === 1 ? accounts[0].id : "";
  return <TemplateForm accounts={accounts} defaultAccountId={selected} />;
}

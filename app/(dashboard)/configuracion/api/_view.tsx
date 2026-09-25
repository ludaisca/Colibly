"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DetailPage } from "@/app/components/ui/detail-page";
import { useToast } from "@/app/components/ui/toast";
import { ApiKeysSection } from "./_api-keys";
import { WebhooksSection } from "./_webhooks";
import { ApiDocsSection } from "./_docs";
import type { IntegrationAccount } from "./_shared";

const TABS = [
  { id: "keys", label: "API keys" },
  { id: "webhooks", label: "Webhooks" },
  { id: "docs", label: "Documentación" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function ApiIntegrationsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { error: toastError } = useToast();
  const initial = searchParams.get("tab");
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initial) ? (initial as TabId) : "keys");
  const [accounts, setAccounts] = useState<IntegrationAccount[]>([]);

  useEffect(() => {
    fetch("/api/configuracion/integration-accounts")
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setAccounts(d) : toastError(d.error ?? "Error al cargar cuentas")))
      .catch(() => toastError("Error al cargar cuentas"));
  }, [toastError]);

  function changeTab(id: string) {
    setTab(id as TabId);
    router.replace(`/configuracion/api?tab=${id}`, { scroll: false });
  }

  return (
    <DetailPage
      backHref="/configuracion"
      backLabel="Volver a configuración"
      title="API e integraciones"
      description="Conecta SunflowCRM con tu ERP, tienda, Zapier/Make o tus propios sistemas."
      maxWidth="max-w-4xl"
      tabs={TABS as unknown as { id: string; label: string }[]}
      activeTab={tab}
      onTabChange={changeTab}
    >
      {tab === "keys" && <ApiKeysSection accounts={accounts} />}
      {tab === "webhooks" && <WebhooksSection accounts={accounts} />}
      {tab === "docs" && <ApiDocsSection />}
    </DetailPage>
  );
}

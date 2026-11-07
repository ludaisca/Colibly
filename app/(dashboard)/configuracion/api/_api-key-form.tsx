"use client";

import { useState } from "react";
import { Modal } from "@/app/components/ui/modal";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import { Checkbox } from "@/app/components/ui/checkbox";
import { FormField } from "@/app/components/ui/form-field";
import { Banner } from "@/app/components/ui/banner";
import { SecretField } from "@/app/components/integrations/secret-field";
import { API_SCOPES, type ApiScope } from "@/lib/api/scopes";
import { AccountScopeField, splitAccountIds, type IntegrationAccount } from "./_shared";

const DEFAULT_SCOPES: ApiScope[] = ["contacts:read", "conversations:read"];

export function ApiKeyFormModal({
  open,
  onClose,
  onCreated,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  accounts: IntegrationAccount[];
}) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(DEFAULT_SCOPES);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  function reset() {
    setName("");
    setScopes(DEFAULT_SCOPES);
    setAccountIds([]);
    setExpiresInDays("");
    setError("");
    setSecret(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function toggleScope(scope: ApiScope, checked: boolean) {
    setScopes((prev) => (checked ? [...prev, scope] : prev.filter((s) => s !== scope)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("El nombre es requerido");
    if (scopes.length === 0) return setError("Elige al menos un permiso");
    setSaving(true);
    try {
      const res = await fetch("/api/configuracion/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scopes,
          ...splitAccountIds(accountIds, accounts),
          expiresInDays: expiresInDays ? Number(expiresInDays) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear la API key");
      setSecret(data.secret);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la API key");
    } finally {
      setSaving(false);
    }
  }

  if (secret) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        persistent
        title="API key creada"
        description="Cópiala ahora: por seguridad no se puede volver a mostrar. Si la pierdes, crea otra y revoca esta."
        size="md"
        footer={<Button onClick={handleClose}>Listo, ya la guardé</Button>}
      >
        <div className="space-y-4">
          <SecretField label="API key" value={secret} />
          <Banner tone="warning">
            Trátala como una contraseña: da acceso a los datos de tus clientes. No la pegues en código del navegador ni en repositorios.
          </Banner>
        </div>
      </Modal>
    );
  }

  return (
    <Modal layout="drawer"
      open={open}
      onClose={handleClose}
      title="Nueva API key"
      description="Cada integración debería tener su propia key, con solo los permisos que necesita."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button type="submit" form="api-key-form" loading={saving}>Crear key</Button>
        </>
      }
    >
      <form id="api-key-form" onSubmit={handleSubmit} className="space-y-5">
        {error && <Banner tone="danger">{error}</Banner>}
        <FormField label="Nombre" required hint="Para reconocerla después, p. ej. “ERP facturación” o “Zapier”.">
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />}
        </FormField>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground mb-1">Permisos</legend>
          {(Object.entries(API_SCOPES) as [ApiScope, string][]).map(([scope, label]) => (
            <Checkbox
              key={scope}
              checked={scopes.includes(scope)}
              onChange={(checked) => toggleScope(scope, checked)}
              label={label}
              description={scope}
            />
          ))}
        </fieldset>

        <AccountScopeField accounts={accounts} value={accountIds} onChange={setAccountIds} />

        <FormField label="Expira">
          {(id) => (
            <Select id={id} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)}>
              <option value="">Nunca</option>
              <option value="30">En 30 días</option>
              <option value="90">En 90 días</option>
              <option value="365">En 1 año</option>
            </Select>
          )}
        </FormField>
      </form>
    </Modal>
  );
}

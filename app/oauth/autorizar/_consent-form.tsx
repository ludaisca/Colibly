"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";

interface ScopeOption {
  id: string;
  label: string;
  /** Envía mensajes reales a clientes: va en su propio grupo. */
  sends: boolean;
  checked: boolean;
}

// Formulario nativo (POST /api/oauth/authorize): los permisos marcados viajan
// como campos `grant`. El navegador sigue la redirección de vuelta al cliente.
export function ConsentForm({ hidden, scopes, clientName }: { hidden: Record<string, string>; scopes: ScopeOption[]; clientName: string }) {
  const [granted, setGranted] = useState<Set<string>>(() => new Set(scopes.filter((s) => s.checked).map((s) => s.id)));
  const [test, setTest] = useState(false);

  const toggle = (id: string, on: boolean) =>
    setGranted((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const groups = [
    { title: "Consultar y organizar", items: scopes.filter((s) => !s.sends) },
    { title: "Enviar a tus clientes", items: scopes.filter((s) => s.sends) },
  ].filter((g) => g.items.length > 0);

  return (
    <form method="post" action="/api/oauth/authorize" className="mt-5 space-y-5">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {[...granted].map((id) => (
        <input key={id} type="hidden" name="grant" value={id} />
      ))}
      {test && <input type="hidden" name="test" value="1" />}

      {groups.map((group) => (
        <fieldset key={group.title} className="space-y-2.5">
          <legend className="mb-2 text-xs font-medium text-muted">{group.title}</legend>
          {group.items.map((scope) => (
            <Checkbox
              key={scope.id}
              checked={granted.has(scope.id)}
              onChange={(on) => toggle(scope.id, on)}
              label={scope.label}
              description={scope.sends ? `${clientName} debe pedirte confirmación antes de cada envío.` : undefined}
            />
          ))}
        </fieldset>
      ))}

      <fieldset className="border-t border-border pt-4">
        <legend className="sr-only">Modo</legend>
        <Checkbox
          checked={test}
          onChange={setTest}
          label="Modo de prueba"
          description="Lee tus datos reales, pero los envíos se simulan y no se cambia nada."
        />
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" name="decision" value="deny" variant="secondary" className="flex-1">
          Cancelar
        </Button>
        <Button type="submit" name="decision" value="approve" className="flex-1">
          Conectar
        </Button>
      </div>
    </form>
  );
}

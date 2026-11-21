import { Children, isValidElement, type ReactNode } from "react";

/**
 * Texto plano de un ReactNode ("Guardar", <>Enviar <b>ya</b></>) para los
 * componentes de Astryx que exigen un `label` en texto (nombre accesible).
 * `undefined` si no hay texto (p. ej. solo un ícono).
 */
export function textOf(node: ReactNode): string | undefined {
  const parts: string[] = [];
  const walk = (n: ReactNode) => {
    Children.forEach(n, (child) => {
      if (typeof child === "string" || typeof child === "number") parts.push(String(child));
      else if (isValidElement<{ children?: ReactNode }>(child)) walk(child.props.children);
    });
  };
  walk(node);
  const text = parts.join("").replace(/\s+/g, " ").trim();
  return text || undefined;
}

"use client";

import { InfoTip } from "@astryxdesign/core/InfoTip";
import { GLOSSARY, type GlossaryKey } from "@/lib/help/glossary";

// Ícono (i) con "¿Qué es esto?" (InfoTip de Astryx): la explicación sale del
// glosario (lib/help/glossary.ts) o de un texto propio. Se abre también con el
// teclado y el texto queda en el nombre accesible.
export function HelpHint({ term, text, className }: { term?: GlossaryKey; text?: string; className?: string }) {
  const label = text ?? (term ? GLOSSARY[term] : "");
  if (!label) return null;
  return (
    <span className={className}>
      <InfoTip content={label} label={`¿Qué es esto? ${label}`} />
    </span>
  );
}

// Trae los primitivos de coss ui (https://coss.com/ui, licencia MIT: es el
// registro oficial, `apps/ui` del repo cosscom/coss; NO el paquete `packages/ui`,
// que es AGPL) a app/components/kit/ y los adapta a los tokens de Colibly.
// Uso (dentro del contenedor app):  node scripts/coss-sync.mjs [nombre …]
// Sin nombres, trae los 54 primitivos. Es repetible: vuelve a escribir los
// archivos, así que NO se edita a mano nada que este script genere — los
// ajustes propios van en componentes nuevos o en las reglas de ADAPT.
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "https://coss.com/ui/r";
const OUT = "app/components/kit";

const ALL = [
  "accordion", "alert", "alert-dialog", "autocomplete", "avatar", "badge", "breadcrumb", "button", "calendar", "card",
  "checkbox", "checkbox-group", "collapsible", "combobox", "command", "context-menu", "dialog", "drawer", "empty", "field",
  "fieldset", "form", "frame", "group", "input", "otp-field", "input-group", "kbd", "label", "menu", "meter", "number-field",
  "pagination", "popover", "preview-card", "progress", "radio-group", "scroll-area", "select", "separator", "sheet", "sidebar",
  "skeleton", "slider", "spinner", "switch", "table", "tabs", "textarea", "toast", "toggle", "toggle-group", "toolbar", "tooltip",
];
const EXTRA = ["utils", "use-media-query", "use-copy-to-clipboard", "segmented-control"];

// Colibly ya tiene la mayoría de los tokens de coss con otro nombre; los que
// coinciden de nombre pero significan otra cosa se traducen aquí. (Los demás —
// card, popover, primary, muted-foreground, destructive, input, ring, sidebar…—
// son alias definidos en globals.css.)
const ADAPT = [
  // `accent` en coss = fondo suave de hover/selección; en Colibly `accent` es el
  // relleno de marca. Se traduce a surface-light.
  [/\b(hover:|focus:|focus-visible:|data-\[[^\]]+\]:|in-data-\[[^\]]+\]:|group-data-\[[^\]]+\]:|aria-[\w-]+:|data-[\w-]+:)?bg-accent(?:\/\d+)?(?![\w-])/g, "$1bg-surface-light"],
  [/(?<![\w-])text-accent-foreground(?![\w-])/g, "text-foreground"],
  // `muted` en coss = fondo tenue; en Colibly `muted` es color de texto.
  [/(?<![\w-])bg-muted(?:\/\d+)?(?![\w-])/g, "bg-surface-light"],
  [/var\(--color-muted\)/g, "var(--color-surface-light)"],
];

const REWRITE = [
  [/@\/registry\/default\/ui\/([\w-]+)/g, "@/app/components/kit/$1"],
  [/@\/registry\/default\/lib\/([\w-]+)/g, "@/app/components/kit/$1"],
  [/@\/registry\/default\/hooks\/([\w-]+)/g, "@/app/components/kit/$1"],
  [/@\/lib\/utils/g, "@/app/components/kit/utils"],
];

function adapt(src) {
  let out = src;
  for (const [re, to] of REWRITE) out = out.replace(re, to);
  for (const [re, to] of ADAPT) out = out.replace(re, to);
  return out;
}

const names = process.argv.length > 2 ? process.argv.slice(2) : [...ALL, ...EXTRA];
await mkdir(OUT, { recursive: true });
for (const name of names) {
  const res = await fetch(`${BASE}/${name}.json`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const item = await res.json();
  for (const f of item.files) {
    const file = f.path.split("/").pop();
    const header = `// Generado por scripts/coss-sync.mjs desde coss ui (MIT, https://coss.com/ui). No editar a mano.\n`;
    await writeFile(`${OUT}/${file}`, header + adapt(f.content));
  }
  console.log("ok", name);
}

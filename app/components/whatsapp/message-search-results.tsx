"use client";

import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { Spinner } from "@/app/components/ui/spinner";
import { RelativeTime } from "@/app/components/ui/relative-time";
import type { MessageSearchHit } from "@/lib/search/messages";
// Solo tipos de lib/search/messages (usa Prisma); las constantes vienen de message-rules.
import { MESSAGE_SEARCH_MIN } from "@/lib/search/message-rules";

const DEBOUNCE_MS = 350;

type State = { query: string; hits: MessageSearchHit[] | null; error: string | null };

// "En mensajes": resultados de GET /api/whatsapp/search/messages debajo de la
// lista de chats mientras se busca. La búsqueda de chats (nombre/teléfono)
// sigue igual arriba; esto agrega lo que se dijo dentro de las conversaciones.
export function MessageSearchResults({ query, onOpen }: { query: string; onOpen: (hit: MessageSearchHit) => void }) {
  const q = query.replace(/\s+/g, " ").trim();
  const enabled = q.length >= MESSAGE_SEARCH_MIN;
  const [state, setState] = useState<State>({ query: "", hits: null, error: null });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/whatsapp/search/messages?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo buscar en los mensajes");
        setState({ query: q, hits: data.results ?? [], error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({ query: q, hits: null, error: err instanceof Error ? err.message : "No se pudo buscar en los mensajes" });
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q, enabled]);

  if (!enabled) return null;
  const loading = state.query !== q;

  return (
    <section aria-label="Resultados en mensajes" className="border-t border-border">
      <p className="flex items-center gap-1.5 bg-surface/50 px-3 py-1.5 text-micro font-semibold uppercase tracking-wider text-muted-darker">
        <MessageSquareText size={12} aria-hidden /> En mensajes
        {loading && <Spinner size="sm" label="Buscando en mensajes" className="ml-auto" />}
      </p>
      {!loading && state.error && <p className="px-3 py-3 text-xs text-danger">{state.error}</p>}
      {!loading && state.hits?.length === 0 && <p className="px-3 py-3 text-xs text-muted-darker">Ningún mensaje contiene &quot;{q}&quot;.</p>}
      {!loading &&
        state.hits?.map((hit) => (
          <button
            key={hit.messageId}
            type="button"
            onClick={() => onOpen(hit)}
            className="block w-full border-b border-border px-3 py-2 text-left transition-colors hover:bg-surface-light"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">{hit.chatName}</span>
              <RelativeTime value={hit.timestamp} className="shrink-0 text-micro tabular-nums text-muted-darker" />
            </span>
            <span className="mt-0.5 line-clamp-2 text-micro text-muted">
              {hit.direction === "OUTBOUND" && <span className="text-muted-darker">Tú: </span>}
              <Highlighted text={hit.snippet} query={q} />
            </span>
          </button>
        ))}
    </section>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const at = text.toLocaleLowerCase("es").indexOf(query.toLocaleLowerCase("es"));
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-accent-subtle px-0.5 text-accent-ink">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}

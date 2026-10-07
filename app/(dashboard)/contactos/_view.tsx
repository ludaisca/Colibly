"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal, Users, X } from "lucide-react";
import { Badge } from "@/app/components/kit/badge";
import { Button } from "@/app/components/kit/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/app/components/kit/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/app/components/kit/input-group";
import { Popover, PopoverPopup, PopoverTrigger } from "@/app/components/kit/popover";
import { Skeleton } from "@/app/components/kit/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/kit/table";
import { cn } from "@/app/components/kit/utils";
import { ContactAvatar } from "@/app/components/crm/contact-avatar";
import { PersonFormDialog } from "@/app/components/crm/person-form-dialog";
import { SimpleSelect } from "@/app/components/crm/simple-select";
import { usePipelines, useTeam } from "@/app/components/crm/use-crm-lookups";
import { PageHeader } from "@/app/components/ui/page-header";
import { CHANNELS, ChannelGlyph } from "@/app/components/whatsapp/channel-meta";
import { formatTime, type Channel } from "@/app/components/whatsapp/chat-shared";
import { formatPhoneDisplay } from "@/lib/phone";

interface PersonRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  lifecycle: "LEAD" | "CUSTOMER";
  archivedAt: string | null;
  company: { id: string; name: string } | null;
  owner: { id: string; name: string | null } | null;
  channels: Channel[];
  lastMessageAt: string | null;
  unreadCount: number;
}

const PAGE_SIZE = 25;
const LIFECYCLE = [
  { value: "", label: "Todos los tipos" },
  { value: "LEAD", label: "Prospectos" },
  { value: "CUSTOMER", label: "Clientes" },
];
const SORT = [
  { value: "recent", label: "Última modificación" },
  { value: "newest", label: "Más nuevos" },
  { value: "name", label: "Nombre (A–Z)" },
];

export function ContactsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: session } = useSession();
  const canManage = session?.user?.role === "admin" || session?.user?.role === "user";
  const team = useTeam();
  const { items: pipelines } = usePipelines();

  // La URL es la única fuente de verdad de los filtros.
  const q = params.get("q") ?? "";
  const lifecycle = params.get("lifecycle") ?? "";
  const ownerId = params.get("ownerId") ?? "";
  const stageId = params.get("stageId") ?? "";
  const channel = params.get("channel") ?? "";
  const archived = params.get("archived") === "only";
  const sort = params.get("sort") ?? "recent";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(q);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  // El texto de búsqueda se aplica con retraso para no consultar por tecla.
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => setParams({ q: search.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [search, q, setParams]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
    if (q) p.set("q", q);
    if (lifecycle) p.set("lifecycle", lifecycle);
    if (ownerId) p.set("ownerId", ownerId);
    if (stageId) p.set("stageId", stageId);
    if (channel) p.set("channel", channel);
    if (archived) p.set("archived", "only");
    return p.toString();
  }, [q, lifecycle, ownerId, stageId, channel, archived, sort, page]);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la lista se vuelve a pedir al cambiar cualquier filtro
    setError(false);
    fetch(`/api/crm/people?${queryString}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return (await res.json()) as { items: PersonRow[]; total: number };
      })
      .then((data) => {
        if (!alive) return;
        setRows(data.items);
        setTotal(data.total);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [queryString]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!(q || lifecycle || ownerId || stageId || channel || archived);
  const extraCount = [stageId, channel].filter(Boolean).length;
  const stageOptions = [
    { value: "", label: "Todas las etapas" },
    ...pipelines.flatMap((p) => p.stages.filter((s) => s.outcome === "OPEN").map((s) => ({ value: s.id, label: pipelines.length > 1 ? `${p.name} · ${s.name}` : s.name }))),
  ];
  const channelOptions = [{ value: "", label: "Todos los canales" }, ...(Object.keys(CHANNELS) as Channel[]).map((c) => ({ value: c, label: CHANNELS[c].label }))];
  const ownerOptions = [
    { value: "", label: "Todos los responsables" },
    { value: "me", label: "Mis contactos" },
    { value: "none", label: "Sin responsable" },
    ...team.map((u) => ({ value: u.id, label: u.name ?? u.email })),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Directorio"
        title="Contactos"
        description={rows ? `${total} ${total === 1 ? "persona" : "personas"}${hasFilters ? " con estos filtros" : ""}` : "Las personas con las que trabaja tu equipo"}
        actions={<Button onClick={() => setCreating(true)}><Plus /> Nuevo contacto</Button>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-56 flex-1 sm:max-w-sm">
          <InputGroupAddon><Search className="size-4" /></InputGroupAddon>
          <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, correo o teléfono" aria-label="Buscar contactos" />
          {search && (
            <InputGroupAddon align="inline-end">
              <Button variant="ghost" size="icon-xs" aria-label="Borrar búsqueda" onClick={() => { setSearch(""); setParams({ q: null }); }}><X /></Button>
            </InputGroupAddon>
          )}
        </InputGroup>
        <div className="w-44"><SimpleSelect ariaLabel="Tipo de contacto" value={lifecycle} onChange={(v) => setParams({ lifecycle: v || null })} options={LIFECYCLE} /></div>
        <div className="w-52"><SimpleSelect ariaLabel="Responsable" value={ownerId} onChange={(v) => setParams({ ownerId: v || null })} options={ownerOptions} /></div>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" aria-label={extraCount ? `Más filtros (${extraCount} activos)` : "Más filtros"} />}>
            <SlidersHorizontal /> Más filtros {extraCount > 0 && <Badge size="sm" className="rounded-full tabular-nums">{extraCount}</Badge>}
          </PopoverTrigger>
          <PopoverPopup align="start" className="w-72">
            <div className="space-y-4">
              <div className="space-y-1.5"><p className="text-xs font-medium text-muted-foreground">Negocio abierto en la etapa</p><SimpleSelect ariaLabel="Etapa del negocio" value={stageId} onChange={(v) => setParams({ stageId: v || null })} options={stageOptions} /></div>
              <div className="space-y-1.5"><p className="text-xs font-medium text-muted-foreground">Canal</p><SimpleSelect ariaLabel="Canal" value={channel} onChange={(v) => setParams({ channel: v || null })} options={channelOptions} /></div>
            </div>
          </PopoverPopup>
        </Popover>
        <div className="w-44"><SimpleSelect ariaLabel="Orden" value={sort} onChange={(v) => setParams({ sort: v === "recent" ? null : v })} options={SORT} /></div>
        {canManage && (
          <Button variant={archived ? "secondary" : "outline"} size="sm" aria-pressed={archived} onClick={() => setParams({ archived: archived ? null : "only" })}>Archivados</Button>
        )}
        {hasFilters && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); router.replace(pathname, { scroll: false }); }}>Limpiar</Button>}
      </div>

      {error ? (
        <Empty className="py-16">
          <EmptyHeader><EmptyTitle>No se pudo cargar el directorio</EmptyTitle><EmptyDescription>Revisa tu conexión e inténtalo de nuevo.</EmptyDescription></EmptyHeader>
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>Reintentar</Button>
        </Empty>
      ) : rows === null ? (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando contactos">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Users /></EmptyMedia>
            <EmptyTitle>{hasFilters ? "Sin resultados" : "Todavía no hay contactos"}</EmptyTitle>
            <EmptyDescription>{hasFilters ? "Ningún contacto coincide con esa búsqueda o esos filtros." : "Los contactos aparecen solos cuando alguien te escribe, o puedes crear el primero."}</EmptyDescription>
          </EmptyHeader>
          {hasFilters ? <Button variant="outline" size="sm" onClick={() => { setSearch(""); router.replace(pathname, { scroll: false }); }}>Limpiar filtros</Button> : <Button size="sm" onClick={() => setCreating(true)}><Plus /> Nuevo contacto</Button>}
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Contacto</TableHead>
                <TableHead className="hidden md:table-cell">Empresa</TableHead>
                <TableHead className="hidden lg:table-cell">Teléfono</TableHead>
                <TableHead className="hidden xl:table-cell">Responsable</TableHead>
                <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                <TableHead className="hidden sm:table-cell">Canales</TableHead>
                <TableHead className="pr-4 text-right">Último mensaje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => router.push(`/contactos/${p.id}`)}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <ContactAvatar id={p.id} name={p.name} size="sm" />
                      <div className="min-w-0">
                        <Link href={`/contactos/${p.id}`} onClick={(e) => e.stopPropagation()} className={cn("block truncate font-medium text-foreground outline-none hover:underline focus-visible:underline", p.archivedAt && "text-muted-foreground")}>{p.name}</Link>
                        <p className="truncate text-xs text-muted-foreground">{[p.jobTitle, p.company?.name, p.email].filter(Boolean).join(" · ") || (p.phone ? formatPhoneDisplay(p.phone) : "Sin más datos")}</p>
                      </div>
                      {p.archivedAt && <Badge size="sm" variant="warning">Archivado</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden max-w-48 truncate md:table-cell">{p.company?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="hidden tabular-nums lg:table-cell">{p.phone ? formatPhoneDisplay(p.phone) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="hidden xl:table-cell">{p.owner?.name ?? <span className="text-muted-foreground">Sin responsable</span>}</TableCell>
                  <TableCell className="hidden sm:table-cell"><Badge variant={p.lifecycle === "CUSTOMER" ? "success" : "info"}>{p.lifecycle === "CUSTOMER" ? "Cliente" : "Prospecto"}</Badge></TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="flex items-center gap-1.5 text-muted-foreground">{p.channels.length ? p.channels.map((c) => <ChannelGlyph key={c} channel={c} size={14} />) : "—"}</span>
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <span suppressHydrationWarning className="inline-flex items-center justify-end gap-2 tabular-nums text-muted-foreground">
                      {p.unreadCount > 0 && <Badge size="sm" className="rounded-full">{p.unreadCount}</Badge>}
                      {p.lastMessageAt ? formatTime(p.lastMessageAt) : "—"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground tabular-nums">Página {page} de {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}><ChevronLeft /> Anterior</Button>
                <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setParams({ page: String(page + 1) })}>Siguiente <ChevronRight /></Button>
              </div>
            </div>
          )}
        </div>
      )}

      <PersonFormDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/contactos/${id}`)} />
    </div>
  );
}

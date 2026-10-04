import { NextResponse } from "next/server";
import { z } from "zod";
import { publicErrorMessage } from "@/lib/api-errors";
import { rateLimit } from "@/lib/rate-limit";
import { automationChannel, findAccessibleAutomation, requireAutomationSession } from "@/lib/automations/access";
import { parseGraph } from "@/lib/automations/publish";
import { simulate } from "@/lib/automations/simulate";
import type { RunInput, RunState } from "@/lib/automations/types";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  // El grafo que se está editando (puede no estar guardado aún).
  graph: z.unknown(),
  state: z
    .object({
      nodeId: z.string().nullable(),
      vars: z.record(z.string(), z.string()),
      waiting: z.object({ nodeId: z.string(), kind: z.enum(["options", "free"]), reprompts: z.number() }).nullable(),
    })
    .nullable(),
  input: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("start") }),
    z.object({ kind: z.literal("resume") }),
    z.object({ kind: z.literal("timeout") }),
    z.object({ kind: z.literal("reply"), text: z.string().max(2000), replyId: z.string().max(64).nullable() }),
  ]),
  facts: z.object({
    name: z.string().max(100),
    tags: z.array(z.string().max(60)).max(50),
    leadStatus: z.string().max(20),
    customFields: z.record(z.string(), z.string().nullable()),
  }),
});

// Un paso de la simulación: el cliente guarda el estado entre llamadas (el
// servidor no persiste nada).
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await requireAutomationSession();
    if (session instanceof NextResponse) return session;
    const { allowed } = await rateLimit(`automation-sim:${session.user.id}`, 60, 60);
    if (!allowed) return NextResponse.json({ error: "Demasiadas pruebas seguidas, espera un momento" }, { status: 429 });

    const { id } = await params;
    const a = await findAccessibleAutomation(session.user.id, id);
    if (!a) return NextResponse.json({ error: "Automatización no encontrada" }, { status: 404 });

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const graph = parseGraph(parsed.data.graph);
    if (!graph) return NextResponse.json({ error: "El grafo no tiene un formato válido" }, { status: 400 });

    const result = await simulate({
      graph,
      state: parsed.data.state as RunState | null,
      facts: parsed.data.facts,
      runInput: parsed.data.input as RunInput,
      channel: automationChannel(a),
      ownerId: a.waAccount?.userId ?? a.channelAccount!.userId,
      organizationId: a.organizationId,
      automationId: a.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Error interno del servidor") }, { status: 500 });
  }
}

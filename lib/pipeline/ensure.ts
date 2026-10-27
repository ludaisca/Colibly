import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PIPELINE_NAME, DEFAULT_PIPELINE_STAGES } from "./stages";

const withStages = { stages: { orderBy: { position: "asc" as const } } };

export async function createDefaultPipeline(tx: Prisma.TransactionClient, organizationId: string) {
  return tx.pipeline.create({
    data: {
      organizationId,
      name: DEFAULT_PIPELINE_NAME,
      isDefault: true,
      stages: { create: DEFAULT_PIPELINE_STAGES.map((stage) => ({ ...stage })) },
    },
    include: withStages,
  });
}

// Por si una organización se creó antes de la migración de datos.
export async function ensureDefaultPipeline(organizationId: string) {
  const existing = await prisma.pipeline.findFirst({
    where: { organizationId, isDefault: true },
    include: withStages,
  });
  if (existing && existing.stages.length > 0) return existing;

  return prisma.$transaction(async (tx) => {
    const pipeline = existing ?? (await createDefaultPipeline(tx, organizationId));
    if (!existing) return pipeline;
    await tx.pipelineStage.createMany({
      data: DEFAULT_PIPELINE_STAGES.map((stage) => ({ ...stage, pipelineId: pipeline.id })),
    });
    const stages = await tx.pipelineStage.findMany({ where: { pipelineId: pipeline.id } });
    for (const stage of stages) {
      if (!stage.leadStatus) continue;
      await tx.contact.updateMany({
        where: {
          pipelineStageId: null,
          leadStatus: stage.leadStatus,
          OR: [{ account: { organizationId } }, { channelAccount: { organizationId } }],
        },
        data: { pipelineStageId: stage.id },
      });
    }
    return tx.pipeline.findUniqueOrThrow({ where: { id: pipeline.id }, include: withStages });
  });
}

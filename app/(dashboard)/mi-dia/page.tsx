import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActor } from "@/lib/crm/access";
import { getMyDay } from "@/lib/crm/my-day";
import { CrmError } from "@/lib/crm/errors";
import type { MyDay } from "@/lib/crm/my-day-types";
import { MiDiaView } from "./_view";

export default async function MiDiaPage({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { userId } = await searchParams;

  const actor = await getActor();
  let day: MyDay;
  try {
    // Pasa a JSON plano (fechas ISO) antes de cruzar al cliente.
    day = JSON.parse(JSON.stringify(await getMyDay(actor, userId))) as MyDay;
  } catch (err) {
    // Un userId ajeno o inexistente (o no permitido para el rol) vuelve a tu propio día.
    if (err instanceof CrmError && userId) redirect("/mi-dia");
    throw err;
  }

  return <MiDiaView day={day} ownDay={day.userId === actor.userId} canSwitch={actor.role !== "ejecutivo"} role={actor.role} />;
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MacrosView } from "./_view";

export default async function MacrosPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "ejecutivo") redirect("/configuracion");
  return <MacrosView />;
}

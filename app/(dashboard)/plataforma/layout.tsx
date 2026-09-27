import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isPlatformAdminEmail } from "@/lib/platform-admin";

// El acceso se decide aquí y no en page.tsx: con loading.tsx la página ya
// empezó a transmitir cuando corre, y su notFound() salía con estado 200.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isPlatformAdminEmail(session.user.email)) notFound();
  return children;
}

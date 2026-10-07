import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getChatAccountOptions } from "@/lib/chat-account-options";
import { ChatListSkeleton } from "@/app/components/whatsapp/chat-skeletons";
import { ChatPageView } from "./_view";

// La bandeja vive en el layout (no en cada página) para que seguir de una
// conversación a otra no la desmonte: la lista, su scroll, los filtros y el
// panel lateral se quedan como están y solo cambia el hilo. Las páginas
// `page.tsx` y `[accountId]/[chatId]/page.tsx` existen solo para dar la URL.
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const initialAccounts = await getChatAccountOptions(session.user.id);

  return (
    <>
      <Suspense fallback={<div className="flex h-full min-h-0 flex-1"><ChatListSkeleton /></div>}>
        <ChatPageView initialAccounts={initialAccounts} />
      </Suspense>
      {children}
    </>
  );
}

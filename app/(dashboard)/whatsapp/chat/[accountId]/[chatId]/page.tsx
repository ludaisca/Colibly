import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getChatAccountOptions } from "@/lib/chat-account-options";
import { Spinner } from "@/app/components/ui/spinner";
import { ChatPageView } from "../../_view";

export default async function ChatDetailPage({ params }: { params: Promise<{ accountId: string; chatId: string }> }) {
  const [session, { accountId, chatId }] = await Promise.all([auth(), params]);
  if (!session?.user) redirect("/login");
  const initialAccounts = await getChatAccountOptions(session.user.id);

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      }
    >
      <ChatPageView initialAccounts={initialAccounts} initialAccountId={accountId} initialChatId={chatId} />
    </Suspense>
  );
}

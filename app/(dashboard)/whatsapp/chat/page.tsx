import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getChatAccountOptions } from "@/lib/chat-account-options";
import { Spinner } from "@/app/components/ui/spinner";
import { ChatPageView } from "./_view";

export default async function ChatPage() {
  const session = await auth();
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
      <ChatPageView initialAccounts={initialAccounts} />
    </Suspense>
  );
}

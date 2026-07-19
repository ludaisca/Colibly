import { ChatListSkeleton, ChatBubblesSkeleton } from "@/app/components/whatsapp/chat-skeletons";

// Full-bleed (ver app-shell.tsx: fullBleed = pathname.startsWith("/whatsapp/chat"))
// — sin PageHeader/padding estándar, imita directamente el layout de
// ChatWorkspace (riel w-80/w-96 + panel de conversación).
export default function ChatLoading() {
  return (
    <div className="flex flex-1 min-h-0 h-full">
      <ChatListSkeleton />
      <div className="hidden md:flex flex-col flex-1 min-w-0 p-4">
        <ChatBubblesSkeleton className="flex-1" />
      </div>
    </div>
  );
}

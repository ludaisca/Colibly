import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const userCount = await prisma.user.count();
  if (userCount === 0) redirect("/onboarding");

  return (
    <div
      className="min-h-dvh flex items-center justify-center bg-background p-4"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 0%, color-mix(in oklab, var(--accent) 8%, transparent), transparent 60%)",
      }}
    >
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}

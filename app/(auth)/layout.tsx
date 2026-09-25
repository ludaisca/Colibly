export default function AuthLayout({ children }: { children: React.ReactNode }) {
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

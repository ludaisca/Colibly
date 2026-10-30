// Parseo puro de PLATFORM_ADMIN_EMAILS. Vive aparte de lib/platform-admin.ts
// para que la política de login (lib/auth-policy.ts) pueda probarse sin
// arrastrar next-auth/next-server.

export function parsePlatformAdminEmails(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function isPlatformAdminEmailIn(raw: string | undefined, email: string | null | undefined): boolean {
  if (!email) return false;
  return parsePlatformAdminEmails(raw).includes(email.trim().toLowerCase());
}

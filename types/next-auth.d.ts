import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: string;
      // Espacio de trabajo (lib/tenancy.ts). Para lógica de acceso usar
      // getUserTenant()/getUserAccountIds(), no confiar solo en este campo.
      organizationId: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    organizationId?: string;
    // Ver lib/auth.ts — revalidación periódica del usuario.
    sessionVersion?: number;
    checkedAt?: number;
  }
}

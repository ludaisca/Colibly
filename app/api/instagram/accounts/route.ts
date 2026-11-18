import { metaAccountsRoutes } from "@/lib/meta-messaging/routes";

// GET abierto a todos los roles (rail de cuentas del inbox); POST no para "ejecutivo".
export const { GET, POST } = metaAccountsRoutes("INSTAGRAM");

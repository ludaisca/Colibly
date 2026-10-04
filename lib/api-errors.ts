import { Prisma } from "@prisma/client";

// Mensaje para devolver al cliente desde el catch de una ruta. Los errores de
// Prisma traen nombres de tablas, columnas y fragmentos de la consulta — nunca
// deben salir tal cual en la respuesta; se registran y se responde con un
// mensaje genérico. El resto (p. ej. el motivo con que Meta rechazó una
// plantilla o un token) sí es útil para el usuario y se conserva. Registra el
// error en todos los casos: antes la mayoría de las rutas respondía 500 sin
// dejar rastro en los logs.
export function publicErrorMessage(error: unknown, fallback: string): string {
  console.error("[api]", error);
  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

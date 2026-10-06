// Errores de negocio del CRM, con el código HTTP y un `code` estable para el
// cliente. `extra` viaja en el cuerpo de la respuesta (p. ej. el registro
// vigente en un conflicto de versión).
export class CrmError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

export const notFound = (what = "Registro") => new CrmError(404, "not_found", `${what} no encontrado`);
export const forbidden = (message = "Tu rol no tiene permiso para realizar esta acción") => new CrmError(403, "forbidden", message);
export const invalid = (message: string) => new CrmError(400, "invalid_request", message);
export const versionConflict = (current: unknown) =>
  new CrmError(409, "version_conflict", "Este registro cambió mientras lo editabas. Revisa los datos actuales y vuelve a intentar.", { current });

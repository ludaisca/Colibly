// Key de la API ya resuelta por el servidor, sin secreto en el header.
//
// El MCP de clientes conectado por OAuth no tiene el secreto de su ApiKey
// (nadie lo tiene: se descarta al crearla). Tras validar el access token, el
// MCP ata el hash de esa key a cada Request que construye en el mismo proceso,
// y authenticateApiKey lo usa en lugar del header Authorization. Un WeakMap no
// se puede falsificar desde fuera: solo el código que crea el Request lo ata.
const boundKeyHashes = new WeakMap<Request, string>();

export function bindApiKeyHash(req: Request, keyHash: string): void {
  boundKeyHashes.set(req, keyHash);
}

export function boundApiKeyHash(req: Request): string | undefined {
  return boundKeyHashes.get(req);
}

import { OAuth2Client } from "google-auth-library";

// Solo lo mínimo necesario: spreadsheets.create/update no requiere scope de
// Drive, y userinfo.email es lo único que se usa para mostrar "conectado
// como x@gmail.com" en la UI — no se pide ningún otro dato de la cuenta.
export const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

// Sin las tres variables la integración no está disponible: la UI oculta
// "Conectar con Google" y /connect responde 503 en vez de un 500.
export function isGoogleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REDIRECT_URI);
}

export function createGoogleOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Faltan variables de entorno GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_OAUTH_REDIRECT_URI"
    );
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

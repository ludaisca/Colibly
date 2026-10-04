// pg_dump/pg_restore no aceptan los parámetros que Prisma agrega a la URL
// (?schema=public…): libpq responde "invalid URI query parameter". En vez de
// pasar la URL, se parte en variables PG* del entorno del proceso hijo — así
// además la contraseña nunca aparece en la lista de procesos (argv).

export interface PgConnectionEnv {
  PGHOST: string;
  PGPORT: string;
  PGUSER: string;
  PGPASSWORD: string;
  PGDATABASE: string;
  PGSSLMODE?: string;
}

export function pgConnectionFromUrl(databaseUrl: string): PgConnectionEnv {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL no es una URL válida");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL debe empezar con postgresql://");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !database) throw new Error("DATABASE_URL no trae host o base de datos");

  const env: PgConnectionEnv = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
  };
  // sslmode es el único parámetro de la URL que importa al conectar.
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

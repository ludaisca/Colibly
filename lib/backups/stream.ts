import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { Transform, type Readable } from "node:stream";

// Ejecuta un comando y entrega su salida estándar a un "sumidero" (la subida a
// S3) sin pasar por disco. La regla clave: el sumidero solo recibe el FIN del
// flujo si el comando terminó con código 0. Si el proceso falla a medias
// (pg_dump muere, se cae la red a la base), el flujo se destruye con error y la
// subida multiparte se aborta — así NUNCA se publica un respaldo truncado que
// sobrescriba al bueno anterior.

export interface StreamStats {
  bytes: number;
  sha256: string;
}

function createMeter() {
  const hash = createHash("sha256");
  let bytes = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  return { stream, stats: (): StreamStats => ({ bytes, sha256: hash.digest("hex") }) };
}

export interface RunToSinkOptions {
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
  sink: (body: Readable) => Promise<void>;
}

export async function runCommandToSink({ command, args, env, sink }: RunToSinkOptions): Promise<StreamStats> {
  const child = spawn(command, args, { env: env as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
  const meter = createMeter();

  let stderrTail = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000);
  });
  child.stdout.pipe(meter.stream, { end: false });
  // Destruir el flujo con error emite "error"; sin un oyente propio Node lo trata
  // como excepción no capturada y tumba el proceso. Quien consume (la subida)
  // recibe el mismo error por su propio camino.
  meter.stream.on("error", () => {});

  const exited = new Promise<void>((resolve, reject) => {
    child.once("error", (err: NodeJS.ErrnoException) => {
      reject(new Error(err.code === "ENOENT" ? `${command} no está instalado en el contenedor` : err.message));
    });
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} terminó con código ${code ?? signal}${stderrTail.trim() ? `: ${stderrTail.trim()}` : ""}`));
    });
  });
  exited.then(
    () => meter.stream.end(),
    (err) => meter.stream.destroy(err)
  );

  const sinkDone = sink(meter.stream);
  try {
    await Promise.all([sinkDone, exited]);
  } catch (err) {
    child.kill("SIGTERM");
    // Esperar a que el sumidero termine de limpiar (abortar la subida multiparte)
    // antes de dar la operación por fallida.
    await sinkDone.catch(() => {});
    throw err;
  }
  return meter.stats();
}

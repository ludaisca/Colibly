import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { runCommandToSink } from "../stream";
import { describeS3Error, redactSecrets } from "../errors";

const env = { PATH: process.env.PATH ?? "" };

async function collect(body: Readable): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks).toString();
}

describe("runCommandToSink", () => {
  it("entrega la salida completa y calcula tamaño y sha256", async () => {
    let received = "";
    const stats = await runCommandToSink({
      command: "sh",
      args: ["-c", "printf 'hola mundo'"],
      env,
      sink: async (body) => {
        received = await collect(body);
      },
    });
    expect(received).toBe("hola mundo");
    expect(stats.bytes).toBe(10);
    expect(stats.sha256).toBe(createHash("sha256").update("hola mundo").digest("hex"));
  });

  it("si el comando falla a medias, el sumidero NO recibe un final limpio", async () => {
    let sinkError: unknown = null;
    await expect(
      runCommandToSink({
        command: "sh",
        args: ["-c", "printf 'parcial'; echo 'se cayó la red' >&2; exit 3"],
        env,
        sink: async (body) => {
          try {
            await collect(body);
          } catch (e) {
            sinkError = e;
            throw e;
          }
        },
      })
    ).rejects.toThrow(/código 3: se cayó la red/);
    expect(sinkError).toBeTruthy();
  });

  it("si el sumidero falla (S3 caído), mata el proceso y propaga el error", async () => {
    const started = Date.now();
    await expect(
      runCommandToSink({
        command: "sh",
        args: ["-c", "while true; do echo x; sleep 0.05; done"],
        env,
        sink: async () => {
          throw new Error("S3 caído");
        },
      })
    ).rejects.toThrow("S3 caído");
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("explica cuando el comando no existe", async () => {
    await expect(runCommandToSink({ command: "no-existe-pg", args: [], env, sink: async (b) => void (await collect(b)) })).rejects.toThrow(/no está instalado/);
  });

  it("maneja salidas grandes sin perder bytes", async () => {
    let size = 0;
    const stats = await runCommandToSink({
      command: "sh",
      args: ["-c", "head -c 5000000 /dev/zero"],
      env,
      sink: async (body) => {
        for await (const chunk of body) size += (chunk as Buffer).length;
      },
    });
    expect(size).toBe(5_000_000);
    expect(stats.bytes).toBe(5_000_000);
  });
});

describe("redactSecrets", () => {
  it("tacha los secretos y deja el resto", () => {
    expect(redactSecrets("fallo con clave SUPERSECRETA en host", ["SUPERSECRETA", null, "ab"])).toBe("fallo con clave •••• en host");
  });
});

describe("describeS3Error", () => {
  it("traduce los errores típicos", () => {
    expect(describeS3Error({ name: "NoSuchBucket" })).toMatch(/bucket no existe/);
    expect(describeS3Error({ name: "NotFound", $metadata: { httpStatusCode: 404 } })).toMatch(/bucket no existe/);
    expect(describeS3Error({ name: "InvalidAccessKeyId" })).toMatch(/Access Key ID/);
    expect(describeS3Error({ name: "SignatureDoesNotMatch" })).toMatch(/Secret/);
    expect(describeS3Error({ $metadata: { httpStatusCode: 403 } })).toMatch(/permiso/);
    expect(describeS3Error({ code: "ENOTFOUND" })).toMatch(/endpoint/);
    expect(describeS3Error({ name: "AuthorizationHeaderMalformed" })).toMatch(/región/);
    // Caso real: Secret pegado en el campo del Access Key ID.
    expect(describeS3Error({ name: "InvalidArgument", message: "Credential access key has length 64, should be 32", $metadata: { httpStatusCode: 400 } })).toMatch(/32 caracteres.*cfat_/);
    expect(describeS3Error({ name: "UnknownError", $metadata: { httpStatusCode: 400 } })).toMatch(/mal pegado/);
  });
  it("incluye el detalle de lo desconocido, acotado", () => {
    expect(describeS3Error({ name: "Rara", message: "x".repeat(500) }).length).toBeLessThan(260);
  });
});

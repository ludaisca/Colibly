import { Readable } from "node:stream";
import { DeleteObjectCommand, HeadObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { describeS3Error } from "./errors";
import { objectKeys, type BackupConfig } from "./config";

// Cliente S3 compatible (AWS, Cloudflare R2, MinIO, Backblaze, Wasabi…). Con
// endpoint propio se usa direccionamiento por ruta, que todos aceptan.
export function createS3Client(config: BackupConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint ?? undefined,
    forcePathStyle: !!config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Los checksums automáticos del SDK nuevo no los entienden todos los
    // almacenes compatibles; solo se calculan cuando el servicio los exige.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 3,
  });
}

const PART_SIZE = 16 * 1024 * 1024; // hasta ~160 GB con las 10 000 partes de S3

// Subida multiparte desde un flujo de tamaño desconocido. Si el flujo se
// destruye con error, la subida se aborta y el objeto anterior queda intacto.
export async function uploadStream(client: S3Client, bucket: string, key: string, body: Readable, contentType: string): Promise<void> {
  const upload = new Upload({
    client,
    params: { Bucket: bucket, Key: key, Body: body, ContentType: contentType },
    queueSize: 2,
    partSize: PART_SIZE,
    leavePartsOnError: false,
  });
  await upload.done();
}

export async function putJson(client: S3Client, bucket: string, key: string, value: unknown): Promise<void> {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: JSON.stringify(value, null, 2), ContentType: "application/json" }));
}

export async function objectSize(client: S3Client, bucket: string, key: string): Promise<number> {
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return head.ContentLength ?? -1;
}

// "Probar conexión": comprueba bucket, escritura, lectura y borrado con un
// objeto de prueba — lo mismo que necesitará el respaldo real.
export async function testConnection(config: BackupConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = createS3Client(config);
  const key = objectKeys(config.prefix).probe;
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: "ok", ContentType: "text/plain" }));
    await objectSize(client, config.bucket, key);
    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeS3Error(err) };
  } finally {
    client.destroy();
  }
}

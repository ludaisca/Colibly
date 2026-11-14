import { describe, it, expect } from "vitest";
import { constants, createCipheriv, createDecipheriv, publicEncrypt, randomBytes } from "node:crypto";
import { decryptFlowRequest, encryptFlowResponse, FlowDecryptError, generateFlowKeyPair } from "@/lib/whatsapp/flow-endpoint";

// Arma una solicitud como la cifra Meta: AES-128-GCM con llave al azar,
// llave envuelta con RSA-OAEP SHA-256.
function metaRequest(publicKey: string, body: object) {
  const aesKey = randomBytes(16);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-128-gcm", aesKey, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(body), "utf8"), cipher.final(), cipher.getAuthTag()]);
  return {
    aesKey,
    iv,
    req: {
      encrypted_flow_data: data.toString("base64"),
      encrypted_aes_key: publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, aesKey).toString("base64"),
      initial_vector: iv.toString("base64"),
    },
  };
}

describe("endpoint de Flows", () => {
  const { publicKey, privateKey } = generateFlowKeyPair();

  it("descifra lo que manda Meta", () => {
    const { req } = metaRequest(publicKey, { version: "3.0", action: "INIT", flow_token: "t1" });
    expect(decryptFlowRequest(req, privateKey).body).toEqual({ version: "3.0", action: "INIT", flow_token: "t1" });
  });

  it("la respuesta usa la misma llave y el IV invertido", () => {
    const { req, aesKey, iv } = metaRequest(publicKey, { action: "ping" });
    const d = decryptFlowRequest(req, privateKey);
    const out = Buffer.from(encryptFlowResponse({ data: { status: "active" } }, d.aesKey, d.iv), "base64");
    const decipher = createDecipheriv("aes-128-gcm", aesKey, Buffer.from(iv.map((b) => ~b & 0xff)));
    decipher.setAuthTag(out.subarray(-16));
    expect(JSON.parse(Buffer.concat([decipher.update(out.subarray(0, -16)), decipher.final()]).toString())).toEqual({ data: { status: "active" } });
  });

  it("con otra llave o datos alterados lanza FlowDecryptError (→ 421)", () => {
    const other = generateFlowKeyPair();
    const { req } = metaRequest(other.publicKey, { action: "INIT" });
    expect(() => decryptFlowRequest(req, privateKey)).toThrow(FlowDecryptError);
    const ok = metaRequest(publicKey, { action: "INIT" }).req;
    const tampered = Buffer.from(ok.encrypted_flow_data, "base64");
    tampered[0] ^= 1;
    expect(() => decryptFlowRequest({ ...ok, encrypted_flow_data: tampered.toString("base64") }, privateKey)).toThrow(FlowDecryptError);
  });
});

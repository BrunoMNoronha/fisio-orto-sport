import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const WINDOW_MS = 60_000;
const CONNECTION_OPTIONS = new Set(["sslmode", "channel_binding", "schema", "connect_timeout", "connection_limit", "pool_timeout", "pgbouncer", "application_name"]);
const headers = { "Cache-Control": "no-store" };
const equal = (a, b) => typeof a === "string" && typeof b === "string" && /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
function parsed(connectionString) {
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.password) throw new Error();
    const names = [...url.searchParams.keys()];
    if (new Set(names).size !== names.length || names.some((name) => !CONNECTION_OPTIONS.has(name)) || (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public")) throw new Error();
    const identity = { host: url.hostname, port: url.port || "5432", database: decodeURIComponent(url.pathname.slice(1)), role: decodeURIComponent(url.username) };
    const key = createHash("sha256").update(JSON.stringify(["fisio-release-runtime-v1", identity, decodeURIComponent(url.password)])).digest();
    return { identity, key, tls: ["require", "verify-full"].includes(url.searchParams.get("sslmode")) };
  } catch { throw new Error("Conexão inválida para verificação da release."); }
}
const sign = (key, purpose, payload) => createHmac("sha256", key).update(purpose + ":" + JSON.stringify(payload)).digest("hex");
const validChallenge = (challenge, now) => /^\d{13}$/.test(challenge?.timestamp ?? "") && /^[0-9a-f-]{36}$/.test(challenge?.nonce ?? "") && Math.abs(now - Number(challenge.timestamp)) <= WINDOW_MS;

export function connectionIdentity(connectionString) { return parsed(connectionString).identity; }

export function runtimeChallenge(connectionString, now = Date.now()) {
  const challenge = { timestamp: String(now), nonce: randomUUID() };
  return { ...challenge, signature: sign(parsed(connectionString).key, "request", challenge) };
}

// Endpoint autenticado por desafio HMAC: não recebe senha nem uma URL de conexão.
// O segredo deriva da conexão já disponível no runner e no runtime, com separação
// de domínio. Uma URL Preview (mesmo com a mesma senha) não autentica o desafio Production.
export async function runtimeVerification(request, { connectionString, queryIdentity, now = Date.now() }) {
  const challenge = { timestamp: request.headers.get("x-release-timestamp"), nonce: request.headers.get("x-release-nonce") };
  let connection;
  try { connection = parsed(connectionString); } catch { return new Response(null, { status: 404, headers }); }
  if (!validChallenge(challenge, now) || !equal(request.headers.get("x-release-signature"), sign(connection.key, "request", challenge))) {
    return new Response(null, { status: 404, headers });
  }
  try {
    const actual = await queryIdentity();
    const payload = { ...challenge, connection: { ...connection.identity, tls: connection.tls, connectedDatabase: actual.database, connectedRole: actual.role } };
    return Response.json({ ...payload, proof: sign(connection.key, "response", payload) }, { headers });
  } catch {
    // Nunca incluir erro do driver, URL, senha, dados de pacientes ou usuários.
    return Response.json({ error: "Banco indisponível para verificação." }, { status: 503, headers });
  }
}

export function verifyRuntimeProof(connectionString, challenge, response, now = Date.now()) {
  const expected = parsed(connectionString);
  if (!validChallenge(challenge, now) || response?.nonce !== challenge.nonce || response?.timestamp !== challenge.timestamp) throw new Error("Desafio de runtime inválido ou expirado.");
  const payload = { timestamp: response.timestamp, nonce: response.nonce, connection: response.connection };
  if (!equal(response.proof, sign(expected.key, "response", payload))) throw new Error("Prova de runtime inválida.");
  const actual = response.connection;
  if (!actual || !actual.tls || Object.entries(expected.identity).some(([key, value]) => actual[key] !== value) || actual.connectedDatabase !== expected.identity.database || actual.connectedRole !== expected.identity.role) throw new Error("Runtime conectado ao banco/role incorreto.");
  return { host: actual.host, database: actual.connectedDatabase, role: actual.connectedRole };
}

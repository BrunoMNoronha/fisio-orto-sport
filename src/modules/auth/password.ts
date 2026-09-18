// Hash de senha com scrypt (node:crypto), sem dependência nativa.
// Formato: scrypt$N$r$p$salt(base64)$hash(base64)
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// Limites para não aceitar parâmetros absurdos vindos de um hash adulterado.
const MAX_N = 2 ** 20;

function scrypt(password: string, salt: Buffer, keyLength: number, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, { N: n, r, p, maxmem: 256 * n * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every(Number.isInteger) || n < 2 || n > MAX_N || r < 1 || r > 32 || p < 1 || p > 16) {
    return false;
  }
  const expected = Buffer.from(parts[5], "base64");
  if (expected.length === 0) return false;
  const key = await scrypt(password, Buffer.from(parts[4], "base64"), expected.length, n, r, p);
  return timingSafeEqual(key, expected);
}

// Hash descartável usado quando o usuário não existe ou está inativo, para igualar o tempo do login.
// Criado sob demanda uma única vez; getDummyHash() é chamado também no carregamento do módulo de
// login (actions.ts), para que a primeira tentativa não seja mais lenta.
let dummyHash: Promise<string> | undefined;
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

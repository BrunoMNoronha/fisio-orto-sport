import "server-only";
import { prisma } from "@/lib/db";
import { PostgresRateLimitStore, RATE_LIMIT_WINDOW_MS, RateLimiter } from "./rate-limit";

// Limites de autenticação, compartilhados entre instâncias pelo PostgreSQL (ver rate-limit.ts).
const store = new PostgresRateLimitStore(prisma);

// Tentativas por e-mail sem sucesso (força bruta numa conta); zerado no login bem-sucedido.
export const loginAttemptsByEmail = new RateLimiter("login-email", 5, RATE_LIMIT_WINDOW_MS, store);
// Tentativas por IP (varredura de contas e custo do scrypt).
export const loginAttemptsByIp = new RateLimiter("login-ip", 30, RATE_LIMIT_WINDOW_MS, store);
// Cadastro do primeiro Administrador: action pública, também limitada por IP.
export const setupAttemptsByIp = new RateLimiter("setup-ip", 10, RATE_LIMIT_WINDOW_MS, store);

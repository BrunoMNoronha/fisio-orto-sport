export type Challenge = { timestamp: string; nonce: string; signature: string };
export function runtimeChallenge(connectionString: string, now?: number): Challenge;
export function runtimeVerification(request: Request, options: {
  connectionString: string;
  queryIdentity: () => Promise<{ database: string; role: string }>;
  now?: number;
}): Promise<Response>;
export function verifyRuntimeProof(connectionString: string, challenge: Challenge, response: unknown, now?: number): { host: string; database: string; role: string };
export function connectionIdentity(connectionString: string): { host: string; port: string; database: string; role: string };

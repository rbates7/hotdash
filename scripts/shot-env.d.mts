export const ALLOWED: string[]
export function isSecretLike(name: string): boolean
export function secretLikeSet(env: Record<string, string | undefined>): string[]
export function assertNoSecrets(env: Record<string, string | undefined>, where: string): void
export function serverEnv(source: Record<string, string | undefined>, extra?: Record<string, string>): Record<string, string>
export function blankSecretLike(source: Record<string, string | undefined>, known?: string[]): Record<string, string>
export function parseEnvLines(text: string): Record<string, string>
export function liveDataPaths(body: unknown, at?: string): string[]

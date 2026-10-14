// Vitest stand-in for the `server-only` package, whose real entry throws
// outside a React Server Components bundle. The guard itself is proven by
// `pnpm build` (Next refuses to bundle it into client code) and by
// scripts/check-client-bundle.mjs.
export {}

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Standalone config, not Astro's getViteConfig(): getViteConfig boots @cloudflare/vite-plugin,
// which rejects Vitest's resolve.external. Pure type-only module needs only the @/ alias.
export default defineConfig({
  test: {
    environment: "node",
    // Unit lane is src-colocated only; keeps test/integration/** (real Supabase) out of the fast run.
    include: ["src/**/*.test.ts"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

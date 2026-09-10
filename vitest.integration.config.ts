import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Separate from the Astro-free unit config: this lane hits a real local Supabase.
// Single fork + no file parallelism because every spec shares one local DB.
export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/integration/global-setup.ts"],
    include: ["test/integration/**/*.test.ts"],
    fileParallelism: false,
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

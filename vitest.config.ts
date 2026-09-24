import { defineConfig } from "vitest/config";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

export default defineConfig({
  resolve: {
    alias: {
      "@/types": path.resolve(__dirname, "lib/types.ts"),
      "@/lib": path.resolve(__dirname, "lib"),
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // les tests partagent la même base : pas de parallélisme
    fileParallelism: false,
  },
});

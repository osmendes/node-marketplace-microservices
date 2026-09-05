import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: "./",
    environment: "node",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
  },
  plugins: [
    // Isso garante que os decorators do NestJS funcionem nos testes
    swc.vite({
      module: { type: "es6" },
    }),
  ],
});

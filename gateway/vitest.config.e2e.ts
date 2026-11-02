import path from "node:path";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      src: path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    root: "./",
    environment: "node",
    include: ["test/**/*.e2e-spec.ts"],
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});

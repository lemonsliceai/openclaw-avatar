import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: [
      {
        find: "openclaw/plugin-sdk/plugin-entry",
        replacement: path.join(
          __dirname,
          "test-utils/openclaw-plugin-sdk-plugin-entry.ts",
        ),
      },
      {
        find: "openclaw/plugin-sdk/core",
        replacement: path.join(__dirname, "test-utils/openclaw-plugin-sdk.ts"),
      },
    ],
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests run as server code, so `import "server-only"` resolves the way it
// does in Next.js server bundles (the package's "react-server" export).
const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
};
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

// Two projects: fast unit tests, and integration tests that need a real
// Postgres. The integration project exists only when TEST_DATABASE_URL is
// set (CI sets it); it points DATABASE_URL at that database so `database`
// and `withRollback` use the same one.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
        },
      },
      ...(testDatabaseUrl
        ? [
            {
              resolve: { alias },
              test: {
                name: "integration",
                environment: "node" as const,
                include: ["src/**/*.integration.test.ts"],
                testTimeout: 30_000,
                // TZ makes the timestamp test meaningful on a UTC runner too.
                env: { DATABASE_URL: testDatabaseUrl, TZ: "Asia/Bangkok" },
              },
            },
          ]
        : []),
    ],
  },
});

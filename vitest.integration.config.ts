import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["apps/api/tests/**/*.integration.test.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ||
        "postgresql://prism:prism_local@127.0.0.1:5432/prism_test",
      REDIS_URL: process.env.TEST_REDIS_URL || "redis://127.0.0.1:6379/1",
      WEB_ORIGIN: "http://localhost:4400",
    },
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});

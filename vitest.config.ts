import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["apps/api/tests/**/*.unit.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://prism:prism_local@127.0.0.1:5432/prism_test",
      REDIS_URL: "redis://127.0.0.1:6379/1",
      WEB_ORIGIN: "http://localhost:4400",
    },
    testTimeout: 15000,
  },
});

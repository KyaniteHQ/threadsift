import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/core/kernel/schema.ts",
  out: "./migrations",
});

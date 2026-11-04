import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import resend from "@convex-dev/resend/convex.config.js";

const app = defineApp({
  // "1" on a local deployment turns on the e2e suite's email + password sign-in (convex/auth.ts).
  env: { E2E_AUTH: v.optional(v.string()) },
});
app.use(rateLimiter);
app.use(resend);

export default app;

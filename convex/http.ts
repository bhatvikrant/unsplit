import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { resend } from "./lib/email";

const http = httpRouter();
auth.addHttpRoutes(http);

// Resend delivery events (bounces, complaints, ...). Point a Resend webhook at
// https://<deployment>.convex.site/resend-webhook and set RESEND_WEBHOOK_SECRET.
http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => await resend.handleResendEventWebhook(ctx, req)),
});

export default http;

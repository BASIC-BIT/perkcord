import { httpRouter } from "convex/server";
import { stripeWebhook } from "./stripeWebhooks";

const http = httpRouter();

http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: stripeWebhook,
});

export default http;

import { httpRouter } from "convex/server";
import { authorizeNetWebhook } from "./authorizeNetWebhooks";
import { stripeWebhook } from "./stripeWebhooks";

const http = httpRouter();

http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: stripeWebhook,
});

http.route({
  path: "/webhooks/authorize-net",
  method: "POST",
  handler: authorizeNetWebhook,
});

export default http;

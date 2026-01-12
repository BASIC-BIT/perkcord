import { httpRouter } from "convex/server";
import { authorizeNetWebhook } from "./authorizeNetWebhooks";
import {
  getMemberSnapshot,
  listAuditEvents,
  listMembers,
  listTiers,
} from "./restApi";
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

http.route({
  path: "/api/tiers",
  method: "GET",
  handler: listTiers,
});

http.route({
  path: "/api/members",
  method: "GET",
  handler: listMembers,
});

http.route({
  path: "/api/member",
  method: "GET",
  handler: getMemberSnapshot,
});

http.route({
  path: "/api/audit",
  method: "GET",
  handler: listAuditEvents,
});

export default http;

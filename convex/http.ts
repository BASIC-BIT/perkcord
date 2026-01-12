import { httpRouter } from "convex/server";
import { authorizeNetWebhook } from "./authorizeNetWebhooks";
import {
  createManualGrant,
  getActiveMemberCounts,
  getGuildDiagnostics,
  getProviderEventDiagnostics,
  getMemberSnapshot,
  listAuditEvents,
  listMembers,
  listTiers,
  requestRoleSync,
  revokeManualGrant,
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

http.route({
  path: "/api/reporting/active-members",
  method: "GET",
  handler: getActiveMemberCounts,
});

http.route({
  path: "/api/diagnostics/provider-events",
  method: "GET",
  handler: getProviderEventDiagnostics,
});

http.route({
  path: "/api/diagnostics/guild",
  method: "GET",
  handler: getGuildDiagnostics,
});

http.route({
  path: "/api/grants",
  method: "POST",
  handler: createManualGrant,
});

http.route({
  path: "/api/grants/revoke",
  method: "POST",
  handler: revokeManualGrant,
});

http.route({
  path: "/api/role-sync",
  method: "POST",
  handler: requestRoleSync,
});

export default http;

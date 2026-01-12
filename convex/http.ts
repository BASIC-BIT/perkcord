import { httpRouter } from "convex/server";
import { authorizeNetWebhook } from "./authorizeNetWebhooks";
import { nmiWebhook } from "./nmiWebhooks";
import {
  createOutboundWebhookEndpoint,
  createTier,
  createManualGrant,
  getActiveMemberCounts,
  getGuildDiagnostics,
  getProviderEventDiagnostics,
  listFailedOutboundWebhooks,
  listOutboundWebhookEndpoints,
  getMemberSnapshot,
  listRoleSyncRequests,
  listAuditEvents,
  listMembers,
  listTiers,
  requestRoleSync,
  registerRoleConnectionMetadata,
  revokeManualGrant,
  updateOutboundWebhookEndpoint,
  updateTier,
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
  path: "/webhooks/nmi",
  method: "POST",
  handler: nmiWebhook,
});

http.route({
  path: "/api/tiers",
  method: "GET",
  handler: listTiers,
});

http.route({
  path: "/api/tiers",
  method: "POST",
  handler: createTier,
});

http.route({
  path: "/api/tiers/update",
  method: "POST",
  handler: updateTier,
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
  path: "/api/webhooks/failed",
  method: "GET",
  handler: listFailedOutboundWebhooks,
});

http.route({
  path: "/api/outbound-webhooks",
  method: "GET",
  handler: listOutboundWebhookEndpoints,
});

http.route({
  path: "/api/outbound-webhooks",
  method: "POST",
  handler: createOutboundWebhookEndpoint,
});

http.route({
  path: "/api/outbound-webhooks/update",
  method: "POST",
  handler: updateOutboundWebhookEndpoint,
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
  method: "GET",
  handler: listRoleSyncRequests,
});

http.route({
  path: "/api/role-sync",
  method: "POST",
  handler: requestRoleSync,
});

http.route({
  path: "/api/role-connections/metadata",
  method: "POST",
  handler: registerRoleConnectionMetadata,
});

export default http;

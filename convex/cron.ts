import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "expire entitlement grants",
  { minutes: 15 },
  api.entitlements.expireEntitlementGrants,
  {},
);

crons.interval(
  "retry failed role sync requests",
  { minutes: 10 },
  api.roleSync.retryFailedRoleSyncRequests,
  {},
);

crons.interval("repair role sync drift", { minutes: 60 }, api.roleSync.enqueueRoleSyncRepairs, {});

crons.interval(
  "process provider events",
  { minutes: 2 },
  api.providerEventProcessing.processProviderEvents,
  {},
);

crons.interval(
  "reconcile provider subscriptions",
  { minutes: 360 },
  api.providerReconciliation.reconcileProviderSubscriptions,
  {},
);

crons.interval(
  "sync role connections",
  { minutes: 2 },
  api.discordRoleConnectionsActions.processRoleConnectionUpdates,
  {},
);

crons.interval(
  "deliver outbound webhooks",
  { minutes: 1 },
  api.outboundWebhooksActions.processOutboundWebhookDeliveries,
  {},
);

export default crons;

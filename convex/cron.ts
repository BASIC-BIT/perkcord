import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "expire entitlement grants",
  { minutes: 15 },
  api.entitlements.expireEntitlementGrants
);

crons.interval(
  "retry failed role sync requests",
  { minutes: 10 },
  api.roleSync.retryFailedRoleSyncRequests
);

crons.interval(
  "process provider events",
  { minutes: 2 },
  api.providerEventProcessing.processProviderEvents
);

crons.interval(
  "deliver outbound webhooks",
  { minutes: 1 },
  api.outboundWebhooks.processOutboundWebhookDeliveries
);

export default crons;

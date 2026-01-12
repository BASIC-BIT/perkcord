import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "expire entitlement grants",
  { minutes: 15 },
  api.entitlements.expireEntitlementGrants
);

export default crons;

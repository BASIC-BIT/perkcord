import Link from "next/link";
import { cookies } from "next/headers";
import { getAdminGuildIdFromCookies } from "@/lib/guildSelection";
import { getSessionFromCookies } from "@/lib/session";
import {
  AuditEventContent,
  fetchConvexJson,
  formatMatchType,
  formatProviderLabel,
  formatTimestamp,
  getNumberParam,
  getParam,
  type ActiveMemberCountsResponse,
  type AuditEventsResponse,
  type FailedOutboundWebhookResponse,
  type GuildDiagnostics,
  type GuildDiagnosticsResponse,
  type GuildListResponse,
  type ProviderDiagnosticsResponse,
  type RevenueIndicatorsResponse,
  type SearchParams,
} from "../admin-helpers";

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const secret = process.env.PERKCORD_SESSION_SECRET;
  const cookieStore = cookies();
  const session = secret ? getSessionFromCookies(cookieStore, secret) : null;
  const selectedGuildId = session ? getAdminGuildIdFromCookies(cookieStore) : null;
  const guildId = getParam(searchParams?.guildId) ?? selectedGuildId;
  const scanLimit = getNumberParam(searchParams?.scanLimit);
  const revenueWindowDays = getNumberParam(searchParams?.revenueWindowDays);
  const auditLimit = getNumberParam(searchParams?.auditLimit);
  const failedLimit = getNumberParam(searchParams?.failedLimit);
  const convexUrl = process.env.PERKCORD_CONVEX_HTTP_URL?.trim();
  const convexApiKey = process.env.PERKCORD_REST_API_KEY?.trim();

  let guildListError: string | null = null;
  let guildList: GuildListResponse["guilds"] | null = null;
  let activeMemberCountsError: string | null = null;
  let activeMemberCounts: ActiveMemberCountsResponse | null = null;
  let revenueIndicatorsError: string | null = null;
  let revenueIndicators: RevenueIndicatorsResponse | null = null;
  let guildDiagnosticsError: string | null = null;
  let guildDiagnostics: GuildDiagnostics | null = null;
  let providerDiagnosticsError: string | null = null;
  let providerDiagnostics: ProviderDiagnosticsResponse | null = null;
  let failedWebhookError: string | null = null;
  let failedWebhookDeliveries: FailedOutboundWebhookResponse["deliveries"] | null = null;
  let auditEventsError: string | null = null;
  let auditEvents: AuditEventsResponse["events"] | null = null;
  let healthConfigError: string | null = null;

  if (session && convexUrl && convexApiKey) {
    const guildResult = await fetchConvexJson<GuildListResponse>(convexUrl, convexApiKey, "/api/guilds", {
      limit: 50,
    });
    if (guildResult.error) {
      guildListError = guildResult.error;
    } else {
      guildList = guildResult.data?.guilds ?? [];
    }

    if (guildId) {
      const countsResult = await fetchConvexJson<ActiveMemberCountsResponse>(
        convexUrl,
        convexApiKey,
        "/api/reporting/active-members",
        { guildId },
      );
      if (countsResult.error) {
        activeMemberCountsError = countsResult.error;
      } else {
        activeMemberCounts = countsResult.data ?? null;
      }

      const revenueResult = await fetchConvexJson<RevenueIndicatorsResponse>(
        convexUrl,
        convexApiKey,
        "/api/reporting/revenue",
        { guildId, scanLimit, windowDays: revenueWindowDays },
      );
      if (revenueResult.error) {
        revenueIndicatorsError = revenueResult.error;
      } else {
        revenueIndicators = revenueResult.data ?? null;
      }

      const guildDiagnosticsResult = await fetchConvexJson<GuildDiagnosticsResponse>(
        convexUrl,
        convexApiKey,
        "/api/diagnostics/guild",
        { guildId },
      );
      if (guildDiagnosticsResult.error) {
        guildDiagnosticsError = guildDiagnosticsResult.error;
      } else {
        guildDiagnostics = guildDiagnosticsResult.data?.diagnostics ?? null;
      }

      const diagnosticsResult = await fetchConvexJson<ProviderDiagnosticsResponse>(
        convexUrl,
        convexApiKey,
        "/api/diagnostics/provider-events",
        { guildId, scanLimit },
      );
      if (diagnosticsResult.error) {
        providerDiagnosticsError = diagnosticsResult.error;
      } else {
        providerDiagnostics = diagnosticsResult.data ?? null;
      }

      const failedResult = await fetchConvexJson<FailedOutboundWebhookResponse>(
        convexUrl,
        convexApiKey,
        "/api/webhooks/failed",
        { guildId, limit: failedLimit ?? 25 },
      );
      if (failedResult.error) {
        failedWebhookError = failedResult.error;
      } else {
        failedWebhookDeliveries = failedResult.data?.deliveries ?? [];
      }

      const auditResult = await fetchConvexJson<AuditEventsResponse>(
        convexUrl,
        convexApiKey,
        "/api/audit",
        { guildId, limit: auditLimit ?? 25 },
      );
      if (auditResult.error) {
        auditEventsError = auditResult.error;
      } else {
        auditEvents = auditResult.data?.events ?? [];
      }
    }
  } else if (session) {
    guildListError =
      "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    if (guildId) {
      healthConfigError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
      guildDiagnosticsError = healthConfigError;
      activeMemberCountsError = healthConfigError;
      revenueIndicatorsError = healthConfigError;
      providerDiagnosticsError = healthConfigError;
      failedWebhookError = healthConfigError;
      auditEventsError = healthConfigError;
    }
  }

  const selectedGuild =
    guildId && guildList ? guildList.find((guild) => guild._id === guildId) : null;

  return (
    <div className="space-y-6">
      <section className="panel">
        <p className="subtle">Admin overview</p>
        <h1 className="text-3xl">Overview</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Select a guild and review health.
        </p>
      </section>

      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl">Active guild</h2>
            <p className="text-sm text-muted-foreground">
              Select the guild you want to manage.
            </p>
          </div>
          <Link className="button secondary" href="/admin/select-guild">
            Change guild
          </Link>
        </div>
        {guildListError && <div className="banner error mt-4">{guildListError}</div>}
        {!guildId ? (
          <div className="banner mt-4">Select a guild to load admin data.</div>
        ) : (
          <div className="snapshot-meta mt-4">
            <span>
              Guild: <strong>{selectedGuild?.name ?? "Unknown guild"}</strong>
            </span>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl">Health overview</h2>
            <p className="text-sm text-muted-foreground">
              Recent provider events and member counts.
            </p>
          </div>
        </div>
        {!guildId ? (
          <div className="banner mt-4">Select a guild to load health metrics.</div>
        ) : (
          <form className="form mt-4" action="/admin/overview" method="get">
            <input type="hidden" name="guildId" value={guildId} />
            <label className="field">
              <span>Provider scan limit (optional)</span>
              <input
                className="input"
                name="scanLimit"
                type="number"
                min={1}
                max={1000}
                placeholder="200"
                defaultValue={scanLimit ? String(scanLimit) : ""}
              />
            </label>
            <label className="field">
              <span>Revenue window days (optional)</span>
              <input
                className="input"
                name="revenueWindowDays"
                type="number"
                min={1}
                max={365}
                placeholder="30"
                defaultValue={revenueWindowDays ? String(revenueWindowDays) : ""}
              />
            </label>
            <label className="field">
              <span>Failed webhook limit (optional)</span>
              <input
                className="input"
                name="failedLimit"
                type="number"
                min={1}
                max={200}
                placeholder="25"
                defaultValue={failedLimit ? String(failedLimit) : ""}
              />
            </label>
            <label className="field">
              <span>Audit event limit (optional)</span>
              <input
                className="input"
                name="auditLimit"
                type="number"
                min={1}
                max={200}
                placeholder="25"
                defaultValue={auditLimit ? String(auditLimit) : ""}
              />
            </label>
            <div className="tier-actions">
              <button className="button secondary" type="submit">
                Load health
              </button>
            </div>
          </form>
        )}
        {healthConfigError && <div className="banner error mt-4">{healthConfigError}</div>}
        {guildDiagnosticsError && <div className="banner error mt-4">{guildDiagnosticsError}</div>}
        {activeMemberCountsError && <div className="banner error mt-4">{activeMemberCountsError}</div>}
        {revenueIndicatorsError && <div className="banner error mt-4">{revenueIndicatorsError}</div>}
        {providerDiagnosticsError && <div className="banner error mt-4">{providerDiagnosticsError}</div>}
        {failedWebhookError && <div className="banner error mt-4">{failedWebhookError}</div>}
        {auditEventsError && <div className="banner error mt-4">{auditEventsError}</div>}
        {guildId && !healthConfigError && (
          <div className="snapshot-grid mt-6">
            <div className="snapshot-card">
              <h3>Onboarding diagnostics</h3>
              {guildDiagnostics ? (
                <>
                  <div className="meta">
                    <span>Checked: {formatTimestamp(guildDiagnostics.checkedAt)}</span>
                    <span>Overall: {guildDiagnostics.overallStatus}</span>
                    {guildDiagnostics.botRoleId && <span>Bot role: {guildDiagnostics.botRoleId}</span>}
                  </div>
                  <ul className="audit-list mt-3">
                    <li className="audit-item">
                      <div className="audit-title">Permissions</div>
                      <div className="audit-meta">
                        <span>{guildDiagnostics.permissionsOk ? "OK" : "Missing"}</span>
                        {!guildDiagnostics.permissionsOk && guildDiagnostics.missingPermissions.length > 0 && (
                          <span>Missing: {guildDiagnostics.missingPermissions.join(", ")}</span>
                        )}
                      </div>
                    </li>
                    <li className="audit-item">
                      <div className="audit-title">Role hierarchy</div>
                      <div className="audit-meta">
                        <span>{guildDiagnostics.roleHierarchyOk ? "OK" : "Blocked"}</span>
                        {!guildDiagnostics.roleHierarchyOk && guildDiagnostics.blockedRoleIds.length > 0 && (
                          <span>Blocked roles: {guildDiagnostics.blockedRoleIds.join(", ")}</span>
                        )}
                      </div>
                    </li>
                    <li className="audit-item">
                      <div className="audit-title">Roles present</div>
                      <div className="audit-meta">
                        <span>{guildDiagnostics.rolesExistOk ? "OK" : "Missing"}</span>
                        {!guildDiagnostics.rolesExistOk && guildDiagnostics.missingRoleIds.length > 0 && (
                          <span>Missing roles: {guildDiagnostics.missingRoleIds.join(", ")}</span>
                        )}
                      </div>
                    </li>
                  </ul>
                  {guildDiagnostics.notes && <p className="mt-3 text-sm text-muted-foreground">Notes: {guildDiagnostics.notes}</p>}
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Onboarding diagnostics are unavailable.</p>
              )}
            </div>
            <div className="snapshot-card">
              <h3>Active members by tier</h3>
              {activeMemberCounts ? (
                activeMemberCounts.tiers.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No tiers found for this guild.</p>
                ) : (
                  <ul className="audit-list mt-3">
                    {activeMemberCounts.tiers.map((tier) => (
                      <li key={tier.tierId} className="audit-item">
                        <div className="audit-title">{tier.tierName}</div>
                        <div className="audit-meta">
                          <span>Active members: {tier.activeMemberCount}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Active member counts are unavailable.</p>
              )}
            </div>
            <div className="snapshot-card">
              <h3>Revenue indicators</h3>
              {revenueIndicators ? (
                <>
                  <div className="meta">
                    <span>Window: last {revenueIndicators.windowDays} days</span>
                    <span>From: {formatTimestamp(revenueIndicators.windowStart)}</span>
                    <span>Evaluated: {formatTimestamp(revenueIndicators.evaluatedAt)}</span>
                    <span>Scan limit: {revenueIndicators.scanLimit}</span>
                  </div>
                  <div className="meta mt-2">
                    <span>Counts derived from provider events; not accounting.</span>
                  </div>
                  <ul className="audit-list mt-3">
                    <li className="audit-item">
                      <div className="audit-title">Totals</div>
                      <div className="audit-meta">
                        <span>Payments succeeded: {revenueIndicators.totals.paymentSucceeded}</span>
                        <span>Payments failed: {revenueIndicators.totals.paymentFailed}</span>
                        <span>Refunds: {revenueIndicators.totals.refunds}</span>
                        <span>Chargebacks opened: {revenueIndicators.totals.chargebacksOpened}</span>
                        <span>Chargebacks closed: {revenueIndicators.totals.chargebacksClosed}</span>
                        <span>Matched events: {revenueIndicators.totals.matchedEvents}</span>
                      </div>
                    </li>
                  </ul>
                  <ul className="audit-list mt-3">
                    {revenueIndicators.providers.map((provider) => (
                      <li key={provider.provider} className="audit-item">
                        <div className="audit-title">{formatProviderLabel(provider.provider)}</div>
                        <div className="audit-meta">
                          <span>Payments succeeded: {provider.paymentSucceeded}</span>
                          <span>Payments failed: {provider.paymentFailed}</span>
                          <span>Refunds: {provider.refunds}</span>
                          <span>Chargebacks opened: {provider.chargebacksOpened}</span>
                          <span>Chargebacks closed: {provider.chargebacksClosed}</span>
                          <span>Matched events: {provider.matchedEvents}</span>
                          <span>Scanned events: {provider.scannedEvents}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Revenue indicators are unavailable.</p>
              )}
            </div>
            <div className="snapshot-card">
              <h3>Latest provider events</h3>
              {providerDiagnostics ? (
                <>
                  <div className="meta">
                    <span>Evaluated: {formatTimestamp(providerDiagnostics.evaluatedAt)}</span>
                    <span>Scan limit: {providerDiagnostics.scanLimit}</span>
                  </div>
                  <ul className="audit-list mt-3">
                    {providerDiagnostics.providers.map((entry) => {
                      const event = entry.event;
                      const eventTime = event?.occurredAt ?? event?.receivedAt;
                      return (
                        <li key={entry.provider} className="audit-item">
                          <div className="audit-title">
                            {formatProviderLabel(entry.provider)} {event ? `- ${event.normalizedEventType}` : "- No events"}
                          </div>
                          <div className="audit-meta">
                            <span>{formatMatchType(entry.matchType)}</span>
                            <span>Seen: {formatTimestamp(eventTime)}</span>
                            {event?.processedStatus && <span>Processed: {event.processedStatus}</span>}
                            {event?.lastError && <span>Error: {event.lastError}</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Provider diagnostics are unavailable.</p>
              )}
            </div>
            <div className="snapshot-card">
              <h3>Failed outbound webhooks</h3>
              {failedWebhookDeliveries ? (
                failedWebhookDeliveries.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No failed deliveries for this guild.</p>
                ) : (
                  <ul className="audit-list mt-3">
                    {failedWebhookDeliveries.map((delivery) => (
                      <li key={delivery._id} className="audit-item">
                        <div className="audit-title">{delivery.eventType}</div>
                        <div className="audit-meta">
                          <span>Endpoint: {delivery.endpointUrl}</span>
                          <span>Event: {delivery.eventId}</span>
                          <span>Attempts: {delivery.attempts}</span>
                          <span>Last tried: {formatTimestamp(delivery.lastAttemptedAt)}</span>
                          <span>Failed: {formatTimestamp(delivery.updatedAt)}</span>
                          {delivery.lastError && <span>Error: {delivery.lastError}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Failed deliveries are unavailable.</p>
              )}
            </div>
            <div className="snapshot-card">
              <h3>Recent audit events</h3>
              {auditEvents ? (
                auditEvents.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No recent audit events for this guild.</p>
                ) : (
                  <ul className="audit-list mt-3">
                    {auditEvents.map((event) => (
                      <li key={event._id} className="audit-item">
                        <AuditEventContent event={event} />
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Audit events are unavailable.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}


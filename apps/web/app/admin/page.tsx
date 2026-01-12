import Link from "next/link";
import { cookies } from "next/headers";
import { getSessionFromCookies } from "@/lib/session";

type SearchParams = Record<string, string | string[] | undefined>;
type MemberIdentity = {
  _id: string;
  discordUserId: string;
  discordUsername?: string;
  createdAt?: number;
  updatedAt?: number;
};
type TierSummary = {
  _id: string;
  name: string;
};
type TierListResponse = {
  tiers: TierSummary[];
};
type GrantSummary = {
  _id: string;
  tierId: string;
  status: string;
  validFrom: number;
  validThrough?: number;
  source: string;
  tier?: TierSummary | null;
};
type AuditEventSummary = {
  _id: string;
  timestamp: number;
  eventType: string;
  actorType?: string;
  actorId?: string;
  subjectDiscordUserId?: string;
  subjectTierId?: string;
  subjectGrantId?: string;
  correlationId?: string;
};
type MemberSearchResponse = {
  members: MemberIdentity[];
};
type MemberSnapshotResponse = {
  memberIdentity: MemberIdentity | null;
  grants: GrantSummary[];
  auditEvents: AuditEventSummary[];
};
type ActiveMemberCount = {
  tierId: string;
  tierName: string;
  activeMemberCount: number;
};
type ActiveMemberCountsResponse = {
  tiers: ActiveMemberCount[];
};
type ProviderEventSummary = {
  _id: string;
  provider: string;
  providerEventId: string;
  providerEventType?: string;
  normalizedEventType: string;
  providerObjectId?: string;
  providerCustomerId?: string;
  providerPriceIds?: string[];
  occurredAt?: number;
  receivedAt?: number;
  processedStatus?: string;
  processedAt?: number;
  lastError?: string;
};
type ProviderDiagnosticsEntry = {
  provider: string;
  event: ProviderEventSummary | null;
  matchType: "customer" | "price" | "none";
};
type ProviderDiagnosticsResponse = {
  guildId: string;
  scanLimit: number;
  evaluatedAt: number;
  providers: ProviderDiagnosticsEntry[];
};
type AuditEventsResponse = {
  events: AuditEventSummary[];
};
type GuildDiagnostics = {
  checkedAt: number;
  overallStatus: string;
  permissionsOk: boolean;
  missingPermissions: string[];
  roleHierarchyOk: boolean;
  blockedRoleIds: string[];
  rolesExistOk: boolean;
  missingRoleIds: string[];
  checkedRoleIds: string[];
  botUserId?: string;
  botRoleId?: string;
  notes?: string;
};
type GuildDiagnosticsResponse = {
  diagnostics: GuildDiagnostics | null;
};

type FetchResult<T> = { data?: T; error?: string };

const getParam = (value: SearchParams[string]) =>
  Array.isArray(value) ? value[0] : value;
const getNumberParam = (value: SearchParams[string]) => {
  const raw = getParam(value);
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const buildConvexUrl = (
  baseUrl: string,
  path: string,
  params: Record<string, string | number | undefined>
) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${normalizeBaseUrl(baseUrl)}${normalized}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

const formatTimestamp = (value?: number) => {
  if (!value) {
    return "N/A";
  }
  return new Date(value).toLocaleString();
};

const formatProviderLabel = (provider: string) => {
  switch (provider) {
    case "stripe":
      return "Stripe";
    case "authorize_net":
      return "Authorize.Net";
    case "nmi":
      return "NMI";
    default:
      return provider;
  }
};

const formatMatchType = (matchType: ProviderDiagnosticsEntry["matchType"]) => {
  switch (matchType) {
    case "customer":
      return "Customer match";
    case "price":
      return "Price match";
    default:
      return "No match";
  }
};

const fetchConvexJson = async <T,>(
  baseUrl: string,
  apiKey: string,
  path: string,
  params: Record<string, string | number | undefined>
): Promise<FetchResult<T>> => {
  const endpoint = buildConvexUrl(baseUrl, path, params);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "x-perkcord-api-key": apiKey,
      },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as T | null;
    if (!response.ok) {
      const message =
        (payload as { error?: string } | null)?.error ??
        `Request failed with status ${response.status}.`;
      return { error: message };
    }
    if (!payload) {
      return { error: "Empty response from Convex REST API." };
    }
    return { data: payload };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Convex request failed.";
    return { error: message };
  }
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const secret = process.env.PERKCORD_SESSION_SECRET;
  const authEnabled = Boolean(secret);
  const cookieStore = cookies();
  const session = secret ? getSessionFromCookies(cookieStore, secret) : null;
  const forceSyncStatus = getParam(searchParams?.forceSync);
  const forceSyncRequestId = getParam(searchParams?.requestId);
  const forceSyncError = getParam(searchParams?.message);
  const grantAction = getParam(searchParams?.grantAction);
  const grantStatus = getParam(searchParams?.grantStatus);
  const grantId = getParam(searchParams?.grantId);
  const grantMessage = getParam(searchParams?.grantMessage);
  const guildId = getParam(searchParams?.guildId);
  const memberSearch = getParam(searchParams?.memberSearch);
  const memberId = getParam(searchParams?.memberId);
  const scanLimit = getNumberParam(searchParams?.scanLimit);
  const auditLimit = getNumberParam(searchParams?.auditLimit);
  const convexUrl = process.env.PERKCORD_CONVEX_HTTP_URL?.trim();
  const convexApiKey = process.env.PERKCORD_REST_API_KEY?.trim();

  let memberSearchError: string | null = null;
  let memberSearchResults: MemberIdentity[] | null = null;
  let memberSnapshotError: string | null = null;
  let memberSnapshot: MemberSnapshotResponse | null = null;
  let activeMemberCountsError: string | null = null;
  let activeMemberCounts: ActiveMemberCountsResponse | null = null;
  let guildDiagnosticsError: string | null = null;
  let guildDiagnostics: GuildDiagnostics | null = null;
  let providerDiagnosticsError: string | null = null;
  let providerDiagnostics: ProviderDiagnosticsResponse | null = null;
  let auditEventsError: string | null = null;
  let auditEvents: AuditEventSummary[] | null = null;
  let healthConfigError: string | null = null;
  let tierListError: string | null = null;
  let tierList: TierSummary[] | null = null;

  if (session && convexUrl && convexApiKey) {
    if (memberSearch && !guildId) {
      memberSearchError = "Guild ID is required to search members.";
    }
    if (memberSearch && guildId) {
      const result = await fetchConvexJson<MemberSearchResponse>(
        convexUrl,
        convexApiKey,
        "/api/members",
        {
          guildId,
          search: memberSearch,
          limit: 25,
        }
      );
      if (result.error) {
        memberSearchError = result.error;
      } else {
        memberSearchResults = result.data?.members ?? [];
      }
    }

    if (memberId && !guildId) {
      memberSnapshotError = "Guild ID is required to load a member snapshot.";
    }
    if (memberId && guildId) {
      const result = await fetchConvexJson<MemberSnapshotResponse>(
        convexUrl,
        convexApiKey,
        "/api/member",
        {
          guildId,
          discordUserId: memberId,
          auditLimit: 25,
        }
      );
      if (result.error) {
        memberSnapshotError = result.error;
      } else {
        memberSnapshot = result.data ?? null;
      }
    }

    if (guildId) {
      const tiersResult = await fetchConvexJson<TierListResponse>(
        convexUrl,
        convexApiKey,
        "/api/tiers",
        {
          guildId,
        }
      );
      if (tiersResult.error) {
        tierListError = tiersResult.error;
      } else {
        tierList = tiersResult.data?.tiers ?? [];
      }

      const countsResult = await fetchConvexJson<ActiveMemberCountsResponse>(
        convexUrl,
        convexApiKey,
        "/api/reporting/active-members",
        {
          guildId,
        }
      );
      if (countsResult.error) {
        activeMemberCountsError = countsResult.error;
      } else {
        activeMemberCounts = countsResult.data ?? null;
      }

      const guildDiagnosticsResult =
        await fetchConvexJson<GuildDiagnosticsResponse>(
          convexUrl,
          convexApiKey,
          "/api/diagnostics/guild",
          {
            guildId,
          }
        );
      if (guildDiagnosticsResult.error) {
        guildDiagnosticsError = guildDiagnosticsResult.error;
      } else {
        guildDiagnostics = guildDiagnosticsResult.data?.diagnostics ?? null;
      }

      const diagnosticsResult =
        await fetchConvexJson<ProviderDiagnosticsResponse>(
          convexUrl,
          convexApiKey,
          "/api/diagnostics/provider-events",
          {
            guildId,
            scanLimit,
          }
        );
      if (diagnosticsResult.error) {
        providerDiagnosticsError = diagnosticsResult.error;
      } else {
        providerDiagnostics = diagnosticsResult.data ?? null;
      }

      const auditResult = await fetchConvexJson<AuditEventsResponse>(
        convexUrl,
        convexApiKey,
        "/api/audit",
        {
          guildId,
          limit: auditLimit ?? 25,
        }
      );
      if (auditResult.error) {
        auditEventsError = auditResult.error;
      } else {
        auditEvents = auditResult.data?.events ?? [];
      }
    }
  } else if (session && (memberSearch || memberId || guildId)) {
    if (memberSearch) {
      memberSearchError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    }
    if (memberId) {
      memberSnapshotError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    }
    if (guildId) {
      healthConfigError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
      guildDiagnosticsError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
      tierListError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
      auditEventsError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    }
  }

  const grantActionLabel =
    grantAction === "revoke"
      ? "revoke"
      : grantAction === "create"
        ? "create"
        : "action";
  const grantBanner =
    grantStatus === "success"
      ? grantAction === "revoke"
        ? `Grant revoked${grantId ? ` (${grantId})` : ""}.`
        : `Manual grant created${grantId ? ` (${grantId})` : ""}.`
      : grantStatus === "error"
        ? `Manual grant ${grantActionLabel} failed${
            grantMessage ? `: ${grantMessage}` : "."
          }`
        : null;

  return (
    <main className="card">
      <h1>Admin Portal</h1>
      {!secret && (
        <div className="banner">
          PERKCORD_SESSION_SECRET is not configured. Admin auth is disabled.
        </div>
      )}
      {session ? (
        <>
          <p>Signed in as {session.username}.</p>
          <div className="meta">
            <span>Discord ID: {session.userId}</span>
            <span>Signed in: {new Date(session.issuedAt).toLocaleString()}</span>
          </div>
          {forceSyncStatus === "success" && (
            <div className="banner success">
              Force sync queued.
              {forceSyncRequestId ? ` Request ID: ${forceSyncRequestId}` : ""}
            </div>
          )}
          {forceSyncStatus === "error" && (
            <div className="banner error">
              Force sync failed
              {forceSyncError ? `: ${forceSyncError}` : "."}
            </div>
          )}
          {grantStatus && grantBanner && (
            <div
              className={`banner ${
                grantStatus === "error" ? "error" : "success"
              }`}
            >
              {grantBanner}
            </div>
          )}
          <section className="panel">
            <h2>Force role sync</h2>
            <p>
              Request a bot resync for a single member or an entire guild. This
              is admin-only and queues a role sync job in Convex.
            </p>
            <form className="form" action="/api/admin/force-sync" method="post">
              <label className="field">
                <span>Guild ID</span>
                <input
                  className="input"
                  name="guildId"
                  placeholder="123456789012345678"
                  required
                />
              </label>
              <label className="field">
                <span>Scope</span>
                <select className="input" name="scope" defaultValue="user">
                  <option value="user">User</option>
                  <option value="guild">Guild</option>
                </select>
              </label>
              <label className="field">
                <span>Discord User ID (required for user scope)</span>
                <input
                  className="input"
                  name="discordUserId"
                  placeholder="112233445566778899"
                />
              </label>
              <label className="field">
                <span>Reason (optional)</span>
                <textarea
                  className="input"
                  name="reason"
                  rows={2}
                  placeholder="Member reported missing access."
                />
              </label>
              <div className="tier-actions">
                <button className="button" type="submit">
                  Request force sync
                </button>
              </div>
            </form>
          </section>
          <section className="panel">
            <h2>Manual grants</h2>
            <p>
              Create or revoke entitlements with audit trails. Leave valid dates
              empty for immediate, ongoing access.
            </p>
            {tierListError && (
              <div className="banner error">{tierListError}</div>
            )}
            <div className="snapshot-grid">
              <div className="snapshot-card">
                <h3>Create grant</h3>
                <form
                  className="form"
                  action="/api/admin/grants/create"
                  method="post"
                >
                  <label className="field">
                    <span>Guild ID</span>
                    <input
                      className="input"
                      name="guildId"
                      placeholder="123456789012345678"
                      defaultValue={guildId ?? ""}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Discord User ID</span>
                    <input
                      className="input"
                      name="discordUserId"
                      placeholder="112233445566778899"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Tier ID</span>
                    <input
                      className="input"
                      name="tierId"
                      list="tier-options"
                      placeholder="tier_id"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select
                      className="input"
                      name="status"
                      defaultValue="active"
                    >
                      <option value="active">active</option>
                      <option value="pending">pending</option>
                      <option value="past_due">past_due</option>
                      <option value="canceled">canceled</option>
                      <option value="expired">expired</option>
                      <option value="suspended_dispute">
                        suspended_dispute
                      </option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Valid from (optional)</span>
                    <input
                      className="input"
                      type="datetime-local"
                      name="validFrom"
                    />
                  </label>
                  <label className="field">
                    <span>Valid through (optional)</span>
                    <input
                      className="input"
                      type="datetime-local"
                      name="validThrough"
                    />
                  </label>
                  <label className="field">
                    <span>Note (optional)</span>
                    <textarea
                      className="input"
                      name="note"
                      rows={2}
                      placeholder="Comped access after support ticket."
                    />
                  </label>
                  <div className="tier-actions">
                    <button className="button" type="submit">
                      Create manual grant
                    </button>
                  </div>
                </form>
                {tierList && tierList.length > 0 && (
                  <datalist id="tier-options">
                    {tierList.map((tier) => (
                      <option
                        key={tier._id}
                        value={tier._id}
                        label={tier.name}
                      />
                    ))}
                  </datalist>
                )}
              </div>
              <div className="snapshot-card">
                <h3>Revoke grant</h3>
                <form
                  className="form"
                  action="/api/admin/grants/revoke"
                  method="post"
                >
                  <label className="field">
                    <span>Guild ID</span>
                    <input
                      className="input"
                      name="guildId"
                      placeholder="123456789012345678"
                      defaultValue={guildId ?? ""}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Grant ID</span>
                    <input
                      className="input"
                      name="grantId"
                      placeholder="entitlement_grant_id"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Note (optional)</span>
                    <textarea
                      className="input"
                      name="note"
                      rows={2}
                      placeholder="Revoked after cancellation."
                    />
                  </label>
                  <div className="tier-actions">
                    <button className="button secondary" type="submit">
                      Revoke grant
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>
          <section className="panel">
            <h2>Health overview</h2>
            <p>
              Review recent provider events and active member counts for a
              guild.
            </p>
            <form className="form" action="/admin" method="get">
              <label className="field">
                <span>Guild ID</span>
                <input
                  className="input"
                  name="guildId"
                  placeholder="123456789012345678"
                  defaultValue={guildId ?? ""}
                  required
                />
              </label>
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
              <div className="tier-actions">
                <button className="button secondary" type="submit">
                  Load health
                </button>
              </div>
            </form>
            {!guildId && (
              <p>Enter a guild ID to load health metrics.</p>
            )}
            {healthConfigError && (
              <div className="banner error">{healthConfigError}</div>
            )}
            {guildDiagnosticsError && (
              <div className="banner error">{guildDiagnosticsError}</div>
            )}
            {activeMemberCountsError && (
              <div className="banner error">{activeMemberCountsError}</div>
            )}
            {providerDiagnosticsError && (
              <div className="banner error">{providerDiagnosticsError}</div>
            )}
            {auditEventsError && (
              <div className="banner error">{auditEventsError}</div>
            )}
            {guildId && !healthConfigError && (
              <div className="snapshot-grid">
                <div className="snapshot-card">
                  <h3>Onboarding diagnostics</h3>
                  {guildDiagnostics ? (
                    <>
                      <div className="meta">
                        <span>
                          Checked: {formatTimestamp(guildDiagnostics.checkedAt)}
                        </span>
                        <span>Overall: {guildDiagnostics.overallStatus}</span>
                        {guildDiagnostics.botRoleId && (
                          <span>Bot role: {guildDiagnostics.botRoleId}</span>
                        )}
                      </div>
                      <ul className="audit-list">
                        <li className="audit-item">
                          <div className="audit-title">Permissions</div>
                          <div className="audit-meta">
                            <span>
                              {guildDiagnostics.permissionsOk
                                ? "OK"
                                : "Missing"}
                            </span>
                            {!guildDiagnostics.permissionsOk &&
                              guildDiagnostics.missingPermissions.length >
                                0 && (
                                <span>
                                  Missing:{" "}
                                  {guildDiagnostics.missingPermissions.join(
                                    ", "
                                  )}
                                </span>
                              )}
                          </div>
                        </li>
                        <li className="audit-item">
                          <div className="audit-title">Role hierarchy</div>
                          <div className="audit-meta">
                            <span>
                              {guildDiagnostics.roleHierarchyOk
                                ? "OK"
                                : "Blocked"}
                            </span>
                            {!guildDiagnostics.roleHierarchyOk &&
                              guildDiagnostics.blockedRoleIds.length > 0 && (
                                <span>
                                  Blocked roles:{" "}
                                  {guildDiagnostics.blockedRoleIds.join(", ")}
                                </span>
                              )}
                          </div>
                        </li>
                        <li className="audit-item">
                          <div className="audit-title">Roles present</div>
                          <div className="audit-meta">
                            <span>
                              {guildDiagnostics.rolesExistOk ? "OK" : "Missing"}
                            </span>
                            {!guildDiagnostics.rolesExistOk &&
                              guildDiagnostics.missingRoleIds.length > 0 && (
                                <span>
                                  Missing roles:{" "}
                                  {guildDiagnostics.missingRoleIds.join(", ")}
                                </span>
                              )}
                          </div>
                        </li>
                      </ul>
                      {guildDiagnostics.notes && (
                        <p>Notes: {guildDiagnostics.notes}</p>
                      )}
                    </>
                  ) : (
                    <p>Onboarding diagnostics are unavailable.</p>
                  )}
                </div>
                <div className="snapshot-card">
                  <h3>Active members by tier</h3>
                  {activeMemberCounts ? (
                    activeMemberCounts.tiers.length === 0 ? (
                      <p>No tiers found for this guild.</p>
                    ) : (
                      <ul className="audit-list">
                        {activeMemberCounts.tiers.map((tier) => (
                          <li key={tier.tierId} className="audit-item">
                            <div className="audit-title">{tier.tierName}</div>
                            <div className="audit-meta">
                              <span>
                                Active members: {tier.activeMemberCount}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    <p>Active member counts are unavailable.</p>
                  )}
                </div>
                <div className="snapshot-card">
                  <h3>Latest provider events</h3>
                  {providerDiagnostics ? (
                    <>
                      <div className="meta">
                        <span>
                          Evaluated:{" "}
                          {formatTimestamp(providerDiagnostics.evaluatedAt)}
                        </span>
                        <span>Scan limit: {providerDiagnostics.scanLimit}</span>
                      </div>
                      <ul className="audit-list">
                        {providerDiagnostics.providers.map((entry) => {
                          const event = entry.event;
                          const eventTime =
                            event?.occurredAt ?? event?.receivedAt;
                          return (
                            <li key={entry.provider} className="audit-item">
                              <div className="audit-title">
                                {formatProviderLabel(entry.provider)}{" "}
                                {event
                                  ? `• ${event.normalizedEventType}`
                                  : "• No events"}
                              </div>
                              <div className="audit-meta">
                                <span>{formatMatchType(entry.matchType)}</span>
                                <span>
                                  Seen: {formatTimestamp(eventTime)}
                                </span>
                                {event?.processedStatus && (
                                  <span>
                                    Processed: {event.processedStatus}
                                  </span>
                                )}
                                {event?.lastError && (
                                  <span>Error: {event.lastError}</span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <p>Provider diagnostics are unavailable.</p>
                  )}
                </div>
                <div className="snapshot-card">
                  <h3>Recent audit events</h3>
                  {auditEvents ? (
                    auditEvents.length === 0 ? (
                      <p>No recent audit events for this guild.</p>
                    ) : (
                      <ul className="audit-list">
                        {auditEvents.map((event) => (
                          <li key={event._id} className="audit-item">
                            <div className="audit-title">{event.eventType}</div>
                            <div className="audit-meta">
                              <span>{formatTimestamp(event.timestamp)}</span>
                              <span>
                                Actor: {event.actorType ?? "system"}
                                {event.actorId ? ` (${event.actorId})` : ""}
                              </span>
                              {event.subjectDiscordUserId && (
                                <span>
                                  Member: {event.subjectDiscordUserId}
                                </span>
                              )}
                              {event.subjectTierId && (
                                <span>Tier: {event.subjectTierId}</span>
                              )}
                              {event.subjectGrantId && (
                                <span>Grant: {event.subjectGrantId}</span>
                              )}
                              {event.correlationId && (
                                <span>
                                  Correlation: {event.correlationId}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    <p>Audit events are unavailable.</p>
                  )}
                </div>
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Member lookup</h2>
            <p>
              Search for a member by Discord ID or username and load their
              entitlement timeline.
            </p>
            <form className="form" action="/admin" method="get">
              <label className="field">
                <span>Guild ID</span>
                <input
                  className="input"
                  name="guildId"
                  placeholder="123456789012345678"
                  defaultValue={guildId ?? ""}
                  required
                />
              </label>
              <label className="field">
                <span>Search (Discord ID or username)</span>
                <input
                  className="input"
                  name="memberSearch"
                  placeholder="Search members"
                  defaultValue={memberSearch ?? ""}
                />
              </label>
              <div className="tier-actions">
                <button className="button secondary" type="submit">
                  Search members
                </button>
              </div>
            </form>
            {memberSearchError && (
              <div className="banner error">{memberSearchError}</div>
            )}
            {memberSearchResults && (
              <>
                {memberSearchResults.length === 0 ? (
                  <p>No members found for that search.</p>
                ) : (
                  <ul className="result-list">
                    {memberSearchResults.map((member) => {
                      const detailParams = new URLSearchParams();
                      if (guildId) {
                        detailParams.set("guildId", guildId);
                      }
                      detailParams.set("memberId", member.discordUserId);
                      if (memberSearch) {
                        detailParams.set("memberSearch", memberSearch);
                      }
                      const detailHref = `/admin?${detailParams.toString()}`;
                      return (
                        <li key={member._id} className="result-item">
                          <div className="result-meta">
                            <strong>
                              {member.discordUsername ?? "Unknown user"}
                            </strong>
                            <span>ID: {member.discordUserId}</span>
                            <span>
                              Updated: {formatTimestamp(member.updatedAt)}
                            </span>
                          </div>
                          <Link className="button secondary" href={detailHref}>
                            View snapshot
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </section>
          <section className="panel">
            <h2>Member snapshot</h2>
            <p>
              Load entitlement grants and audit events for a single Discord user
              id.
            </p>
            <form className="form" action="/admin" method="get">
              <label className="field">
                <span>Guild ID</span>
                <input
                  className="input"
                  name="guildId"
                  placeholder="123456789012345678"
                  defaultValue={guildId ?? ""}
                  required
                />
              </label>
              <label className="field">
                <span>Discord User ID</span>
                <input
                  className="input"
                  name="memberId"
                  placeholder="112233445566778899"
                  defaultValue={memberId ?? ""}
                  required
                />
              </label>
              <div className="tier-actions">
                <button className="button secondary" type="submit">
                  Load snapshot
                </button>
              </div>
            </form>
            {memberSnapshotError && (
              <div className="banner error">{memberSnapshotError}</div>
            )}
            {memberSnapshot && (
              <div className="snapshot-grid">
                <div className="snapshot-card">
                  <h3>Identity</h3>
                  <div className="snapshot-meta">
                    <span>
                      Username:{" "}
                      <strong>
                        {memberSnapshot.memberIdentity?.discordUsername ??
                          "Unknown"}
                      </strong>
                    </span>
                    <span>
                      Discord ID:{" "}
                      {memberSnapshot.memberIdentity?.discordUserId ?? memberId}
                    </span>
                    <span>
                      Linked:{" "}
                      {formatTimestamp(
                        memberSnapshot.memberIdentity?.createdAt
                      )}
                    </span>
                    <span>
                      Updated:{" "}
                      {formatTimestamp(
                        memberSnapshot.memberIdentity?.updatedAt
                      )}
                    </span>
                  </div>
                </div>
                <div className="snapshot-card">
                  <h3>Entitlement grants</h3>
                  {memberSnapshot.grants.length === 0 ? (
                    <p>No entitlement grants found.</p>
                  ) : (
                    <ul className="audit-list">
                      {memberSnapshot.grants.map((grant) => (
                        <li key={grant._id} className="audit-item">
                          <div className="audit-title">
                            {grant.tier?.name ?? "Unknown tier"}
                          </div>
                          <div className="audit-meta">
                            <span>Status: {grant.status}</span>
                            <span>Source: {grant.source}</span>
                            <span>Valid from: {formatTimestamp(grant.validFrom)}</span>
                            <span>
                              Valid through: {formatTimestamp(grant.validThrough)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="snapshot-card">
                  <h3>Audit timeline</h3>
                  {memberSnapshot.auditEvents.length === 0 ? (
                    <p>No audit events found.</p>
                  ) : (
                    <ul className="audit-list">
                      {memberSnapshot.auditEvents.map((event) => (
                        <li key={event._id} className="audit-item">
                          <div className="audit-title">{event.eventType}</div>
                          <div className="audit-meta">
                            <span>{formatTimestamp(event.timestamp)}</span>
                            <span>
                              Actor: {event.actorType ?? "system"}
                              {event.actorId ? ` (${event.actorId})` : ""}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
          <p style={{ marginTop: 24 }}>
            <Link className="button secondary" href="/api/auth/logout">
              Sign out
            </Link>
          </p>
        </>
      ) : (
        <>
          {authEnabled ? (
            <>
              <p>Connect Discord to continue.</p>
              <p style={{ marginTop: 24 }}>
                <Link className="button" href="/api/auth/discord">
                  Sign in with Discord
                </Link>
              </p>
            </>
          ) : (
            <p>Set PERKCORD_SESSION_SECRET to enable admin login.</p>
          )}
        </>
      )}
      <p style={{ marginTop: 32 }}>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}

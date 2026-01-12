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
};
type MemberSearchResponse = {
  members: MemberIdentity[];
};
type MemberSnapshotResponse = {
  memberIdentity: MemberIdentity | null;
  grants: GrantSummary[];
  auditEvents: AuditEventSummary[];
};

type FetchResult<T> = { data?: T; error?: string };

const getParam = (value: SearchParams[string]) =>
  Array.isArray(value) ? value[0] : value;

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
  const guildId = getParam(searchParams?.guildId);
  const memberSearch = getParam(searchParams?.memberSearch);
  const memberId = getParam(searchParams?.memberId);
  const convexUrl = process.env.PERKCORD_CONVEX_HTTP_URL?.trim();
  const convexApiKey = process.env.PERKCORD_REST_API_KEY?.trim();

  let memberSearchError: string | null = null;
  let memberSearchResults: MemberIdentity[] | null = null;
  let memberSnapshotError: string | null = null;
  let memberSnapshot: MemberSnapshotResponse | null = null;

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
  } else if (session && (memberSearch || memberId)) {
    if (memberSearch) {
      memberSearchError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    }
    if (memberId) {
      memberSnapshotError =
        "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    }
  }

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

import Link from "next/link";
import { cookies } from "next/headers";
import { getAdminGuildIdFromCookies } from "@/lib/guildSelection";
import { getSessionFromCookies } from "@/lib/session";
import {
  AuditEventContent,
  fetchConvexJson,
  formatTimestamp,
  getParam,
  type MemberSearchResponse,
  type MemberSnapshotResponse,
  type RoleSyncRequestsResponse,
  type SearchParams,
  type TierListResponse,
} from "../admin-helpers";

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const secret = process.env.PERKCORD_SESSION_SECRET;
  const cookieStore = cookies();
  const session = secret ? getSessionFromCookies(cookieStore, secret) : null;
  const selectedGuildId = session ? getAdminGuildIdFromCookies(cookieStore) : null;
  const guildId = getParam(searchParams?.guildId) ?? selectedGuildId;
  const memberSearch = getParam(searchParams?.memberSearch);
  const memberId = getParam(searchParams?.memberId);
  const grantAction = getParam(searchParams?.grantAction);
  const grantStatus = getParam(searchParams?.grantStatus);
  const grantId = getParam(searchParams?.grantId);
  const grantMessage = getParam(searchParams?.grantMessage);
  const convexUrl = process.env.PERKCORD_CONVEX_HTTP_URL?.trim();
  const convexApiKey = process.env.PERKCORD_REST_API_KEY?.trim();

  let memberSearchError: string | null = null;
  let memberSearchResults: MemberSearchResponse["members"] | null = null;
  let memberSnapshotError: string | null = null;
  let memberSnapshot: MemberSnapshotResponse | null = null;
  let roleSyncError: string | null = null;
  let roleSyncRequests: RoleSyncRequestsResponse["requests"] | null = null;
  let tierListError: string | null = null;
  let tierList: TierListResponse["tiers"] | null = null;

  if (session && convexUrl && convexApiKey) {
    if (guildId) {
      const tierResult = await fetchConvexJson<TierListResponse>(
        convexUrl,
        convexApiKey,
        "/api/tiers",
        { guildId },
      );
      if (tierResult.error) {
        tierListError = tierResult.error;
      } else {
        tierList = tierResult.data?.tiers ?? [];
      }
    }

    if (memberSearch && !guildId) {
      memberSearchError = "Select a guild to search members.";
    }
    if (memberSearch && guildId) {
      const result = await fetchConvexJson<MemberSearchResponse>(
        convexUrl,
        convexApiKey,
        "/api/members",
        { guildId, search: memberSearch, limit: 25 },
      );
      if (result.error) {
        memberSearchError = result.error;
      } else {
        memberSearchResults = result.data?.members ?? [];
      }
    }

    if (memberId && !guildId) {
      memberSnapshotError = "Select a guild to load a member snapshot.";
    }
    if (memberId && guildId) {
      const result = await fetchConvexJson<MemberSnapshotResponse>(
        convexUrl,
        convexApiKey,
        "/api/member",
        { guildId, discordUserId: memberId, auditLimit: 25 },
      );
      if (result.error) {
        memberSnapshotError = result.error;
      } else {
        memberSnapshot = result.data ?? null;
      }

      const roleSyncResult = await fetchConvexJson<RoleSyncRequestsResponse>(
        convexUrl,
        convexApiKey,
        "/api/role-sync",
        { guildId, discordUserId: memberId, limit: 10 },
      );
      if (roleSyncResult.error) {
        roleSyncError = roleSyncResult.error;
      } else {
        roleSyncRequests = roleSyncResult.data?.requests ?? [];
      }
    }
  } else if (session) {
    memberSearchError =
      memberSearchError ??
      "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    memberSnapshotError =
      memberSnapshotError ??
      "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    roleSyncError =
      roleSyncError ??
      "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
    tierListError =
      tierListError ??
      "Convex REST configuration missing (PERKCORD_CONVEX_HTTP_URL, PERKCORD_REST_API_KEY).";
  }

  const grantActionLabel =
    grantAction === "revoke" ? "revoke" : grantAction === "create" ? "create" : "action";
  const grantBanner =
    grantStatus === "success"
      ? grantAction === "revoke"
        ? `Grant revoked${grantId ? ` (${grantId})` : ""}.`
        : `Manual grant created${grantId ? ` (${grantId})` : ""}.`
      : grantStatus === "error"
        ? `Manual grant ${grantActionLabel} failed${grantMessage ? `: ${grantMessage}` : "."}`
        : null;

  return (
    <div className="space-y-6">
      <section className="panel">
        <p className="subtle">Member operations</p>
        <h1 className="text-3xl">Members</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Search members and manage access.
        </p>
        {grantBanner && (
          <div className={`banner mt-4 ${grantStatus === "error" ? "error" : "success"}`}>
            {grantBanner}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="text-2xl">Member lookup</h2>
        <p className="text-sm text-muted-foreground">
          Search by Discord ID or username.
        </p>
        {!guildId ? (
          <div className="banner mt-4">Select a guild to search members.</div>
        ) : (
          <form className="form mt-4" action="/admin/members" method="get">
            <input type="hidden" name="guildId" value={guildId} />
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
        )}
        {memberSearchError && <div className="banner error mt-4">{memberSearchError}</div>}
        {memberSearchResults && (
          <>
            {memberSearchResults.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No members found for that search.</p>
            ) : (
              <ul className="result-list mt-4">
                {memberSearchResults.map((member) => {
                  const detailParams = new URLSearchParams();
                  if (guildId) {
                    detailParams.set("guildId", guildId);
                  }
                  detailParams.set("memberId", member.discordUserId);
                  if (memberSearch) {
                    detailParams.set("memberSearch", memberSearch);
                  }
                  const detailHref = `/admin/members?${detailParams.toString()}`;
                  return (
                    <li key={member._id} className="result-item">
                      <div className="result-meta">
                        <strong>{member.discordUsername ?? "Unknown user"}</strong>
                        <span>ID: {member.discordUserId}</span>
                        <span>Updated: {formatTimestamp(member.updatedAt)}</span>
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
        <h2 className="text-2xl">Member snapshot</h2>
        <p className="text-sm text-muted-foreground">
          View grants and audit events.
        </p>
        {!guildId ? (
          <div className="banner mt-4">Select a guild to load member snapshots.</div>
        ) : (
          <form className="form mt-4" action="/admin/members" method="get">
            <input type="hidden" name="guildId" value={guildId} />
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
        )}
        {memberSnapshotError && <div className="banner error mt-4">{memberSnapshotError}</div>}
        {roleSyncError && <div className="banner error mt-4">{roleSyncError}</div>}
        {memberSnapshot && (
          <div className="snapshot-grid mt-4">
            <div className="snapshot-card">
              <h3>Identity</h3>
              <div className="snapshot-meta">
                <span>
                  Username: <strong>{memberSnapshot.memberIdentity?.discordUsername ?? "Unknown"}</strong>
                </span>
                <span>
                  Discord ID: {memberSnapshot.memberIdentity?.discordUserId ?? memberId}
                </span>
                <span>Linked: {formatTimestamp(memberSnapshot.memberIdentity?.createdAt)}</span>
                <span>Updated: {formatTimestamp(memberSnapshot.memberIdentity?.updatedAt)}</span>
              </div>
            </div>
            <div className="snapshot-card">
              <h3>Entitlement grants</h3>
              {memberSnapshot.grants.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No entitlement grants found.</p>
              ) : (
                <ul className="audit-list mt-3">
                  {memberSnapshot.grants.map((grant) => (
                    <li key={grant._id} className="audit-item">
                      <div className="audit-title">{grant.tier?.name ?? "Unknown tier"}</div>
                      <div className="audit-meta">
                        <span>Status: {grant.status}</span>
                        <span>Source: {grant.source}</span>
                        <span>Valid from: {formatTimestamp(grant.validFrom)}</span>
                        <span>Valid through: {formatTimestamp(grant.validThrough)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="snapshot-card">
              <h3>Audit timeline</h3>
              {memberSnapshot.auditEvents.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No audit events found.</p>
              ) : (
                <ul className="audit-list mt-3">
                  {memberSnapshot.auditEvents.map((event) => (
                    <li key={event._id} className="audit-item">
                      <AuditEventContent event={event} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="snapshot-card">
              <h3>Role sync history</h3>
              {roleSyncRequests ? (
                roleSyncRequests.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No role sync requests found.</p>
                ) : (
                  <ul className="audit-list mt-3">
                    {roleSyncRequests.map((request) => (
                      <li key={request._id} className="audit-item">
                        <div className="audit-title">
                          {request.scope === "guild" ? "Guild sync" : "User sync"} - {request.status}
                        </div>
                        <div className="audit-meta">
                          <span>Requested: {formatTimestamp(request.requestedAt)}</span>
                          <span>Updated: {formatTimestamp(request.updatedAt)}</span>
                          {request.completedAt && <span>Completed: {formatTimestamp(request.completedAt)}</span>}
                          <span>
                            Requested by: {request.requestedByActorType ?? "system"}
                            {request.requestedByActorId ? ` (${request.requestedByActorId})` : ""}
                          </span>
                          {request.reason && <span>Reason: {request.reason}</span>}
                          {request.lastError && <span>Error: {request.lastError}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Role sync history is unavailable.</p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="text-2xl">Manual grants</h2>
        <p className="text-sm text-muted-foreground">
          Create or revoke entitlements with audit trails. Leave valid dates empty for immediate,
          ongoing access.
        </p>
        {!guildId ? (
          <div className="banner mt-4">Select a guild to manage grants.</div>
        ) : (
          <>
            {tierListError && <div className="banner error mt-4">{tierListError}</div>}
            <div className="snapshot-grid mt-4">
              <div className="snapshot-card">
                <h3>Create grant</h3>
                <form className="form mt-3" action="/api/admin/grants/create" method="post">
                  <input type="hidden" name="guildId" value={guildId} />
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
                    <input className="input" name="tierId" list="tier-options" placeholder="tier_id" required />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select className="input" name="status" defaultValue="active">
                      <option value="active">active</option>
                      <option value="pending">pending</option>
                      <option value="past_due">past_due</option>
                      <option value="canceled">canceled</option>
                      <option value="expired">expired</option>
                      <option value="suspended_dispute">suspended_dispute</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Valid from (optional)</span>
                    <input className="input" type="datetime-local" name="validFrom" />
                  </label>
                  <label className="field">
                    <span>Valid through (optional)</span>
                    <input className="input" type="datetime-local" name="validThrough" />
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
                      <option key={tier._id} value={tier._id} label={tier.name} />
                    ))}
                  </datalist>
                )}
              </div>
              <div className="snapshot-card">
                <h3>Revoke grant</h3>
                <form className="form mt-3" action="/api/admin/grants/revoke" method="post">
                  <input type="hidden" name="guildId" value={guildId} />
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
          </>
        )}
      </section>
    </div>
  );
}


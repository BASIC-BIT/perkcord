import { cookies } from "next/headers";
import { getAdminGuildIdFromCookies } from "@/lib/guildSelection";
import { getSessionFromCookies } from "@/lib/session";
import { getParam, type SearchParams } from "../admin-helpers";

export default async function AdminOpsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const secret = process.env.PERKCORD_SESSION_SECRET;
  const cookieStore = cookies();
  const session = secret ? getSessionFromCookies(cookieStore, secret) : null;
  const forceSyncStatus = getParam(searchParams?.forceSync);
  const forceSyncRequestId = getParam(searchParams?.requestId);
  const forceSyncError = getParam(searchParams?.message);
  const roleConnectionsStatus = getParam(searchParams?.roleConnectionsStatus);
  const roleConnectionsMessage = getParam(searchParams?.roleConnectionsMessage);
  const roleConnectionsCount = getParam(searchParams?.roleConnectionsCount);
  const selectedGuildId = session ? getAdminGuildIdFromCookies(cookieStore) : null;
  const guildId = getParam(searchParams?.guildId) ?? selectedGuildId;

  const forceSyncBanner =
    forceSyncStatus === "success"
      ? `Force sync requested${forceSyncRequestId ? ` (${forceSyncRequestId})` : ""}.`
      : forceSyncStatus === "error"
        ? `Force sync failed${forceSyncError ? `: ${forceSyncError}` : "."}`
        : null;

  const roleConnectionsBanner =
    roleConnectionsStatus === "success"
      ? `Linked Roles metadata registered${roleConnectionsCount ? ` (${roleConnectionsCount} fields)` : ""}.`
      : roleConnectionsStatus === "error"
        ? `Linked Roles metadata registration failed${roleConnectionsMessage ? `: ${roleConnectionsMessage}` : "."}`
        : null;

  return (
    <div className="space-y-6">
      <section className="panel">
        <p className="subtle">Operational actions</p>
        <h1 className="text-3xl">Ops</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Force sync roles and manage Linked Roles.
        </p>
        {forceSyncBanner && (
          <div className={`banner mt-4 ${forceSyncStatus === "error" ? "error" : "success"}`}>
            {forceSyncBanner}
          </div>
        )}
        {roleConnectionsBanner && (
          <div className={`banner mt-4 ${roleConnectionsStatus === "error" ? "error" : "success"}`}>
            {roleConnectionsBanner}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="text-2xl">Force role sync</h2>
        <p className="text-sm text-muted-foreground">
          Queue a role sync for a user or guild.
        </p>
        {!guildId ? (
          <div className="banner mt-4">Select a guild to request a role sync.</div>
        ) : (
          <form className="form mt-4" action="/api/admin/force-sync" method="post">
            <input type="hidden" name="guildId" value={guildId} />
            <label className="field">
              <span>Scope</span>
              <select className="input" name="scope" defaultValue="user">
                <option value="user">User</option>
                <option value="guild">Guild</option>
              </select>
            </label>
            <label className="field">
              <span>Discord User ID (required for user scope)</span>
              <input className="input" name="discordUserId" placeholder="112233445566778899" />
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
        )}
      </section>

      <section className="panel">
        <h2 className="text-2xl">Linked Roles setup wizard</h2>
        <p className="text-sm text-muted-foreground">
          Optional Linked Roles metadata. Bot roles still control access.
        </p>
        <ol className="step-list mt-4">
          <li className="step-item">
            <div className="step-title">Register metadata schema</div>
            <p className="step-hint">
              This registers the Role Connections metadata fields for this Discord application (one-time per
              app).
            </p>
            <form className="form" action="/api/admin/role-connections/register" method="post">
              <input type="hidden" name="guildId" value={guildId ?? ""} />
              <div className="tier-actions">
                <button className="button secondary" type="submit" disabled={!guildId}>
                  Register metadata schema
                </button>
              </div>
            </form>
            {!guildId && (
              <p className="mt-2 text-xs text-muted-foreground">
                Select a guild to register metadata.
              </p>
            )}
          </li>
          <li className="step-item">
            <div className="step-title">Create a Linked Role in Discord</div>
            <p className="step-hint">
              In the Discord Developer Portal, open your application and add a Linked Role that uses these
              fields.
            </p>
            <div className="meta-grid">
              <div className="meta-card">
                <span className="meta-key">is_active</span>
                <span className="meta-desc">Boolean, true when a member has an active entitlement.</span>
              </div>
              <div className="meta-card">
                <span className="meta-key">tier</span>
                <span className="meta-desc">Integer, higher numbers represent higher tiers.</span>
              </div>
              <div className="meta-card">
                <span className="meta-key">member_since_days</span>
                <span className="meta-desc">Integer, days since the member first received access.</span>
              </div>
            </div>
            <p className="step-hint">
              Suggested conditions: is_active equals true, tier greater than or equal to 1, member_since_days
              greater than or equal to 1.
            </p>
          </li>
          <li className="step-item">
            <div className="step-title">Verify member updates</div>
            <p className="step-hint">
              Entitlement changes will sync metadata automatically. If a member connected before we requested
              <code>role_connections.write</code>, ask them to reconnect.
            </p>
          </li>
        </ol>
        {!session && (
          <div className="banner mt-4">Sign in to access Linked Roles tools.</div>
        )}
      </section>
    </div>
  );
}


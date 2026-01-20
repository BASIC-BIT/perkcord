import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAllowedGuilds } from "@/lib/guildAccess";
import {
  getMemberGuildIdFromCookies,
  getMemberGuildTokenFromCookies,
} from "@/lib/guildSelection";

export default async function SubscribeSelectPage() {
  const cookieStore = cookies();
  const selectedGuildId = getMemberGuildIdFromCookies(cookieStore);
  if (selectedGuildId) {
    redirect("/subscribe");
  }

  const tokenValue = getMemberGuildTokenFromCookies(cookieStore);
  const hasToken = Boolean(tokenValue);
  const guildResult = tokenValue ? await resolveAllowedGuilds(tokenValue) : null;
  const guilds = guildResult?.guilds ?? [];
  const guildError = guildResult?.error ?? null;

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="subtle">Member flow</p>
          <h1 className="text-3xl">Choose your server</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We only show servers where the Perkcord bot is installed.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Back to home
        </Link>
      </div>

      {!hasToken && (
        <div className="mt-6 rounded-2xl border border-border bg-secondary/70 p-6">
          <p className="text-sm text-muted-foreground">
            Connect Discord to load your servers.
          </p>
          <div className="tier-actions mt-4">
            <Link className="button" href="/api/subscribe/guilds?returnTo=/subscribe/select">
              Connect Discord
            </Link>
          </div>
        </div>
      )}

      {hasToken && guildError && (
        <>
          <div className="banner error mt-6">{guildError}</div>
          <div className="tier-actions mt-4">
            <Link className="button secondary" href="/api/subscribe/guilds?returnTo=/subscribe/select">
              Reconnect Discord
            </Link>
          </div>
        </>
      )}

      {hasToken && !guildError && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {guilds.length === 0 ? (
            <div className="banner">
              No shared servers yet. Invite the bot to a Discord server and try again.
            </div>
          ) : (
            guilds.map((guild) => (
              <form
                key={guild._id}
                className="card border border-border p-5 text-left"
                action="/api/subscribe/select-guild"
                method="post"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">{guild.name}</p>
                  </div>
                  <button className="button secondary" type="submit">
                    Select
                  </button>
                </div>
                <input type="hidden" name="guildId" value={guild.discordGuildId} />
                <input type="hidden" name="returnTo" value="/subscribe" />
              </form>
            ))
          )}
        </div>
      )}
    </section>
  );
}

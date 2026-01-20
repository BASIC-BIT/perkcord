import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAllowedGuilds } from "@/lib/guildAccess";
import {
  getAdminDiscordTokenFromCookies,
  getAdminGuildIdFromCookies,
} from "@/lib/guildSelection";
import { getSessionFromCookies } from "@/lib/session";

export default async function AdminSelectGuildPage() {
  const secret = process.env.PERKCORD_SESSION_SECRET;
  const cookieStore = cookies();
  const session = secret ? getSessionFromCookies(cookieStore, secret) : null;
  if (!session) {
    redirect("/admin");
  }

  const selectedGuildId = getAdminGuildIdFromCookies(cookieStore);
  const tokenValue = getAdminDiscordTokenFromCookies(cookieStore);
  const guildResult = await resolveAllowedGuilds(tokenValue);
  const guilds = guildResult.guilds ?? [];
  const guildError = guildResult.error;

  return (
    <div className="space-y-6">
      <section className="panel">
        <p className="subtle">Guild access</p>
        <h1 className="text-3xl">Choose a guild</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Select the guild you want to manage.
        </p>
        {selectedGuildId && (
          <div className="banner mt-4">Current guild selected. Choose a new one below.</div>
        )}
      </section>

      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl">Available guilds</h2>
            <p className="text-sm text-muted-foreground">
              We only show guilds where the bot is installed.
            </p>
          </div>
          <Link className="button secondary" href="/api/auth/discord?returnTo=/admin/select-guild">
            Refresh Discord
          </Link>
        </div>
        {guildError && <div className="banner error mt-4">{guildError}</div>}
        {!guildError && guilds.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            No eligible guilds found. Invite the bot and try again.
          </p>
        )}
        {!guildError && guilds.length > 0 && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {guilds.map((guild) => (
              <form
                key={guild._id}
                className="card border border-border p-5"
                action="/api/admin/select-guild"
                method="post"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-base font-semibold text-foreground">{guild.name}</p>
                  </div>
                  <button className="button secondary" type="submit">
                    Select
                  </button>
                </div>
                <input type="hidden" name="guildId" value={guild._id} />
                <input type="hidden" name="returnTo" value="/admin/overview" />
              </form>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

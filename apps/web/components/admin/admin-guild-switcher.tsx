"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type GuildOption = {
  id: string;
  name: string;
};

type AdminGuildSwitcherProps = {
  guilds: GuildOption[] | null;
  selectedGuildId: string | null;
  error?: string | null;
};

export function AdminGuildSwitcher({
  guilds,
  selectedGuildId,
  error,
}: AdminGuildSwitcherProps) {
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement | null>(null);
  const options = useMemo(() => guilds ?? [], [guilds]);

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-secondary/60 p-3 text-xs text-muted-foreground">
        <p>{error}</p>
        <Link className="mt-2 inline-flex text-xs font-semibold text-primary" href="/api/auth/discord?returnTo=/admin/select-guild">
          Reconnect Discord
        </Link>
      </div>
    );
  }

  if (!options.length) {
    return (
      <div className="rounded-xl border border-border bg-secondary/60 p-3 text-xs text-muted-foreground">
        <p>No guilds available.</p>
        <Link className="mt-2 inline-flex text-xs font-semibold text-primary" href="/admin/select-guild">
          Choose a guild
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} className="space-y-2" action="/api/admin/select-guild" method="post">
      <label className="field text-xs">
        <span>Active guild</span>
        <select
          className="input"
          name="guildId"
          defaultValue={selectedGuildId ?? ""}
          onChange={() => {
            formRef.current?.requestSubmit();
          }}
          required
        >
          <option value="" disabled>
            Select a guild
          </option>
          {options.map((guild) => (
            <option key={guild.id} value={guild.id}>
              {guild.name}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="returnTo" value={pathname} />
    </form>
  );
}

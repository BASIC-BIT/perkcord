import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminGuildIdFromCookies } from "@/lib/guildSelection";
import { getSessionFromCookies } from "@/lib/session";

export default function AdminIndexPage() {
  const secret = process.env.PERKCORD_SESSION_SECRET;
  const cookieStore = cookies();
  const session = secret ? getSessionFromCookies(cookieStore, secret) : null;
  const selectedGuildId = session ? getAdminGuildIdFromCookies(cookieStore) : null;
  if (session && !selectedGuildId) {
    redirect("/admin/select-guild");
  }
  redirect("/admin/overview");
}

import type { ReactNode } from "react";
import { SubscribeShell } from "@/components/subscribe/subscribe-shell";

export default function SubscribeLayout({ children }: { children: ReactNode }) {
  return <SubscribeShell>{children}</SubscribeShell>;
}

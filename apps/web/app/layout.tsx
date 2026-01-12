import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Perkcord Admin",
  description: "Admin portal skeleton for Perkcord",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}

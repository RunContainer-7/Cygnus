import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import ProviderProvider from "@/components/ProviderContext";
import "./globals.css";
import "./builder.css";

export const metadata: Metadata = {
  title: "Cygnus — turn a thought into an app",
  description:
    "Cygnus is a free, open-source AI app builder. Describe an app, watch it get written into a real workspace, and iterate with any model — including local ones.",
};

export const viewport: Viewport = {
  themeColor: "#04050c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ProviderProvider>
          <AppShell>{children}</AppShell>
        </ProviderProvider>
      </body>
    </html>
  );
}

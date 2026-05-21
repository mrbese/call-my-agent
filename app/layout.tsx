import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0f7a5f",
};

export const metadata: Metadata = {
  title: "Call My Agent",
  description: "A local OpenAI Realtime voice app for your OpenClaw agent.",
  applicationName: "Call My Agent",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Agent",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/call-my-agent.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

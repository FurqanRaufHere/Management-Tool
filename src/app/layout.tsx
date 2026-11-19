import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: { default: "TA Desk", template: "%s | TA Desk" },
  description: "Attendance, follow-up emails, class media and daily reports for bootcamp teaching assistants.",
};

export const viewport: Viewport = { themeColor: "#F2F4F1", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

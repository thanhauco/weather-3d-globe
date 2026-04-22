import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Global Forecast Predictor",
  description:
    "Real-time weather intelligence with an interactive 3D globe, day/night cycle, and a 3-day forecasting layer powered by TimescaleDB.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

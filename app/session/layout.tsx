import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { BRAND_NAME } from "@/lib/brand";
import "./session.css";

// Jaagruk Bharat's own typeface, for the end-user window only.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700"],
});

// Private, per-person links — say whose they are in the tab, and keep them
// out of search engines.
export const metadata: Metadata = {
  title: `${BRAND_NAME} — your request`,
  description: `Follow your request with ${BRAND_NAME} and answer any code it needs.`,
  robots: { index: false, follow: false },
};

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return <div className={jakarta.variable}>{children}</div>;
}

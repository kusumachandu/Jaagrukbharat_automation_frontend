import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";

// Private, per-person links — say whose they are in the tab, and keep them
// out of search engines.
export const metadata: Metadata = {
  title: `${BRAND_NAME} — your request`,
  description: `Follow your request with ${BRAND_NAME} and answer any code it needs.`,
  robots: { index: false, follow: false },
};

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { BRAND_NAME } from "@/lib/brand";
import "../session/session.css";

// Same look as the session window, which this page hands over to.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700"],
});

// A private, per-person link: say whose it is in the tab, and keep it out of search engines.
export const metadata: Metadata = {
  title: `${BRAND_NAME} — start your application`,
  description: `Start your application with ${BRAND_NAME}.`,
  robots: { index: false, follow: false },
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return <div className={jakarta.variable}>{children}</div>;
}

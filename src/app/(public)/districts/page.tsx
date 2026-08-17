import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /districts was a thin duplicate of the district grid on /research#districts;
 * one page owns the district reports.
 */
export default function DistrictsRedirectPage() {
  permanentRedirect("/research#districts");
}

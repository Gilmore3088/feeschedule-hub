import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** /consumer duplicated /institutions; the directory is the one public lookup. */
export default function ConsumerRedirectPage() {
  permanentRedirect("/institutions");
}

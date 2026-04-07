import { permanentRedirect } from "next/navigation";

export default function HamiltonIndexPage() {
  permanentRedirect("/admin/hamilton/chat");
}

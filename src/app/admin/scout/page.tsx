import { permanentRedirect } from "next/navigation";

export default function ScoutRedirect() {
  permanentRedirect("/admin/hamilton");
}

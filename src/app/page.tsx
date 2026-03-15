import type { Metadata } from "next";
import GatewayClient from "./gateway-client";

export const metadata: Metadata = {
  title: "Fee Insight - Compare Bank Fees Nationwide",
  description:
    "The national benchmark for retail banking fees. Compare fees for consumers or access institutional-grade intelligence for professionals.",
};

export default function GatewayPage() {
  return <GatewayClient />;
}

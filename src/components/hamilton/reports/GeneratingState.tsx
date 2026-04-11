import { Loader2 } from "lucide-react";

export function GeneratingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8">
      <Loader2
        size={32}
        className="animate-spin mb-6"
        style={{ color: "var(--hamilton-accent)" }}
      />
      <p
        className="text-[15px] leading-relaxed text-center"
        style={{ color: "var(--hamilton-text-secondary)" }}
      >
        Hamilton is writing your report...
      </p>
    </div>
  );
}

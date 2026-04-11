"use client";

interface Props {
  reason: string;
}

export function InsufficientConfidenceGate({ reason }: Props) {
  return (
    <div
      className="rounded-lg border px-5 py-5 flex flex-col gap-2"
      style={{
        background: "rgb(255 251 235)", // amber-50
        borderColor: "rgb(252 211 77)", // amber-300
      }}
    >
      <h3
        className="text-base font-semibold"
        style={{
          fontFamily: "var(--hamilton-font-serif)",
          color: "rgb(120 53 15)", // amber-900
        }}
      >
        Simulation Blocked
      </h3>
      <p className="text-sm" style={{ color: "rgb(146 64 14)" }}>
        {reason}
      </p>
      <p className="text-xs" style={{ color: "rgb(180 83 9)" }}>
        Select a fee category with at least 10 approved observations to run a simulation.
      </p>
    </div>
  );
}

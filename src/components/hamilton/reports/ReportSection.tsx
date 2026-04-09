interface ReportSectionProps {
  heading: string;
  children: React.ReactNode;
  ariaLabel?: string;
}

export function ReportSection({ heading, children, ariaLabel }: ReportSectionProps) {
  return (
    <section
      aria-label={ariaLabel ?? heading}
      className="py-8 border-b"
      style={{ borderColor: "var(--hamilton-border)" }}
    >
      <h2
        className="text-xl font-semibold mb-4 leading-snug"
        style={{
          fontFamily: "var(--hamilton-font-serif)",
          color: "var(--hamilton-text-primary)",
        }}
      >
        {heading}
      </h2>
      {children}
    </section>
  );
}

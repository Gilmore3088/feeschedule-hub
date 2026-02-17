export function Footer() {
  return (
    <footer className="border-t bg-slate-50 py-12">
      <div className="mx-auto max-w-6xl px-4 text-center">
        <p className="text-sm font-semibold">
          Bank Fee<span className="text-primary/60"> Index</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Fee benchmarking for banks and credit unions.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Bank Fee Index. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

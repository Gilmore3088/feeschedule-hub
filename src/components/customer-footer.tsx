export function CustomerFooter() {
  return (
    <footer className="border-t border-[#E8DFD1] mt-12">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#A69D90]">
          <span>Bank Fee Index &mdash; hello@bankfeeindex.com</span>
          <div className="flex gap-6">
            <a href="/api-docs" className="hover:text-[#7A7062] transition-colors">API</a>
            <a href="/subscribe" className="hover:text-[#7A7062] transition-colors">Pricing</a>
            <a href="/guides" className="hover:text-[#7A7062] transition-colors">Guides</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

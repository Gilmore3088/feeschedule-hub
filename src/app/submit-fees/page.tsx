import { SubmitForm } from "./submit-form";

export const metadata = {
  title: "Submit Fees | Fee Insight",
  description: "Help improve Fee Insight coverage by submitting fee data from your bank or credit union.",
};

export default function SubmitFeesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Submit Fee Data
        </h1>
        <p className="text-sm text-gray-500 mt-2 max-w-lg">
          Help us build the most comprehensive bank fee database. Submit fee
          information from your institution&apos;s fee schedule and we&apos;ll
          review it for inclusion in the index.
        </p>
      </div>

      <SubmitForm />

      <div className="mt-12 border-t pt-8 text-xs text-gray-400 max-w-lg space-y-2">
        <p>
          All submissions are reviewed before inclusion. We verify data against
          the source URL you provide. Submissions are limited to 5 per minute.
        </p>
        <p>
          By submitting, you confirm the fee data is publicly available from the
          institution&apos;s website or official documents.
        </p>
      </div>
    </div>
  );
}

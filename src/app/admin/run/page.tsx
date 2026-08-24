export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { RunSteps } from "./run-steps";

/**
 * The routine job, on one page: label the legacy backlog, check it, publish it.
 *
 * The full console at /admin is the right place to see everything at once. This
 * page is the opposite of that on purpose — three buttons in a fixed order, no
 * banners, no hunting.
 */
export default async function AdminRunPage() {
  await requireAuth("view");

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        Run the data pipeline
      </h1>
      <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        Top to bottom, in order. Step 1 repeats until it reports nothing left to
        label; steps 2 and 3 run once after it.
      </p>

      <div className="mt-8">
        <RunSteps />
      </div>

      <p className="mt-10 text-xs text-gray-500 dark:text-gray-500">
        <Link href="/admin" className="font-semibold underline underline-offset-2">
          Full console
        </Link>
        {" — every job, every lane, the stop controls."}
      </p>
    </main>
  );
}

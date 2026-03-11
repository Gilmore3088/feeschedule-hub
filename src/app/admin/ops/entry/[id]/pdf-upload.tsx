"use client";

import { useState, useTransition, useCallback } from "react";
import { uploadPdf, getUploadJobStatus } from "../../actions";

interface PdfUploadProps {
  targetId: number;
}

export function PdfUpload({ targetId }: PdfUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [jobStatus, setJobStatus] = useState<{
    jobId: number;
    status: string;
    feeCount: number | null;
    error: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.toLowerCase().endsWith(".pdf")) {
      setFile(dropped);
      setError(null);
    } else {
      setError("Only PDF files are accepted");
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError(null);
    }
  }, []);

  function handleUpload() {
    if (!file) return;
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      try {
        const { jobId } = await uploadPdf(targetId, formData);
        setJobStatus({ jobId, status: "queued", feeCount: null, error: null });

        // Poll for completion
        const poll = async () => {
          const job = await getUploadJobStatus(jobId);
          if (!job) return;

          if (job.status === "completed") {
            setJobStatus({
              jobId,
              status: "completed",
              feeCount: job.fee_count,
              error: null,
            });
          } else if (job.status === "failed") {
            setJobStatus({
              jobId,
              status: "failed",
              feeCount: null,
              error: job.error_message,
            });
          } else {
            // Still processing — poll again
            setTimeout(poll, 3000);
          }
        };

        // Start polling after a short delay
        setTimeout(poll, 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragOver
            ? "border-blue-400 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-900/20"
            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
        }`}
      >
        {file ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {file.name}
            </p>
            <p className="text-xs text-gray-400">
              {(file.size / 1024).toFixed(0)} KB
            </p>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="text-xs text-red-500 hover:text-red-600"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Drag & drop a PDF fee schedule here
            </p>
            <label className="inline-block cursor-pointer">
              <span className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                or browse files
              </span>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <p className="text-[10px] text-gray-400">Max 10MB, PDF only</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {jobStatus && (
        <div className={`rounded-md px-3 py-2 text-sm ${
          jobStatus.status === "completed"
            ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
            : jobStatus.status === "failed"
              ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
              : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
        }`}>
          {jobStatus.status === "queued" && "Upload queued. Waiting for processing..."}
          {jobStatus.status === "processing" && "Extracting fees from PDF..."}
          {jobStatus.status === "completed" && `Done! Extracted ${jobStatus.feeCount} fee(s). They are now in the review queue as "staged".`}
          {jobStatus.status === "failed" && `Failed: ${jobStatus.error}`}
        </div>
      )}

      {file && !jobStatus && (
        <button
          type="button"
          onClick={handleUpload}
          disabled={isPending}
          className="h-8 rounded-md bg-gray-900 dark:bg-white/10 px-4 text-xs font-medium text-white hover:bg-gray-800 dark:hover:bg-white/20 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Uploading..." : "Upload & Extract Fees"}
        </button>
      )}
    </div>
  );
}

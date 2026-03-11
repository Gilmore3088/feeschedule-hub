"""Process queued PDF upload jobs.

Picks up queued jobs from upload_jobs table, extracts text from PDFs,
runs LLM extraction, and stores results as source='pdf_upload' fees.

Run manually or via cron:
    python -m fee_crawler process-uploads
"""

from pathlib import Path

from fee_crawler.config import Config
from fee_crawler.db import Database
from fee_crawler.pipeline.extract_pdf import extract_text_from_pdf
from fee_crawler.pipeline.extract_llm import extract_fees_with_llm
from fee_crawler.validation import validate_and_classify_fees, flags_to_json


def run(db: Database, config: Config) -> None:
    """Process all queued PDF upload jobs."""
    jobs = db.fetchall(
        "SELECT * FROM upload_jobs WHERE status = 'queued' ORDER BY created_at"
    )

    if not jobs:
        print("No queued upload jobs.")
        return

    print(f"Processing {len(jobs)} upload job(s)...")

    for job in jobs:
        job_id = job["id"]
        target_id = job["crawl_target_id"]
        file_path = job["file_path"]
        file_name = job["file_name"] or Path(file_path).name

        print(f"\n  Job #{job_id}: {file_name} (target {target_id})")

        # Mark as processing
        db.execute(
            "UPDATE upload_jobs SET status = 'processing' WHERE id = ?",
            (job_id,),
        )
        db.commit()

        try:
            # Read PDF
            pdf_path = Path(file_path)
            if not pdf_path.exists():
                raise FileNotFoundError(f"PDF not found: {file_path}")

            with open(pdf_path, "rb") as f:
                content = f.read()

            # Extract text
            text = extract_text_from_pdf(content)
            if not text or len(text.strip()) < 50:
                raise ValueError("No text could be extracted from PDF")

            print(f"    Extracted {len(text):,} chars of text")

            # LLM extraction
            fees = extract_fees_with_llm(text, config)
            print(f"    LLM found {len(fees)} fee(s)")

            # Validate
            validated = validate_and_classify_fees(fees, config)

            # Create a synthetic crawl_result for audit trail
            result_id = db.insert_returning_id(
                """INSERT INTO crawl_results
                   (crawl_run_id, crawl_target_id, status, document_url,
                    document_path, fees_extracted)
                   VALUES (0, ?, 'manual', ?, ?, ?)""",
                (target_id, f"upload:{file_name}", file_path, len(validated)),
            )

            # Insert fees with source='pdf_upload'
            staged = 0
            flagged = 0
            for fee, flags, review_status in validated:
                db.execute(
                    """INSERT INTO extracted_fees
                       (crawl_result_id, crawl_target_id, fee_name, amount,
                        frequency, conditions, extraction_confidence,
                        review_status, validation_flags, source)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pdf_upload')""",
                    (result_id, target_id, fee.fee_name, fee.amount,
                     fee.frequency, fee.conditions, fee.confidence,
                     review_status, flags_to_json(flags)),
                )
                if review_status == "staged":
                    staged += 1
                elif review_status == "flagged":
                    flagged += 1

            # Mark job as completed
            db.execute(
                """UPDATE upload_jobs
                   SET status = 'completed',
                       fee_count = ?,
                       completed_at = datetime('now')
                   WHERE id = ?""",
                (len(validated), job_id),
            )
            db.commit()

            status_msg = f"{len(validated)} fees"
            if staged:
                status_msg += f" ({staged} staged)"
            if flagged:
                status_msg += f" ({flagged} flagged)"
            print(f"    Done: {status_msg}")

        except Exception as e:
            # Mark job as failed
            db.execute(
                """UPDATE upload_jobs
                   SET status = 'failed',
                       error_message = ?,
                       completed_at = datetime('now')
                   WHERE id = ?""",
                (str(e)[:500], job_id),
            )
            db.commit()
            print(f"    FAILED: {e}")

    print("\nAll upload jobs processed.")

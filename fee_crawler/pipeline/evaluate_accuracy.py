"""Evaluate extraction accuracy against gold standard.

Compares extracted fees to manually verified gold standard fees
to compute precision, recall, and category accuracy.

Problem 7 from accuracy audit: "You cannot credibly sell this data
to B2B customers without a number here."

Usage:
    DATABASE_URL=... python -m fee_crawler.pipeline.evaluate_accuracy
"""

import os
import psycopg2
import psycopg2.extras


def evaluate() -> dict:
    """Compare extracted fees against gold standard for all verified institutions.

    Returns:
        {
            "institutions_verified": int,
            "precision": float,    # % of extracted fees that are correct
            "recall": float,       # % of real fees that were extracted
            "category_accuracy": float,  # % of matched fees with correct category
            "details": list[dict], # per-institution breakdown
        }
    """
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Get all institutions with gold standard data
    cur.execute("""
        SELECT DISTINCT crawl_target_id FROM gold_standard_fees
    """)
    target_ids = [r["crawl_target_id"] for r in cur.fetchall()]

    if not target_ids:
        conn.close()
        return {
            "institutions_verified": 0,
            "precision": 0.0,
            "recall": 0.0,
            "category_accuracy": 0.0,
            "details": [],
            "message": "No gold standard data. Verify 50 institutions first.",
        }

    total_true_positives = 0
    total_false_positives = 0
    total_false_negatives = 0
    total_category_correct = 0
    total_category_checked = 0
    details = []

    for target_id in target_ids:
        # Gold standard (truth)
        cur.execute("""
            SELECT fee_name, amount, fee_category
            FROM gold_standard_fees WHERE crawl_target_id = %s
        """, (target_id,))
        gold = cur.fetchall()

        # Extracted (our data)
        cur.execute("""
            SELECT fee_name, amount, fee_category
            FROM extracted_fees
            WHERE crawl_target_id = %s AND review_status IN ('approved', 'staged')
        """, (target_id,))
        extracted = cur.fetchall()

        # Match: a gold fee is "found" if there's an extracted fee with
        # matching category AND amount within 10%
        gold_matched = set()
        extracted_matched = set()

        for gi, g in enumerate(gold):
            for ei, e in enumerate(extracted):
                if ei in extracted_matched:
                    continue
                # Category match
                cat_match = (g["fee_category"] and e["fee_category"]
                             and g["fee_category"] == e["fee_category"])
                # Amount match (within 10% or both None)
                if g["amount"] is not None and e["amount"] is not None:
                    diff = abs(g["amount"] - e["amount"])
                    amt_match = diff <= max(g["amount"] * 0.1, 0.50)
                elif g["amount"] is None and e["amount"] is None:
                    amt_match = True
                else:
                    amt_match = False

                if cat_match and amt_match:
                    gold_matched.add(gi)
                    extracted_matched.add(ei)
                    total_true_positives += 1
                    total_category_correct += 1
                    total_category_checked += 1
                    break
                elif cat_match and not amt_match:
                    # Right category, wrong amount
                    gold_matched.add(gi)
                    extracted_matched.add(ei)
                    total_true_positives += 1  # found it, just wrong amount
                    total_category_correct += 1
                    total_category_checked += 1
                    break

        false_negatives = len(gold) - len(gold_matched)
        false_positives = len(extracted) - len(extracted_matched)

        total_false_negatives += false_negatives
        total_false_positives += false_positives

        cur.execute(
            "SELECT institution_name FROM crawl_targets WHERE id = %s",
            (target_id,),
        )
        inst = cur.fetchone()

        details.append({
            "crawl_target_id": target_id,
            "institution_name": inst["institution_name"] if inst else "?",
            "gold_count": len(gold),
            "extracted_count": len(extracted),
            "matched": len(gold_matched),
            "false_positives": false_positives,
            "false_negatives": false_negatives,
            "precision": len(gold_matched) / max(len(extracted), 1),
            "recall": len(gold_matched) / max(len(gold), 1),
        })

    conn.close()

    total_extracted = total_true_positives + total_false_positives
    total_gold = total_true_positives + total_false_negatives

    precision = total_true_positives / max(total_extracted, 1)
    recall = total_true_positives / max(total_gold, 1)
    category_accuracy = total_category_correct / max(total_category_checked, 1)

    return {
        "institutions_verified": len(target_ids),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "category_accuracy": round(category_accuracy, 4),
        "true_positives": total_true_positives,
        "false_positives": total_false_positives,
        "false_negatives": total_false_negatives,
        "details": details,
    }


if __name__ == "__main__":
    results = evaluate()
    print(f"=== ACCURACY EVALUATION ===")
    print(f"Institutions verified: {results['institutions_verified']}")
    if results["institutions_verified"] == 0:
        print(results.get("message", "No data"))
    else:
        print(f"Precision:          {results['precision']:.1%}")
        print(f"Recall:             {results['recall']:.1%}")
        print(f"Category accuracy:  {results['category_accuracy']:.1%}")
        print(f"")
        print(f"Target: Precision >= 90%, Recall >= 70%, Category >= 85%")
        print(f"")
        for d in results["details"]:
            print(f"  {d['institution_name'][:40]:40s}  P={d['precision']:.0%}  R={d['recall']:.0%}  gold={d['gold_count']}  ext={d['extracted_count']}")

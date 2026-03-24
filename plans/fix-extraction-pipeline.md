# Extraction Pipeline: Format-Independent Processing

## Problem

Current pipeline has one path that tries to handle everything. Result: 16% success rate. PDFs work (80%), HTML fails (10%), JS pages fail (5%).

## Solution

Three independent extraction paths, same output format. Each path:
1. Downloads the source document
2. Stores original in R2 (content-addressed)
3. Extracts text
4. Sends to LLM (Haiku)
5. Validates + categorizes fees
6. Writes to extracted_fees

```
        ┌─── PDF Path ────────────────────────────────┐
        │  download → R2 → pdfplumber → LLM → fees   │
        │  (also: OCR fallback for scanned PDFs)      │
        ├─── HTML Path ───────────────────────────────┤
URL ──→ │  download → R2 → BeautifulSoup → LLM → fees│
        │  (also: find embedded PDF links → PDF path) │
        ├─── JS Path ─────────────────────────────────┤
        │  Playwright → R2 → BeautifulSoup → LLM → fees│
        │  (for React/Angular/Vue/bot-protected)      │
        └─────────────────────────────────────────────┘
                              ↓
                    Same output: extracted_fees
                    Same validation: fee_amount_rules
                    Same categorization: fee_analysis
```

## What to build

### 1. Force R2 storage for ALL documents

Every downloaded document (PDF or HTML) gets stored in R2 before any processing. This means:
- We can re-extract without re-downloading
- We can review source documents in the admin
- We have a permanent archive

### 2. Re-crawl all 2,939 institutions with fee URLs

Clear content hashes to force re-download. Store everything in R2. Re-extract with improved pipeline.

### 3. Format router

After download, route to the right extractor:
- Content-Type contains 'pdf' → PDF path
- Content-Type contains 'html' AND needs_browser_fallback() → JS path
- Content-Type contains 'html' → HTML path (check for embedded PDFs first)

### 4. Each path stores document + extracts independently

The output of every path is the same:
```python
{
  "text": str,           # extracted text for LLM
  "r2_key": str,         # content-addressed R2 key
  "strategy": str,       # direct_pdf | static_html | playwright_html
  "source_type": str,    # pdf | html
}
```

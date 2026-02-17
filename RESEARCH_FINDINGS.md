# Fee Schedule Extraction Pipeline - Technology Research

Research conducted on 2026-02-14 for building a Python pipeline to crawl, extract, and store bank fee schedules.

---

## Executive Summary

This document provides comprehensive research on tools and frameworks for building a pipeline that:
1. Crawls bank/credit union websites to find PDF fee schedules
2. Extracts structured table data from PDFs
3. Uses Claude API to parse unstructured text into structured data
4. Stores results in PostgreSQL via Supabase
5. Runs on a scheduled basis

### Recommended Tech Stack

- **Web Crawling**: Crawl4AI (LLM-friendly) or Scrapy (enterprise-scale)
- **Browser Automation**: Playwright (for JavaScript-heavy sites)
- **PDF Table Extraction**: pdfplumber (flexible) or Camelot (lattice tables)
- **PDF Text Extraction**: PyMuPDF (fast fallback for unstructured content)
- **LLM Integration**: Anthropic Claude API with tool use for structured output
- **Database**: Supabase Python client
- **Scheduling**: APScheduler (feature-rich) or schedule (simple)

---

## 1. Web Crawling Solutions

### 1.1 Crawl4AI

**Overview**: Open-source LLM-friendly web crawler designed for AI applications and RAG pipelines. Launched mid-2024, rapidly gained 58,000+ GitHub stars.

**Official Documentation**: [https://docs.crawl4ai.com/](https://docs.crawl4ai.com/)

**Installation**:
```bash
pip install -U crawl4ai
crawl4ai-setup  # Post-installation setup
crawl4ai-doctor # Verify installation
```

**Key Features**:
- Built-in JavaScript rendering via browser automation
- LLM-native output (clean Markdown)
- Asynchronous architecture (asyncio)
- Adaptive crawling (knows when to stop)
- Multiple extraction strategies (CSS, XPath, LLM-based)
- Automatic HTML-to-Markdown conversion

**Basic Usage**:
```python
import asyncio
from crawl4ai import AsyncWebCrawler

async def main():
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun("https://example.com")
        print(result.markdown[:300])

asyncio.run(main())
```

**Finding PDFs**:
Use CSS extraction strategy to find PDF links:
```python
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

schema = {
    "name": "PDF Links",
    "baseSelector": "a[href$='.pdf']",
    "fields": [
        {"name": "url", "selector": "a", "type": "attribute", "attribute": "href"},
        {"name": "text", "selector": "a", "type": "text"}
    ]
}

strategy = JsonCssExtractionStrategy(schema)
config = CrawlerRunConfig(extraction_strategy=strategy)

async with AsyncWebCrawler() as crawler:
    result = await crawler.arun("https://bank.example.com/fees", config=config)
    pdf_links = result.extracted_content
```

**Strengths**:
- Zero configuration for JavaScript-heavy sites
- Excellent for feeding data to LLMs
- Clean, structured output
- Simple API

**Limitations**:
- Younger project (less mature than Scrapy)
- Python GIL limits beyond hundreds of concurrent requests
- Browser memory overhead for massive scale
- Limited enterprise plugin ecosystem

**Use Cases**:
- PDF discovery on JavaScript-rendered pages
- LLM-friendly content extraction
- Medium-scale crawling (hundreds of URLs)
- Quick prototyping

**Sources**:
- [Crawl4AI Documentation](https://docs.crawl4ai.com/)
- [Crawl4AI GitHub](https://github.com/unclecode/crawl4ai)
- [Best Open-Source Web Crawlers in 2026](https://www.firecrawl.dev/blog/best-open-source-web-crawler)
- [Crawl4AI vs Scrapy Comparison](https://slashdot.org/software/comparison/Crawl4AI-vs-Scrapy/)

---

### 1.2 Scrapy

**Overview**: Production-grade web scraping framework (released 2008). De facto standard for Python web scraping at enterprise scale.

**Official Documentation**: [https://docs.scrapy.org/](https://docs.scrapy.org/)

**Installation**:
```bash
pip install scrapy
```

**Requires**: Python 3.10+

**Key Features**:
- HTTP-only (fast for static content)
- Robust plugin ecosystem
- Built-in duplicate filtering
- Rate limiting and delays
- Item pipelines for processing
- Highly scalable (millions of requests)
- Low memory overhead
- Asynchronous architecture

**Best Practices for Focused Crawling**:

1. **Rate Limiting**:
```python
# settings.py
CONCURRENT_REQUESTS = 16  # Default, adjust as needed
DOWNLOAD_DELAY = 2  # Seconds between requests
RANDOMIZE_DOWNLOAD_DELAY = True  # Add variability
```

2. **Following Links**:
```python
class FeeScheduleSpider(scrapy.Spider):
    name = "fee_schedules"
    start_urls = ["https://bank.example.com/fees"]

    def parse(self, response):
        # Find PDF links
        for pdf_link in response.css("a[href$='.pdf']::attr(href)").getall():
            yield {
                'file_urls': [response.urljoin(pdf_link)],
                'source_page': response.url
            }

        # Follow pagination
        next_page = response.css("a.next::attr(href)").get()
        if next_page:
            yield response.follow(next_page, self.parse)
```

3. **Downloading PDFs with FilesPipeline**:
```python
# settings.py
ITEM_PIPELINES = {
    'scrapy.pipelines.files.FilesPipeline': 1
}
FILES_STORE = '/path/to/pdfs'
FILES_URLS_FIELD = 'file_urls'  # Field containing PDF URLs
FILES_RESULT_FIELD = 'files'    # Results metadata
```

**How FilesPipeline Works**:
- URLs from `file_urls` field are scheduled for download
- Downloaded files populate `files` field with metadata (path, URL, checksum, status)
- Files stored as `<FILES_STORE>/full/<SHA1_HASH>.pdf`
- Automatic duplicate detection via checksum

**Custom File Organization**:
```python
from scrapy.pipelines.files import FilesPipeline

class CustomFilesPipeline(FilesPipeline):
    def file_path(self, request, response=None, info=None, *, item=None):
        # Custom naming: bank_name/fee_schedule_2026.pdf
        return f"{item['bank_name']}/fee_schedule_{item['year']}.pdf"
```

**Strengths**:
- Battle-tested at enterprise scale
- Extensive plugin ecosystem
- Very fast for static HTML
- Low resource usage
- Active community support

**Limitations**:
- No built-in JavaScript rendering (requires Playwright/Selenium integration)
- Steeper learning curve
- More complex setup than Crawl4AI

**Use Cases**:
- Large-scale crawling (1,000+ URLs)
- Static HTML pages
- Complex data pipelines
- Production deployments with monitoring

**Sources**:
- [Scrapy Documentation](https://docs.scrapy.org/)
- [Web Scraping With Scrapy: Complete Guide 2026](https://scrapfly.io/blog/posts/web-scraping-with-scrapy)
- [Scrapy File Downloads](https://docs.scrapy.org/en/latest/topics/media-pipeline.html)
- [Crawlee vs Scrapy vs BeautifulSoup 2026](https://use-apify.com/blog/crawlee-vs-scrapy-vs-beautifulsoup-2026)

---

### 1.3 Playwright

**Overview**: Browser automation library supporting Chromium, Firefox, and WebKit. Essential for JavaScript-rendered pages.

**Official Documentation**: [https://playwright.dev/python/](https://playwright.dev/python/)

**Installation**:
```bash
pip install playwright
playwright install  # Downloads browser binaries
```

**Key Features**:
- Auto-wait for elements before actions
- Web-first assertions with automatic retries
- Browser contexts (isolated sessions)
- Codegen for recording actions
- Screenshot and PDF generation
- Network interception
- Sync and async APIs

**Handling JavaScript-Rendered Pages**:
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate and wait for network idle
    page.goto("https://bank.example.com/fees", wait_until="networkidle")

    # Wait for specific content
    page.wait_for_selector(".fee-schedule-links")

    # Extract PDF links
    pdf_links = page.locator("a[href$='.pdf']").all()
    urls = [link.get_attribute("href") for link in pdf_links]

    browser.close()
```

**Downloading PDFs**:
```python
from playwright.async_api import async_playwright

async def download_pdf():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()

        await page.goto("https://bank.example.com/fees")

        # Wait for download to start
        async with page.expect_download() as download_info:
            await page.get_by_text("Download Fee Schedule").click()

        download = await download_info.value
        await download.save_as(f"/pdfs/{download.suggested_filename}")

        await browser.close()
```

**Wait Strategies**:
```python
# Wait until page load event
page.goto(url, wait_until="load")

# Wait until DOM is ready (faster)
page.goto(url, wait_until="domcontentloaded")

# Wait until network is idle (discouraged, use selectors instead)
page.goto(url, wait_until="networkidle")

# Better: Wait for specific elements
page.wait_for_selector(".content-ready")
```

**Strengths**:
- Excellent JavaScript handling
- Auto-wait reduces race conditions
- Multiple browser support
- Great for dynamic content

**Limitations**:
- Slower than HTTP-only crawlers
- Higher memory usage (browser processes)
- Overkill for static pages

**Use Cases**:
- JavaScript-heavy banking portals
- Sites with dynamic fee schedule loading
- AJAX-based navigation
- Downloading PDFs behind clicks

**Sources**:
- [Playwright Python Documentation](https://playwright.dev/python/)
- [Playwright Downloads](https://playwright.dev/python/docs/downloads)
- [How to Wait for Page Load in Playwright](https://www.scrapingbee.com/webscraping-questions/playwright/how-to-wait-for-page-to-load-in-playwright/)
- [How to Download Files with Playwright](https://www.browserstack.com/guide/playwright-download-file)

---

## 2. PDF Processing Solutions

### 2.1 pdfplumber

**Overview**: PDF text and table extraction library built on pdfminer.six. Best for machine-generated PDFs with complex layouts.

**Official Repository**: [https://github.com/jsvine/pdfplumber](https://github.com/jsvine/pdfplumber)

**Installation**:
```bash
pip install pdfplumber
```

**Key Features**:
- Detailed character-level information
- Flexible table detection
- Visual debugging with `.to_image()`
- Customizable extraction strategies
- Coordinate-based extraction
- Works with text-based PDFs (not scanned)

**Basic Table Extraction**:
```python
import pdfplumber

with pdfplumber.open("fee_schedule.pdf") as pdf:
    first_page = pdf.pages[0]

    # Extract single table
    table = first_page.extract_table()

    # Extract all tables
    tables = first_page.extract_tables()

    # Process to DataFrame
    import pandas as pd
    df = pd.DataFrame(table[1:], columns=table[0])
```

**Custom Table Settings** (for fee schedules without borders):
```python
table_settings = {
    "vertical_strategy": "text",    # Use text positions instead of lines
    "horizontal_strategy": "text",
    "intersection_tolerance": 3,    # Pixel tolerance for line intersections
}

table = page.extract_table(table_settings)
```

**Advanced: Cropping to Table Region**:
```python
# Fee schedules often have headers/footers to exclude
bbox = (50, 100, 550, 700)  # (x0, y0, x1, y1)
cropped_page = page.within_bbox(bbox)
table = cropped_page.extract_table()
```

**Visual Debugging**:
```python
# See what pdfplumber detects
im = page.to_image(resolution=150)
im.debug_tablefinder()  # Show detected table edges
im.show()
```

**Handling Multi-Page Fee Schedules**:
```python
all_tables = []
with pdfplumber.open("fee_schedule.pdf") as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
        all_tables.extend(tables)

# Combine into single DataFrame
import pandas as pd
dfs = [pd.DataFrame(t[1:], columns=t[0]) for t in all_tables if t]
combined_df = pd.concat(dfs, ignore_index=True)
```

**Strengths**:
- Excellent for complex layouts
- Highly customizable
- Visual debugging tools
- Good documentation

**Limitations**:
- Text-based PDFs only (no OCR)
- Requires tuning for optimal results
- Slower than some alternatives

**Use Cases**:
- Fee schedules with complex layouts
- Tables without clear borders
- Multi-column documents
- PDFs requiring visual verification

**Sources**:
- [pdfplumber GitHub](https://github.com/jsvine/pdfplumber)
- [pdfplumber PyPI](https://pypi.org/project/pdfplumber/)
- [Guide to pdfplumber](https://unstract.com/blog/guide-to-pdfplumber-text-and-table-extraction-capabilities/)
- [Extract Tables from PDF Python](https://www.geeksforgeeks.org/python/how-to-extract-pdf-tables-in-python/)

---

### 2.2 Camelot

**Overview**: PDF table extraction library with dual parsing methods (Stream and Lattice). Optimized for well-structured tables.

**Official Documentation**: [https://camelot-py.readthedocs.io/](https://camelot-py.readthedocs.io/)

**Installation**:
```bash
pip install camelot-py[base]
# Additional dependencies for Ghostscript
```

**Key Features**:
- Two parsing modes: Stream and Lattice
- Quality metrics (accuracy, whitespace)
- Table filtering by metrics
- Export to CSV, JSON, Excel, HTML, SQLite
- Visual debugging

**Parsing Methods**:

1. **Lattice Mode** (for tables with visible lines):
```python
import camelot

# Best for bordered tables
tables = camelot.read_pdf("fee_schedule.pdf", flavor="lattice")

# Access first table
table = tables[0]
print(f"Accuracy: {table.accuracy}")
print(f"Whitespace: {table.whitespace}")

# Export to DataFrame
df = table.df

# Export to CSV
table.to_csv("fees.csv")
```

2. **Stream Mode** (for tables using whitespace):
```python
# Best for borderless tables
tables = camelot.read_pdf("fee_schedule.pdf", flavor="stream")
```

**Quality Filtering**:
```python
# Only keep high-quality tables
good_tables = [t for t in tables if t.accuracy > 80 and t.whitespace < 50]
```

**Multi-Page Extraction**:
```python
# Extract from specific pages
tables = camelot.read_pdf("fee_schedule.pdf", pages="1-3,5")

# Extract from all pages
tables = camelot.read_pdf("fee_schedule.pdf", pages="all")
```

**Comparison with pdfplumber**:

| Feature | Camelot | pdfplumber |
|---------|---------|------------|
| Ease of Use | Easy | Moderate |
| Complex Tables | Requires tuning | Excellent with settings |
| Quality Metrics | Built-in | Manual verification |
| Visual Debug | Yes | Yes |
| Speed | Fast | Moderate |
| OCR Support | No | No |

**Strengths**:
- Easy to use for standard tables
- Built-in quality metrics
- Good for batch processing
- Multiple export formats

**Limitations**:
- Text-based PDFs only
- May struggle with complex layouts
- Less flexible than pdfplumber

**Use Cases**:
- Well-structured fee tables
- Batch processing many PDFs
- When quality metrics needed
- Bordered tables (Lattice mode)

**Sources**:
- [Camelot Documentation](https://camelot-py.readthedocs.io/)
- [Camelot GitHub](https://github.com/camelot-dev/camelot)
- [Comparison with Other Tools](https://github.com/camelot-dev/camelot/wiki/Comparison-with-other-PDF-Table-Extraction-libraries-and-tools)
- [Best Python Libraries to Extract Tables](https://unstract.com/blog/extract-tables-from-pdf-python/)

---

### 2.3 PyMuPDF (fitz)

**Overview**: High-performance PDF library for text extraction, analysis, and manipulation. 3x faster than pdftotext, 30-45x faster than pdfminer/PyPDF2.

**Official Documentation**: [https://pymupdf.readthedocs.io/](https://pymupdf.readthedocs.io/)

**Installation**:
```bash
pip install pymupdf
```

**Import Note**: Newer versions use `pymupdf`, but `fitz` works as fallback for compatibility.

**Key Features**:
- Very fast text extraction
- Multiple extraction modes
- Coordinate-based extraction
- OCR support
- Image extraction
- PDF manipulation

**Text Extraction Methods**:

1. **Plain Text** (fastest):
```python
import fitz  # PyMuPDF

doc = fitz.open("fee_schedule.pdf")
page = doc[0]

# Simple text extraction
text = page.get_text("text")
print(text)
```

2. **Blocks** (with coordinates):
```python
# Extract text blocks with bounding boxes
blocks = page.get_text("blocks")
for block in blocks:
    x0, y0, x1, y1, text, block_no, block_type = block
    print(f"Text: {text}")
    print(f"Position: ({x0}, {y0}) to ({x1}, {y1})")
```

3. **Words** (with coordinates):
```python
# Extract individual words
words = page.get_text("words")
for word in words:
    x0, y0, x1, y1, word_text, block_no, line_no, word_no = word
    print(f"{word_text} at ({x0}, {y0})")
```

4. **Structured** (dict/JSON):
```python
# Get structured representation
text_dict = page.get_text("dict")
# Contains blocks, lines, spans with full formatting info
```

**Use Case: Extracting Unstructured Fee Text**:
```python
import fitz
import re

def extract_fees_from_text(pdf_path):
    """Extract fees when tables aren't cleanly formatted."""
    doc = fitz.open(pdf_path)
    all_fees = []

    for page in doc:
        text = page.get_text("text")

        # Pattern: "Service Name ... $XX.XX"
        pattern = r"(.+?)\s+\$(\d+\.\d{2})"
        matches = re.findall(pattern, text)

        for service, amount in matches:
            all_fees.append({
                "service": service.strip(),
                "amount": amount,
                "page": page.number + 1
            })

    return all_fees
```

**OCR Support** (for scanned PDFs):
```python
# Install tesseract first: brew install tesseract
import fitz

doc = fitz.open("scanned_fee_schedule.pdf")
page = doc[0]

# Create pixmap from page
pix = page.get_pixmap()

# OCR the image
text = page.get_text("text", flags=fitz.TEXT_PRESERVE_LIGATURES)
```

**Performance Characteristics**:
- Plain text extraction: ~3x faster than pdftotext
- Block extraction: Moderate overhead for positioning
- Dict extraction: Slower but most detailed

**Strengths**:
- Extremely fast
- Low memory usage
- Supports scanned PDFs (with OCR)
- Comprehensive API

**Limitations**:
- Not optimized for table extraction
- Coordinate-based table detection requires manual work
- Less convenient than pdfplumber for tables

**Use Cases**:
- Fallback when table extraction fails
- Plain text extraction from fee narratives
- OCR for scanned documents
- High-volume processing (speed critical)

**Sources**:
- [PyMuPDF Documentation](https://pymupdf.readthedocs.io/)
- [PyMuPDF GitHub](https://github.com/pymupdf/PyMuPDF)
- [Text Extraction Guide](https://pymupdf.readthedocs.io/en/latest/recipes-text.html)
- [How to Use Fitz in Python](https://leapcell.io/blog/how-to-use-fitz-in-python)

---

## 3. LLM Integration

### 3.1 Anthropic Claude API

**Overview**: Claude is Anthropic's family of foundation models. The Python SDK provides access to the Messages API for text generation, structured output, and tool use.

**Official Documentation**: [https://docs.anthropic.com/claude/](https://docs.anthropic.com/claude/)

**Installation**:
```bash
pip install anthropic
```

**API Key Setup**:
```bash
export ANTHROPIC_API_KEY="your-api-key"
```

**Model Tiers** (as of 2026):
- **Haiku 4.5**: $1/$5 per million tokens (fast, lightweight)
- **Sonnet 4.5**: $3/$15 per million tokens (balanced)
- **Opus 4.5**: $5/$25 per million tokens (most capable)

**Basic Usage**:
```python
import os
from anthropic import Anthropic

client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

message = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=1024,
    messages=[
        {
            "role": "user",
            "content": "Hello, Claude"
        }
    ]
)
print(message.content)
```

**Async Usage** (recommended for high throughput):
```python
import asyncio
from anthropic import AsyncAnthropic

client = AsyncAnthropic()

async def process_fee_schedule(text):
    message = await client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=4096,
        messages=[{"role": "user", "content": text}]
    )
    return message.content

# Process multiple PDFs concurrently
results = await asyncio.gather(
    process_fee_schedule(text1),
    process_fee_schedule(text2),
    process_fee_schedule(text3)
)
```

**Structured Data Extraction with Tool Use**:

Claude's tool use feature is perfect for extracting structured fee data:

```python
import json
from anthropic import Anthropic

client = Anthropic()

# Define schema as a "tool"
tools = [
    {
        "name": "record_fee",
        "description": "Record a fee from a bank fee schedule",
        "input_schema": {
            "type": "object",
            "properties": {
                "fee_name": {
                    "type": "string",
                    "description": "Name of the fee or service"
                },
                "amount": {
                    "type": "number",
                    "description": "Fee amount in dollars"
                },
                "category": {
                    "type": "string",
                    "enum": ["account_maintenance", "transaction", "overdraft", "wire_transfer", "atm", "other"],
                    "description": "Category of fee"
                },
                "conditions": {
                    "type": "string",
                    "description": "Conditions or notes about when fee applies"
                },
                "frequency": {
                    "type": "string",
                    "enum": ["one_time", "monthly", "annual", "per_transaction"],
                    "description": "How often the fee is charged"
                }
            },
            "required": ["fee_name", "amount", "category"]
        }
    }
]

# Extract fees from PDF text
fee_schedule_text = """
Monthly Maintenance Fee: $12.00 (waived with $500 minimum balance)
Overdraft Fee: $35.00 per transaction
ATM Withdrawal (out-of-network): $3.00 per transaction
Wire Transfer (domestic): $25.00
"""

response = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=4096,
    tools=tools,
    messages=[
        {
            "role": "user",
            "content": f"Extract all fees from this fee schedule:\n\n{fee_schedule_text}"
        }
    ]
)

# Parse tool calls
fees = []
for block in response.content:
    if block.type == "tool_use":
        fees.append(block.input)

print(json.dumps(fees, indent=2))
```

**Advanced: Programmatic Tool Calling** (agentic workflow):

```python
from anthropic import Anthropic, beta_tool

client = Anthropic()

@beta_tool
def record_fee(fee_name: str, amount: float, category: str, conditions: str = None) -> str:
    """Record a fee to the database

    Args:
        fee_name: Name of the fee
        amount: Fee amount in dollars
        category: Fee category
        conditions: Optional conditions

    Returns:
        Confirmation message
    """
    # Insert into database here
    return f"Recorded: {fee_name} - ${amount}"

runner = client.beta.messages.tool_runner(
    model="claude-sonnet-4-5-20250929",
    max_tokens=4096,
    tools=[record_fee],
    messages=[
        {
            "role": "user",
            "content": "Extract fees from this schedule and record them..."
        }
    ]
)

# Claude automatically calls the tool
for message in runner:
    print(message)
```

**Prompt Engineering Best Practices**:

1. **Clear Instructions**:
```python
system_prompt = """You are a banking fee extraction specialist.
Extract ALL fees from the provided fee schedule document.

For each fee:
- Identify the exact service name
- Extract the dollar amount
- Categorize the fee type
- Note any conditions (minimum balance, transaction limits, etc.)
- Identify billing frequency

If a fee has multiple tiers or conditions, create separate entries.
If information is missing, use null rather than guessing."""

messages = [
    {"role": "user", "content": f"{system_prompt}\n\nFee Schedule:\n{text}"}
]
```

2. **Few-Shot Examples**:
```python
prompt = """Extract fees in JSON format:

Example Input:
"Monthly Service Fee: $10.00 (waived with $500 minimum daily balance)"

Example Output:
{
  "fee_name": "Monthly Service Fee",
  "amount": 10.00,
  "category": "account_maintenance",
  "conditions": "Waived with $500 minimum daily balance",
  "frequency": "monthly"
}

Now extract from this schedule:
{fee_schedule_text}
"""
```

3. **Reduce Hallucinations**:
```python
prompt = """Extract fees from this schedule.
IMPORTANT:
- Only extract fees explicitly stated in the document
- If a fee amount is unclear, mark it as null
- Do not infer or estimate missing information
- If you're unsure about a fee's category, use "other"
"""
```

**Message Batches API** (for high volume):

Process many fee schedules efficiently:

```python
from anthropic import AsyncAnthropic

client = AsyncAnthropic()

# Create batch
batch = await client.messages.batches.create(
    requests=[
        {
            "custom_id": f"bank_{i}",
            "params": {
                "model": "claude-sonnet-4-5-20250929",
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": fee_text}]
            }
        }
        for i, fee_text in enumerate(fee_schedule_texts)
    ]
)

# Get results later
result_stream = await client.messages.batches.results(batch.id)
async for entry in result_stream:
    if entry.result.type == "succeeded":
        print(f"Bank {entry.custom_id}: {entry.result.message.content}")
```

**Token Counting** (for cost estimation):
```python
# Estimate cost before processing
count = client.messages.count_tokens(
    model="claude-sonnet-4-5-20250929",
    messages=[{"role": "user", "content": fee_schedule_text}]
)
print(f"Input tokens: {count.input_tokens}")
# At $3 per million input tokens: cost = (count.input_tokens / 1_000_000) * 3
```

**Strengths**:
- Excellent at understanding context and nuance
- Structured output via tool use
- Strong reasoning for ambiguous fees
- Batch API for cost optimization
- Built-in type safety (Pydantic models)

**Limitations**:
- API costs (though competitive)
- Rate limits (tier-dependent)
- Requires internet connection
- Potential hallucinations (mitigate with prompts)

**Use Cases**:
- Parsing unstructured fee text
- Handling ambiguous fee descriptions
- Extracting conditional fees
- Normalizing fee names across institutions
- Quality-checking extracted table data

**Sources**:
- [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python)
- [Claude API Documentation](https://docs.anthropic.com/claude/reference/)
- [Claude Pricing 2026](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
- [Structured Output with Claude](https://platform.claude.com/docs/en/agent-sdk/structured-outputs)

---

## 4. Database Integration

### 4.1 Supabase Python Client

**Overview**: Python client for Supabase, which provides PostgreSQL database, authentication, storage, and realtime subscriptions.

**Official Documentation**: [https://supabase.com/docs/reference/python/](https://supabase.com/docs/reference/python/)

**Installation**:
```bash
pip install supabase
```

**Initialization**:
```python
from supabase import create_client, Client

url = "https://your-project.supabase.co"
key = "your-anon-key"
supabase: Client = create_client(url, key)
```

**Environment Variables** (recommended):
```python
import os
from supabase import create_client

supabase = create_client(
    os.environ.get("SUPABASE_URL"),
    os.environ.get("SUPABASE_KEY")
)
```

**Insert Single Record**:
```python
response = (
    supabase.table("fee_schedules")
    .insert({
        "institution_name": "Example Bank",
        "fee_name": "Monthly Maintenance Fee",
        "amount": 12.00,
        "category": "account_maintenance",
        "conditions": "Waived with $500 minimum balance",
        "effective_date": "2026-01-01"
    })
    .execute()
)

# Access inserted data
inserted = response.data[0]
print(f"Inserted ID: {inserted['id']}")
```

**Bulk Insert**:
```python
fees = [
    {
        "institution_name": "Example Bank",
        "fee_name": "Overdraft Fee",
        "amount": 35.00,
        "category": "overdraft"
    },
    {
        "institution_name": "Example Bank",
        "fee_name": "ATM Fee",
        "amount": 3.00,
        "category": "atm"
    }
]

try:
    response = (
        supabase.table("fee_schedules")
        .insert(fees)
        .execute()
    )
    print(f"Inserted {len(response.data)} records")
except Exception as e:
    print(f"Error: {e}")
```

**Querying Data**:
```python
# Select all
response = supabase.table("fee_schedules").select("*").execute()

# Filter
response = (
    supabase.table("fee_schedules")
    .select("*")
    .eq("institution_name", "Example Bank")
    .gte("amount", 10.00)
    .execute()
)

# Order and limit
response = (
    supabase.table("fee_schedules")
    .select("*")
    .order("amount", desc=True)
    .limit(10)
    .execute()
)
```

**Update Records**:
```python
response = (
    supabase.table("fee_schedules")
    .update({"amount": 15.00})
    .eq("id", fee_id)
    .execute()
)
```

**Upsert** (insert or update):
```python
response = (
    supabase.table("fee_schedules")
    .upsert({
        "id": 123,
        "amount": 20.00
    })
    .execute()
)
```

**Error Handling**:
```python
from supabase import create_client
from postgrest.exceptions import APIError

try:
    response = supabase.table("fee_schedules").insert(data).execute()
except APIError as e:
    print(f"Database error: {e.message}")
    print(f"Details: {e.details}")
except Exception as e:
    print(f"Unexpected error: {e}")
```

**Schema Design for Fee Schedules**:

```sql
-- Example schema (run in Supabase SQL editor)
CREATE TABLE institutions (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    website TEXT,
    institution_type TEXT CHECK (institution_type IN ('bank', 'credit_union')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fee_schedules (
    id BIGSERIAL PRIMARY KEY,
    institution_id BIGINT REFERENCES institutions(id),
    fee_name TEXT NOT NULL,
    amount NUMERIC(10, 2),
    category TEXT,
    frequency TEXT,
    conditions TEXT,
    effective_date DATE,
    pdf_url TEXT,
    pdf_hash TEXT,
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_institution_id ON fee_schedules(institution_id);
CREATE INDEX idx_category ON fee_schedules(category);
```

**Using with Python**:
```python
# Insert institution
institution_response = (
    supabase.table("institutions")
    .insert({
        "name": "Example Bank",
        "website": "https://example.com",
        "institution_type": "bank"
    })
    .execute()
)
institution_id = institution_response.data[0]["id"]

# Insert fees
fees = [
    {
        "institution_id": institution_id,
        "fee_name": "Monthly Fee",
        "amount": 12.00,
        "category": "account_maintenance",
        "frequency": "monthly"
    }
]

supabase.table("fee_schedules").insert(fees).execute()

# Query with join
response = (
    supabase.table("fee_schedules")
    .select("*, institutions(name, website)")
    .eq("institutions.institution_type", "bank")
    .execute()
)
```

**Strengths**:
- Hosted PostgreSQL (no infrastructure management)
- Automatic API generation
- Real-time subscriptions
- Built-in authentication
- Free tier available

**Limitations**:
- Requires internet connection
- Less control than self-hosted PostgreSQL
- Rate limits on free tier

**Use Cases**:
- Storing extracted fee data
- Multi-user access
- Real-time updates
- Quick prototyping

**Sources**:
- [Supabase Python Documentation](https://supabase.com/docs/reference/python/)
- [Supabase Python Insert](https://supabase.com/docs/reference/python/insert)
- [Supabase Python Client GitHub](https://github.com/supabase/supabase-py)
- [Using Supabase with Python](https://medium.com/@summer12126/supabase-postgres-journey-with-python-1789e8bbb53c)

---

## 5. Job Scheduling

### 5.1 APScheduler

**Overview**: Advanced Python Scheduler for running jobs at specific times or intervals. Production-ready with persistence, multiple execution strategies, and database-backed job stores.

**Official Documentation**: [https://apscheduler.readthedocs.io/](https://apscheduler.readthedocs.io/)

**Installation**:
```bash
pip install APScheduler
```

**Key Features**:
- Cron-style scheduling
- Interval-based execution
- One-off delayed execution
- Database persistence (SQLAlchemy)
- Multiple job stores
- Timezone support
- Job queuing and coalescing

**Scheduler Types**:

1. **BlockingScheduler**: Use when scheduler is the only thing running
2. **BackgroundScheduler**: Use when scheduler runs in the background of your app
3. **AsyncIOScheduler**: Use with asyncio applications
4. **GeventScheduler**: Use with gevent
5. **TornadoScheduler**: Use with Tornado
6. **TwistedScheduler**: Use with Twisted
7. **QtScheduler**: Use with Qt applications

**Basic Usage - Interval Triggers**:
```python
from apscheduler.schedulers.blocking import BlockingScheduler
from datetime import datetime

scheduler = BlockingScheduler()

def crawl_fee_schedules():
    print(f"Crawling at {datetime.now()}")
    # Your crawling logic here

# Run every 24 hours
scheduler.add_job(
    crawl_fee_schedules,
    'interval',
    hours=24,
    start_date='2026-02-15 00:00:00'
)

scheduler.start()
```

**Cron-Style Scheduling**:
```python
from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()

# Run every Monday at 3 AM
scheduler.add_job(
    crawl_fee_schedules,
    'cron',
    day_of_week='mon',
    hour=3,
    minute=0
)

# Run daily at midnight
scheduler.add_job(
    process_new_pdfs,
    'cron',
    hour=0,
    minute=0
)

scheduler.start()

# Your app continues running
# ...
```

**Date-Based (One-Time) Scheduling**:
```python
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta

scheduler = BackgroundScheduler()

# Run once at specific time
run_time = datetime.now() + timedelta(hours=2)
scheduler.add_job(
    crawl_fee_schedules,
    'date',
    run_date=run_time
)
```

**Decorator Syntax**:
```python
from apscheduler.schedulers.blocking import BlockingScheduler

scheduler = BlockingScheduler()

@scheduler.scheduled_job('interval', hours=24)
def crawl_job():
    print("Crawling...")

@scheduler.scheduled_job('cron', hour=3)
def extraction_job():
    print("Extracting...")

scheduler.start()
```

**Persistence with Database**:
```python
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

jobstores = {
    'default': SQLAlchemyJobStore(url='postgresql://user:pass@localhost/scheduler')
}

scheduler = BackgroundScheduler(jobstores=jobstores)

# Jobs survive app restarts
scheduler.add_job(
    crawl_fee_schedules,
    'interval',
    hours=24,
    id='fee_schedule_crawl',
    replace_existing=True
)

scheduler.start()
```

**Error Handling**:
```python
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED

def job_listener(event):
    if event.exception:
        print(f"Job failed: {event.exception}")
    else:
        print(f"Job executed successfully")

scheduler.add_listener(job_listener, EVENT_JOB_ERROR | EVENT_JOB_EXECUTED)
```

**Integration with Async Code**:
```python
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler

async def async_crawl_job():
    print("Starting async crawl...")
    # Your async crawling logic
    await crawl_websites()

scheduler = AsyncIOScheduler()
scheduler.add_job(async_crawl_job, 'interval', hours=24)
scheduler.start()

# Keep event loop running
asyncio.get_event_loop().run_forever()
```

**Complete Example - Fee Schedule Pipeline**:
```python
from apscheduler.schedulers.background import BackgroundScheduler
import logging

logging.basicConfig()
logging.getLogger('apscheduler').setLevel(logging.DEBUG)

scheduler = BackgroundScheduler()

def daily_crawl():
    """Crawl for new fee schedules."""
    print("Starting daily crawl...")
    # Crawl logic here

def weekly_full_refresh():
    """Re-crawl all institutions."""
    print("Starting weekly full refresh...")
    # Full crawl logic here

def hourly_extraction():
    """Process newly downloaded PDFs."""
    print("Processing PDFs...")
    # Extraction logic here

# Daily crawl at 2 AM
scheduler.add_job(daily_crawl, 'cron', hour=2, id='daily_crawl')

# Weekly full refresh on Sundays at 1 AM
scheduler.add_job(weekly_full_refresh, 'cron', day_of_week='sun', hour=1, id='weekly_refresh')

# Hourly PDF processing
scheduler.add_job(hourly_extraction, 'interval', hours=1, id='pdf_processing')

scheduler.start()

# Keep app running
try:
    while True:
        pass
except (KeyboardInterrupt, SystemExit):
    scheduler.shutdown()
```

**Strengths**:
- Production-ready
- Database persistence
- Flexible scheduling options
- Timezone support
- Good documentation

**Limitations**:
- Heavier than simple alternatives
- Learning curve for advanced features
- Requires app process to stay running

**Use Cases**:
- Periodic fee schedule crawling
- Scheduled PDF processing
- Automated database maintenance
- Complex scheduling requirements

**Sources**:
- [APScheduler Documentation](https://apscheduler.readthedocs.io/)
- [APScheduler User Guide](https://apscheduler.readthedocs.io/en/3.x/userguide.html)
- [Job Scheduling in Python with APScheduler](https://betterstack.com/community/guides/scaling-python/apscheduler-scheduled-tasks/)
- [APScheduler GitHub](https://github.com/agronholm/apscheduler)

---

### 5.2 schedule

**Overview**: Minimalist, human-friendly job scheduling library with zero dependencies. Perfect for simple periodic tasks.

**GitHub**: [https://github.com/dbader/schedule](https://github.com/dbader/schedule)

**Installation**:
```bash
pip install schedule
```

**Key Features**:
- Simple, Pythonic API
- Zero dependencies
- Cross-platform (pure Python)
- Human-readable syntax
- No background thread by default

**Basic Usage**:
```python
import schedule
import time

def crawl_job():
    print("Crawling fee schedules...")

# Every day at 10:30
schedule.every().day.at("10:30").do(crawl_job)

# Every hour
schedule.every().hour.do(crawl_job)

# Every 10 minutes
schedule.every(10).minutes.do(crawl_job)

# Run pending jobs
while True:
    schedule.run_pending()
    time.sleep(1)
```

**Time Units**:
```python
import schedule

# Minutes
schedule.every(5).minutes.do(job)

# Hours
schedule.every(2).hours.do(job)

# Days
schedule.every().day.at("09:00").do(job)

# Weekdays
schedule.every().monday.at("08:00").do(job)
schedule.every().friday.at("17:00").do(job)

# Weeks
schedule.every().week.do(job)
```

**Passing Arguments**:
```python
def crawl_institution(name, url):
    print(f"Crawling {name} at {url}")

schedule.every().hour.do(crawl_institution, "Example Bank", "https://example.com")
```

**Running in Background Thread**:
```python
import schedule
import threading
import time

def run_scheduler():
    while True:
        schedule.run_pending()
        time.sleep(1)

# Start scheduler in background
scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
scheduler_thread.start()

# Your main app continues
# ...
```

**Cancelling Jobs**:
```python
# Cancel specific job
job = schedule.every().hour.do(task)
schedule.cancel_job(job)

# Clear all jobs
schedule.clear()

# Clear jobs with specific tag
schedule.clear('daily')
```

**Job Tagging**:
```python
schedule.every().hour.do(crawl_job).tag('crawl', 'hourly')
schedule.every().day.do(extract_job).tag('extract', 'daily')

# Cancel all 'crawl' jobs
schedule.clear('crawl')
```

**Error Handling**:
```python
import schedule
import logging

def safe_job():
    try:
        # Your job logic
        crawl_websites()
    except Exception as e:
        logging.error(f"Job failed: {e}")

schedule.every().hour.do(safe_job)
```

**Complete Example**:
```python
import schedule
import time
import logging

logging.basicConfig(level=logging.INFO)

def crawl_fee_schedules():
    logging.info("Starting fee schedule crawl...")
    # Crawl logic here

def process_pdfs():
    logging.info("Processing PDFs...")
    # Extraction logic here

def cleanup_old_data():
    logging.info("Cleaning up old data...")
    # Cleanup logic here

# Daily crawl at 2 AM
schedule.every().day.at("02:00").do(crawl_fee_schedules).tag('daily')

# Process PDFs every 2 hours
schedule.every(2).hours.do(process_pdfs).tag('processing')

# Weekly cleanup on Sundays at midnight
schedule.every().sunday.at("00:00").do(cleanup_old_data).tag('weekly')

# Run scheduler
while True:
    schedule.run_pending()
    time.sleep(60)  # Check every minute
```

**Comparison: schedule vs APScheduler**:

| Feature | schedule | APScheduler |
|---------|----------|-------------|
| Ease of Use | Very easy | Moderate |
| Dependencies | Zero | Several |
| Persistence | No | Yes (database) |
| Cron Syntax | No (human-friendly) | Yes |
| Timezone Support | Limited | Full |
| Threading | Manual | Built-in |
| Best For | Simple tasks | Complex, production apps |

**Strengths**:
- Extremely simple API
- No dependencies
- Cross-platform
- Easy to understand
- Fast to implement

**Limitations**:
- No persistence (jobs lost on restart)
- Single-threaded by default
- No timezone support
- Less feature-rich than APScheduler

**Use Cases**:
- Simple periodic crawling
- Development/testing
- Single-purpose scheduling scripts
- Windows environments (no cron)

**Sources**:
- [schedule GitHub](https://github.com/dbader/schedule)
- [APScheduler vs schedule Comparison](https://leapcell.io/blog/scheduling-tasks-in-python-apscheduler-versus-schedule)
- [Python Job Scheduling Methods 2026](https://research.aimultiple.com/python-job-scheduling/)
- [Scheduling Recurring Jobs with Python](https://martinheinz.dev/blog/39)

---

## 6. Recommended Architecture

### 6.1 Pipeline Overview

```
┌─────────────────┐
│   Scheduling    │  APScheduler (production) or schedule (simple)
│   (Daily/Weekly)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Web Crawler   │  Crawl4AI (JS sites) or Scrapy (static sites)
│  Find PDFs      │  + Playwright (for complex navigation)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Download PDFs  │  Scrapy FilesPipeline or Playwright downloads
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Table Extraction│  pdfplumber (primary) → Camelot (fallback)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Text Extraction │  PyMuPDF (for non-table content)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ LLM Processing  │  Claude API (structure unstructured data)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Database Write │  Supabase Python client
└─────────────────┘
```

### 6.2 Suggested Technology Choices

**For Small-Scale (< 100 institutions)**:
- Crawler: Crawl4AI
- Browser: Built into Crawl4AI
- PDF Extraction: pdfplumber
- LLM: Claude Sonnet 4.5
- Database: Supabase
- Scheduling: schedule library

**For Medium-Scale (100-1000 institutions)**:
- Crawler: Scrapy
- Browser: Playwright (when needed)
- PDF Extraction: pdfplumber + Camelot
- LLM: Claude Haiku 4.5 (lower cost)
- Database: Supabase or self-hosted PostgreSQL
- Scheduling: APScheduler with database persistence

**For Large-Scale (1000+ institutions)**:
- Crawler: Scrapy with distributed architecture
- Browser: Playwright with request queue
- PDF Extraction: pdfplumber + Camelot + PyMuPDF
- LLM: Claude Batches API for bulk processing
- Database: Self-hosted PostgreSQL with replication
- Scheduling: APScheduler + Celery for distributed tasks

### 6.3 Sample Code Structure

```
fee_schedule_pipeline/
├── crawlers/
│   ├── __init__.py
│   ├── base_crawler.py
│   ├── crawl4ai_impl.py
│   └── scrapy_impl.py
├── extractors/
│   ├── __init__.py
│   ├── pdf_table_extractor.py  # pdfplumber + Camelot
│   ├── pdf_text_extractor.py   # PyMuPDF
│   └── llm_extractor.py         # Claude API
├── storage/
│   ├── __init__.py
│   └── supabase_client.py
├── scheduler/
│   ├── __init__.py
│   └── jobs.py
├── config/
│   ├── __init__.py
│   ├── institutions.yaml        # List of banks to crawl
│   └── settings.py
├── main.py
└── requirements.txt
```

---

## 7. Key Gotchas and Limitations

### 7.1 Web Crawling
- **Rate Limiting**: Always implement delays; banks may block aggressive crawlers
- **robots.txt**: Respect robots.txt; some banks block automated access
- **JavaScript**: Many modern banking sites require Playwright; Scrapy alone won't work
- **Authentication**: Some fee schedules may be behind login pages
- **PDF Location**: PDFs may be in non-obvious places (modal dialogs, JavaScript-generated links)

### 7.2 PDF Extraction
- **Scanned PDFs**: pdfplumber and Camelot only work on text-based PDFs; scanned documents need OCR
- **Complex Layouts**: Multi-column layouts may extract incorrectly; requires manual tuning
- **Inconsistent Formatting**: Different banks format fees differently (tables vs. lists vs. paragraphs)
- **Merged Cells**: Table extractors struggle with rowspan/colspan
- **Footnotes**: Conditional fees in footnotes may be missed by table extraction

### 7.3 LLM Processing
- **Cost**: Processing thousands of PDFs can be expensive; use Haiku for cost optimization
- **Hallucinations**: Claude may infer fees that don't exist; validate against source
- **Rate Limits**: API rate limits vary by tier; implement exponential backoff
- **Context Limits**: Very long PDFs may exceed context windows; chunk if needed
- **Ambiguity**: "Fee may vary" requires human judgment; LLM may guess

### 7.4 Data Quality
- **Duplicate Detection**: Same fee may appear multiple times; implement deduplication
- **Effective Dates**: Fee schedules have effective dates; track temporal changes
- **Currency**: Assume USD but verify (credit unions may have different currencies)
- **Conditional Logic**: "Waived if..." requires structured conditions field
- **Missing Data**: Not all banks publish complete fee schedules

### 7.5 Operational
- **Storage**: PDFs add up quickly; implement archival strategy
- **Monitoring**: Track extraction failures; some PDFs will always fail
- **Updates**: Banks update fee schedules irregularly; check hash before re-processing
- **Legal**: Verify terms of use; some banks prohibit automated access

---

## 8. Performance Optimization

### 8.1 Crawling
- Use async crawlers (Crawl4AI, Scrapy)
- Implement concurrent requests with rate limiting
- Cache PDF URLs to avoid re-crawling
- Use HEAD requests to check for updates before downloading

### 8.2 PDF Processing
- Process PDFs in parallel (multiprocessing)
- Skip already-processed PDFs (check hash)
- Use PyMuPDF for initial text extraction (fastest)
- Fall back to pdfplumber only for table extraction

### 8.3 LLM Calls
- Use Batches API for bulk processing (50% cost savings)
- Implement caching for identical PDFs
- Use Haiku for simple extractions, Sonnet for complex
- Parallelize API calls (respect rate limits)

### 8.4 Database
- Batch inserts instead of individual records
- Create indexes on commonly queried fields
- Use connection pooling
- Implement write-behind caching

---

## 9. Next Steps

1. **Prototype**: Build minimal pipeline with 5 test institutions
2. **Validate**: Manually verify extraction accuracy
3. **Iterate**: Tune extraction settings based on failures
4. **Scale**: Add more institutions incrementally
5. **Monitor**: Implement logging and error tracking
6. **Optimize**: Profile and optimize bottlenecks

---

## 10. Additional Resources

### Documentation
- [Crawl4AI Docs](https://docs.crawl4ai.com/)
- [Scrapy Docs](https://docs.scrapy.org/)
- [Playwright Python Docs](https://playwright.dev/python/)
- [pdfplumber GitHub](https://github.com/jsvine/pdfplumber)
- [Camelot Docs](https://camelot-py.readthedocs.io/)
- [PyMuPDF Docs](https://pymupdf.readthedocs.io/)
- [Anthropic API Docs](https://docs.anthropic.com/)
- [Supabase Python Docs](https://supabase.com/docs/reference/python/)
- [APScheduler Docs](https://apscheduler.readthedocs.io/)

### Comparison Articles
- [Best Open-Source Web Crawlers 2026](https://www.firecrawl.dev/blog/best-open-source-web-crawler)
- [Best Python Libraries to Extract Tables 2026](https://unstract.com/blog/extract-tables-from-pdf-python/)
- [Crawl4AI vs Scrapy Comparison](https://slashdot.org/software/comparison/Crawl4AI-vs-Scrapy/)
- [APScheduler vs schedule](https://leapcell.io/blog/scheduling-tasks-in-python-apscheduler-versus-schedule)

### Tutorials
- [Web Scraping with Scrapy Complete Guide](https://scrapfly.io/blog/posts/web-scraping-with-scrapy)
- [Playwright Python Tutorial](https://www.browserstack.com/guide/playwright-python-tutorial)
- [PDFPlumber Guide](https://unstract.com/blog/guide-to-pdfplumber-text-and-table-extraction-capabilities/)
- [Claude Prompt Engineering Best Practices](https://promptbuilder.cc/blog/claude-prompt-engineering-best-practices-2026)

---

**Research completed**: 2026-02-14
**Document version**: 1.0

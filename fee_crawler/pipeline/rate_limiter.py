"""Per-domain rate limiter for polite crawling.

Enforces:
- 1 concurrent request per domain (via domain locks)
- Configurable delay between requests to the same domain
- Respects Crawl-delay from robots.txt (capped at 30s)
- Max N concurrent domains globally
- Jitter to avoid thundering herd
"""

import random
import threading
import time
from collections import defaultdict
from urllib.parse import urlparse

# Defaults
_DEFAULT_DELAY = 2.0  # seconds between requests to same domain
_MAX_CRAWL_DELAY = 30.0  # cap robots.txt Crawl-delay
_MAX_CONCURRENT_DOMAINS = 10
_JITTER_RANGE = 0.2  # +/- 20%


class DomainRateLimiter:
    """Thread-safe per-domain rate limiter.

    Usage:
        limiter = DomainRateLimiter(default_delay=2.0)
        limiter.set_crawl_delay("example.com", 5.0)  # from robots.txt

        with limiter.acquire("https://example.com/page"):
            response = requests.get(url)
    """

    def __init__(
        self,
        default_delay: float = _DEFAULT_DELAY,
        max_concurrent_domains: int = _MAX_CONCURRENT_DOMAINS,
    ) -> None:
        self._default_delay = default_delay
        self._domain_semaphore = threading.Semaphore(max_concurrent_domains)

        # Per-domain state (protected by _lock)
        self._lock = threading.Lock()
        self._domain_locks: dict[str, threading.Lock] = defaultdict(threading.Lock)
        self._last_request: dict[str, float] = {}
        self._crawl_delays: dict[str, float] = {}

    def _extract_domain(self, url: str) -> str:
        """Extract the domain (netloc) from a URL."""
        return urlparse(url).netloc.lower()

    def set_crawl_delay(self, domain: str, delay: float) -> None:
        """Set the Crawl-delay for a domain (from robots.txt).

        Capped at _MAX_CRAWL_DELAY seconds.
        """
        domain = domain.lower()
        capped = min(max(delay, 0), _MAX_CRAWL_DELAY)
        with self._lock:
            self._crawl_delays[domain] = capped

    def _get_delay(self, domain: str) -> float:
        """Get the effective delay for a domain (Crawl-delay or default)."""
        with self._lock:
            return self._crawl_delays.get(domain, self._default_delay)

    def _get_domain_lock(self, domain: str) -> threading.Lock:
        """Get or create a lock for the given domain."""
        with self._lock:
            return self._domain_locks[domain]

    def acquire(self, url: str) -> "_DomainContext":
        """Context manager that acquires domain rate limit before proceeding."""
        return _DomainContext(self, url)

    def wait(self, url: str) -> None:
        """Block until it's safe to make a request to this URL's domain.

        Acquires domain lock, waits for delay, then releases.
        For use without context manager.
        """
        domain = self._extract_domain(url)
        domain_lock = self._get_domain_lock(domain)

        # Acquire global concurrent domain slot
        self._domain_semaphore.acquire()
        try:
            # Acquire per-domain lock (1 request at a time per domain)
            domain_lock.acquire()
            try:
                self._wait_for_delay(domain)
            finally:
                domain_lock.release()
        finally:
            self._domain_semaphore.release()

    def _wait_for_delay(self, domain: str) -> None:
        """Wait until enough time has passed since last request to this domain."""
        delay = self._get_delay(domain)
        # Add jitter
        jittered = delay * (1 + random.uniform(-_JITTER_RANGE, _JITTER_RANGE))

        with self._lock:
            last = self._last_request.get(domain, 0)

        elapsed = time.time() - last
        if elapsed < jittered:
            time.sleep(jittered - elapsed)

        with self._lock:
            self._last_request[domain] = time.time()

    def _enter_domain(self, url: str) -> str:
        """Acquire slots and wait. Returns domain name."""
        domain = self._extract_domain(url)
        self._domain_semaphore.acquire()
        domain_lock = self._get_domain_lock(domain)
        domain_lock.acquire()
        self._wait_for_delay(domain)
        return domain

    def _exit_domain(self, url: str) -> None:
        """Release slots."""
        domain = self._extract_domain(url)
        domain_lock = self._get_domain_lock(domain)
        domain_lock.release()
        self._domain_semaphore.release()


class _DomainContext:
    """Context manager for domain rate limiting."""

    def __init__(self, limiter: DomainRateLimiter, url: str) -> None:
        self._limiter = limiter
        self._url = url

    def __enter__(self) -> None:
        self._limiter._enter_domain(self._url)

    def __exit__(self, *exc: object) -> None:
        self._limiter._exit_domain(self._url)

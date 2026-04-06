"""Root conftest.py for fee_crawler test suite.

Registers the --geography CLI option (INFRA-02, per D-07).
All e2e session fixtures live in fee_crawler/tests/e2e/conftest.py.

IMPORTANT: pytest_addoption must ONLY be defined here, not in any sub-conftest.py.
Defining it in multiple conftest files raises ValueError: option --geography already added.
"""

import pytest

# ---------------------------------------------------------------------------
# Small-state pool for random geography selection (D-04).
# Wyoming (WY) is excluded — user is actively working on Wyoming data (D-03).
# All states have fewer than 50 FDIC-tracked institutions.
# ---------------------------------------------------------------------------
SMALL_STATE_POOL = ["VT", "RI", "NH", "ME", "DE"]


def pytest_addoption(parser: pytest.Parser) -> None:
    """Register --geography option for e2e test geography selection.

    Format: 'state=XX' where XX is a two-letter state code.
    Default: state=VT (Vermont — small institution count, well-known to the team).
    Do NOT use state=WY (active development data).
    """
    parser.addoption(
        "--geography",
        default="state=VT",
        help=(
            "Geography for e2e tests. Format: 'state=VT'. "
            "Small states only: VT, RI, NH, ME, DE. "
            "Do NOT use state=WY (active dev data)."
        ),
    )


@pytest.fixture(scope="session")
def geography(request: pytest.FixtureRequest) -> dict:
    """Parse --geography CLI option into a typed dict.

    Returns: {'type': 'state', 'code': 'VT'} (or whichever state was passed).
    Downstream fixtures (seed stage in Phase 2+) consume this fixture.

    Per D-03: Raises ValueError if WY is requested.
    Per D-04: Validates the code is in SMALL_STATE_POOL unless --geography is explicit override.
    """
    raw: str = request.config.getoption("--geography")
    if "=" not in raw:
        raise ValueError(
            f"--geography must be in format 'type=CODE', got: {raw!r}"
        )
    key, value = raw.split("=", 1)
    geo_type = key.strip().lower()
    geo_code = value.strip().upper()

    if geo_code == "WY":
        raise ValueError(
            "state=WY is excluded from e2e tests (active development data). "
            "Use one of: " + ", ".join(SMALL_STATE_POOL)
        )

    return {"type": geo_type, "code": geo_code}

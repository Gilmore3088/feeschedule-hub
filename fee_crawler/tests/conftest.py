"""Package-level conftest.py for fee_crawler/tests.

pytest_addoption is defined in the project root conftest.py (rootdir/conftest.py).
It MUST NOT be re-defined here — doing so raises:
  ValueError: option --geography already added

The geography fixture is defined at the root level so it is available to all
test packages including fee_crawler/tests/e2e/.
"""

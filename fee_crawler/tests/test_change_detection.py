"""Tests for data change detection logic."""

import json
import pytest

from fee_crawler.generation.change_detection import (
    _extract_count,
    _extract_median,
    has_data_changed,
)


class TestExtractMedian:
    def test_national_benchmark_format(self):
        ctx = {"national": {"median": 35.0, "count": 100}}
        assert _extract_median(ctx) == 35.0

    def test_district_comparison_format(self):
        ctx = {"district_stats": {"median": 28.5, "count": 50}}
        assert _extract_median(ctx) == 28.5

    def test_missing_data(self):
        assert _extract_median({}) is None
        assert _extract_median({"national": {}}) is None

    def test_null_median(self):
        ctx = {"national": {"median": None, "count": 0}}
        assert _extract_median(ctx) is None


class TestExtractCount:
    def test_national_benchmark_format(self):
        ctx = {"national": {"median": 35.0, "count": 100}}
        assert _extract_count(ctx) == 100

    def test_district_comparison_format(self):
        ctx = {"district_stats": {"median": 28.5, "count": 50}}
        assert _extract_count(ctx) == 50

    def test_missing_data(self):
        assert _extract_count({}) is None

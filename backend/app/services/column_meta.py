"""Column metadata + presentation hints.

Ported from src/dashboard_ui.py constants. These drive the /api/columns
endpoint that the React app reads to render KPIs, All Source Summary, and
the five sectioned tables. Storytelling order comes directly from
soql_registry.ALL_COLUMNS — never re-sort.
"""
from __future__ import annotations

from typing import Literal

from app.legacy.soql_registry import ALL_COLUMNS, COLUMN_BY_ID, SECTIONS

FormatHint = Literal["currency", "percent", "number"]

SECTION_DISPLAY_NAMES: dict[str, str] = {
    "Pipeline & Quota": "Pipeline & Quota",
    "Bookings by Motion": "Bookings by Motion (New / Cross-Sell / Upsell)",
    "Self-Gen Pipeline Creation": "Self Gen Pipeline Creation (not channel partners – prospects)",
    "SDR Activity": "SDR Activity for This Rep",
    "Channel Partners": "Channel Partners",
    "Marketing": "Marketing",
    "Others": "Others (not Self-Gen, SDR, Channel, or Marketing)",
}

CURRENCY_COLS: set[str] = {
    "S1-COL-C",
    "S1-COL-D",
    "S1-COL-F",
    "S1-COL-G",
    "S1-COL-I",
    "S1-COL-J",
    "S1-COL-L",
    "S1-COL-M",
    "S1-COL-N",
    "S1-COL-O",
    "S6-COL-AF",
    "S6-COL-AH",
    "S6-COL-AJ",
    "S6-COL-AL",
    "S6-COL-AM",
    "S6-COL-AN",
    "S6-COL-AO",
    "S6-COL-AP",
    "S6-COL-AQ",
    "S6-COL-AR",
    "S7-COL-BN",
    "S7-COL-BX",
    "S7-COL-BU",
}
PERCENT_COLS: set[str] = {"S1-COL-E", "S1-COL-H"}
LOWER_IS_BETTER: set[str] = {"S1-COL-N"}

# All Source Summary: (display label, pipeline col, bookings col)
# Canonical source order: Self-Gen, Channel, SDR, Marketing, Others.
ALL_SOURCE_SUMMARY: list[tuple[str, str, str]] = [
    ("Self Gen", "S6-COL-AF", "S6-COL-AM"),
    ("Channel", "S6-COL-AJ", "S6-COL-AO"),
    ("SDR", "S6-COL-AH", "S6-COL-AN"),
    ("Marketing", "S6-COL-AL", "S6-COL-AP"),
    ("Others", "S6-COL-AQ", "S6-COL-AR"),
]
TOTAL_QUOTA_COL = "S1-COL-F"         # Quota for the current month (MTD)
TOTAL_PIPELINE_COL = "S1-COL-L"      # Pipeline generated in time period
TOTAL_OPEN_PIPELINE_COL = "S1-COL-I"  # Open Pipeline with Current Month Close
TOTAL_OPEN_PIPELINE_NEEDED_COL = "S1-COL-O"  # Open Pipeline Needed to Quota
TOTAL_BOOKINGS_COL = "S1-COL-M"      # Bookings in time period


def format_hint(col_id: str) -> FormatHint:
    if col_id in CURRENCY_COLS:
        return "currency"
    if col_id in PERCENT_COLS:
        return "percent"
    return "number"


# KPI specs — canonical ordering and aggregation rules for the 12-card grid.
# (col_id, is_average)
KPI_ROW_1: list[tuple[str, bool]] = [
    ("S1-COL-C", False),  # Quota YTD
    ("S1-COL-D", False),  # Bookings YTD
    ("S1-COL-E", True),   # Attainment % YTD
    ("S1-COL-F", False),  # Quota MTD
    ("S1-COL-G", False),  # Bookings MTD
    ("S1-COL-H", True),   # Attainment % MTD
]
# Order follows the headline metric sequence: Bookings → Open Pipeline → Pipeline Generated.
KPI_ROW_2: list[tuple[str, bool]] = [
    ("S1-COL-M", False),  # Bookings in time period
    ("S1-COL-I", False),  # Open Pipeline with Current Month Close
    ("S1-COL-L", False),  # Pipeline generated in time period
    ("S1-COL-K", False),  # # Opportunities Created
    ("S1-COL-J", False),  # Open Pipeline (Next Month)
    ("S1-COL-N", False),  # Total Closed Lost
]


def column_meta_payload() -> dict:
    """Build the /api/columns response payload."""
    columns = []
    for entry in ALL_COLUMNS:
        columns.append(
            {
                "col_id": entry.col_id,
                "display_name": entry.display_name,
                "section": entry.section,
                "description": entry.description,
                "time_filter": entry.time_filter,
                "computed": entry.computed,
                "blocked": entry.blocked,
                "aggregation": entry.aggregation,
                "format": format_hint(entry.col_id),
                "lower_is_better": entry.col_id in LOWER_IS_BETTER,
            }
        )
    return {
        "columns": columns,
        "sections": [
            {"key": s, "display_name": SECTION_DISPLAY_NAMES.get(s, s)}
            for s in SECTIONS
        ],
        "kpi_row_1": [
            {
                "col_id": cid,
                "is_average": is_avg,
                "display_name": COLUMN_BY_ID[cid].display_name if cid in COLUMN_BY_ID else cid,
                "format": format_hint(cid),
            }
            for cid, is_avg in KPI_ROW_1
        ],
        "kpi_row_2": [
            {
                "col_id": cid,
                "is_average": is_avg,
                "display_name": COLUMN_BY_ID[cid].display_name if cid in COLUMN_BY_ID else cid,
                "format": format_hint(cid),
            }
            for cid, is_avg in KPI_ROW_2
        ],
        "all_source_summary": [
            {"label": label, "pipeline_col": p, "bookings_col": b}
            for label, p, b in ALL_SOURCE_SUMMARY
        ],
        "total_bookings_col": TOTAL_BOOKINGS_COL,
    }

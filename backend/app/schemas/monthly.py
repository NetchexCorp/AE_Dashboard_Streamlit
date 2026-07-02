"""Monthly reported bookings results — the finance-blessed numbers.

A record is one report month: Actual vs Plan vs Prior-Year by Bookings Type
(motion), for MTD/QTD/YTD, on both actuals bases, plus the monthly trend
series. Mirrors the structure of the monthly Bookings Results workbook so a
new month can be loaded as one document.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class BucketRow(BaseModel):
    bucket: str
    actual: float
    plan: float
    py_actual: float


class PeriodTable(BaseModel):
    rows: list[BucketRow]
    higherme: BucketRow | None = None


class BasisTables(BaseModel):
    label: str
    periods: dict[str, PeriodTable]  # keys: mtd | qtd | ytd
    trend_actual: list[float] = Field(default_factory=list)


class MonthlyRecord(BaseModel):
    month: str  # "2026-06"
    label: str  # "June 2026"
    status: str = "prelim"  # prelim | final
    prepared_at: str = ""
    source_note: str = ""
    trend_months: list[str] = Field(default_factory=list)
    trend_plan: list[float] = Field(default_factory=list)
    bases: dict[str, BasisTables]  # keys: amt_annualized | w2_uplift


class MonthlyIndex(BaseModel):
    months: list[str]
    latest: str | None

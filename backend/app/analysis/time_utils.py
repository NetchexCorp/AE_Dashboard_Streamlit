"""Quarter/fiscal helpers for RIaaS trend analyses.

Netchex fiscal year = calendar year (Organization.FiscalYearStartMonth = 1,
confirmed live). FY26 Q1 = 2026-01-01..2026-03-31.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from app.legacy.time_filters import resolve_time_period


def _quarter_end(year: int, q: int) -> date:
    if q == 4:
        return date(year, 12, 31)
    return date(year, 3 * q + 1, 1) - timedelta(days=1)


@dataclass(frozen=True)
class Quarter:
    year: int
    q: int  # 1..4

    @property
    def label(self) -> str:
        return f"FY{self.year % 100} Q{self.q}"

    @property
    def start(self) -> date:
        return date(self.year, 3 * (self.q - 1) + 1, 1)

    @property
    def end(self) -> date:
        return _quarter_end(self.year, self.q)


def quarter_of(d: date) -> Quarter:
    return Quarter(d.year, (d.month - 1) // 3 + 1)


def quarter_series(n: int, today: date | None = None) -> list[dict]:
    """Last n quarters ending with the current one, oldest first.

    Each item: {label, start, end} with ISO date strings (SOQL date literals).
    """
    cur = quarter_of(today or date.today())
    out: list[dict] = []
    year, q = cur.year, cur.q
    for _ in range(n):
        out.append(
            {
                "label": f"FY{year % 100} Q{q}",
                "start": date(year, 3 * (q - 1) + 1, 1).isoformat(),
                "end": _quarter_end(year, q).isoformat(),
            }
        )
        q -= 1
        if q == 0:
            year, q = year - 1, 4
    out.reverse()
    return out


def resolve_riaas_period(
    preset: str | None,
    custom_start: date | None = None,
    custom_end: date | None = None,
    today: date | None = None,
) -> tuple[date, date]:
    """RIaaS period presets: fiscal quarters/YTD plus the AE-dashboard presets."""
    d = today or date.today()
    if preset == "this_quarter":
        cur = quarter_of(d)
        return date(cur.year, 3 * (cur.q - 1) + 1, 1), _quarter_end(cur.year, cur.q)
    if preset == "last_quarter":
        cur = quarter_of(d)
        year, q = (cur.year - 1, 4) if cur.q == 1 else (cur.year, cur.q - 1)
        return date(year, 3 * (q - 1) + 1, 1), _quarter_end(year, q)
    if preset == "ytd":
        return date(d.year, 1, 1), d
    if preset == "last_4_quarters":
        series = quarter_series(4, d)
        return date.fromisoformat(series[0]["start"]), date.fromisoformat(series[-1]["end"])
    if preset == "prior_fy":
        return date(d.year - 1, 1, 1), date(d.year - 1, 12, 31)
    return resolve_time_period(preset, custom_start, custom_end)

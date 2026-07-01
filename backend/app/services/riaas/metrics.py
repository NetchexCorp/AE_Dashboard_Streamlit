"""Shared metric math for RIaaS chapter services (deck formulas, spec §6)."""
from __future__ import annotations

from datetime import date, datetime
from statistics import median
from typing import Any

WON = "Closed/Won"


def parse_dt(value: Any) -> date | None:
    if not value:
        return None
    s = str(value)
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            return None


def cycle_days(row: dict) -> int | None:
    created = parse_dt(row.get("CreatedDate"))
    closed = parse_dt(row.get("CloseDate"))
    if created is None or closed is None:
        return None
    return max((closed - created).days, 0)


def cohort_metrics(rows: list[dict]) -> dict:
    """Win rate / ACV / median cycle / velocity / efficiency for a closed-deal cohort.

    Rows need StageName, Amount, CreatedDate, CloseDate.
    """
    won = [r for r in rows if r.get("StageName") == WON]
    lost = [r for r in rows if r.get("StageName") != WON]
    n_won, n_lost = len(won), len(lost)
    n = n_won + n_lost
    win_rate = (n_won / n) if n else None
    amounts = [r["Amount"] for r in won if r.get("Amount")]
    acv = (sum(amounts) / len(amounts)) if amounts else None
    cycles = [c for c in (cycle_days(r) for r in won) if c is not None]
    cycle = median(cycles) if cycles else None
    velocity = None
    efficiency = None
    if win_rate is not None and acv is not None and cycle:
        velocity = n * win_rate * acv / cycle
        efficiency = win_rate * acv / cycle
    return {
        "deals": n,
        "deals_won": n_won,
        "win_rate": round(win_rate, 4) if win_rate is not None else None,
        "acv": round(acv, 2) if acv is not None else None,
        "cycle_days": cycle,
        "velocity": round(velocity, 2) if velocity is not None else None,
        "efficiency": round(efficiency, 2) if efficiency is not None else None,
        "bookings": round(sum(amounts), 2),
    }

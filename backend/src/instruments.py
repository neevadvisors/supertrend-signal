"""Load and cache Dhan NSE equity instrument master for searchable stock picking."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
from dhanhq import dhanhq

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CACHE_PATH = PROJECT_ROOT / "data" / "security_id_list.csv"
CACHE_MAX_AGE = timedelta(hours=24)

_equity_cache: pd.DataFrame | None = None


def _is_cache_fresh(path: Path) -> bool:
    if not path.exists():
        return False
    mtime = datetime.fromtimestamp(path.stat().st_mtime)
    return datetime.now() - mtime < CACHE_MAX_AGE


def _prepare_equity(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [c.strip() for c in df.columns]

    required = {
        "SEM_SMST_SECURITY_ID",
        "SEM_EXM_EXCH_ID",
        "SEM_INSTRUMENT_NAME",
        "SEM_TRADING_SYMBOL",
    }
    missing = required - set(df.columns)
    if missing:
        raise RuntimeError(f"Security list missing columns: {sorted(missing)}")

    equity = df[
        (df["SEM_EXM_EXCH_ID"].astype(str).str.upper() == "NSE")
        & (df["SEM_INSTRUMENT_NAME"].astype(str).str.upper() == "EQUITY")
    ].copy()

    equity["SEM_SMST_SECURITY_ID"] = equity["SEM_SMST_SECURITY_ID"].astype(str)
    equity["SEM_TRADING_SYMBOL"] = equity["SEM_TRADING_SYMBOL"].astype(str).str.strip()

    if "SEM_CUSTOM_SYMBOL" in equity.columns:
        equity["SEM_CUSTOM_SYMBOL"] = (
            equity["SEM_CUSTOM_SYMBOL"].astype(str).str.strip().replace("nan", "")
        )
    else:
        equity["SEM_CUSTOM_SYMBOL"] = equity["SEM_TRADING_SYMBOL"]

    if "SEM_SERIES" in equity.columns:
        equity["SEM_SERIES"] = equity["SEM_SERIES"].astype(str).str.strip().str.upper()
    else:
        equity["SEM_SERIES"] = "EQ"

    equity = equity.drop_duplicates(subset=["SEM_SMST_SECURITY_ID"]).sort_values(
        "SEM_TRADING_SYMBOL"
    )
    equity = equity.reset_index(drop=True)

    symbols = equity["SEM_TRADING_SYMBOL"]
    displays = equity["SEM_CUSTOM_SYMBOL"]
    labels = symbols.copy()
    use_display = (
        (displays != "")
        & (displays != symbols)
        & (displays.str.lower() != "nan")
    )
    labels = labels.where(~use_display, symbols + " — " + displays)
    # Disambiguate duplicate labels with security id
    dupes = labels.duplicated(keep=False)
    labels = labels.where(~dupes, labels + " (" + equity["SEM_SMST_SECURITY_ID"] + ")")

    equity["label"] = labels
    equity["symbol_upper"] = symbols.str.upper()
    equity["display_upper"] = displays.str.upper()
    equity["label_upper"] = labels.str.upper()
    return equity


def load_nse_equity_instruments(force_refresh: bool = False) -> pd.DataFrame:
    """
    Return NSE EQUITY rows from Dhan compact scrip master.

    Disk-caches the CSV under data/ (24h) and keeps a process-level DataFrame
    so search requests do not re-read the file on every keystroke.
    """
    global _equity_cache

    if force_refresh:
        _equity_cache = None

    if _equity_cache is not None and not force_refresh:
        return _equity_cache

    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)

    if force_refresh or not _is_cache_fresh(CACHE_PATH):
        df = dhanhq.fetch_security_list("compact", str(CACHE_PATH))
        if df is None or df.empty:
            raise RuntimeError("Failed to download Dhan security list")
    else:
        df = pd.read_csv(CACHE_PATH, low_memory=False)

    _equity_cache = _prepare_equity(df)
    return _equity_cache


def label_for_row(row: pd.Series) -> str:
    if "label" in row.index and isinstance(row["label"], str) and row["label"]:
        return row["label"]
    symbol = row["SEM_TRADING_SYMBOL"]
    display = row.get("SEM_CUSTOM_SYMBOL", "")
    if display and display != symbol and display != "nan":
        return f"{symbol} — {display}"
    return symbol


def row_to_instrument(row: pd.Series) -> dict:
    display = row.get("SEM_CUSTOM_SYMBOL", row["SEM_TRADING_SYMBOL"])
    if display == "nan" or not display:
        display = row["SEM_TRADING_SYMBOL"]
    return {
        "label": label_for_row(row),
        "symbol": row["SEM_TRADING_SYMBOL"],
        "security_id": str(row["SEM_SMST_SECURITY_ID"]),
        "exchange_segment": "NSE_EQ",
        "instrument_type": "EQUITY",
        "display_name": str(display),
    }


_SERIES_RANK = {"EQ": 0, "BE": 1, "BZ": 2, "RR": 3, "IV": 4, "SM": 5}


def resolve_nse_equity_symbol(
    symbol: str,
    *,
    force_refresh: bool = False,
) -> tuple[dict | None, str | None]:
    """
    Map an NSE trading symbol to an instrument dict.

    Returns (instrument, None) on success or (None, reason) when not found.
    """
    equity = load_nse_equity_instruments(force_refresh=force_refresh)
    sym = (symbol or "").strip().upper()
    if not sym:
        return None, "empty_symbol"

    matched = equity[equity["symbol_upper"] == sym]
    if matched.empty:
        return None, "not_in_scrip_master"

    if len(matched) > 1:
        matched = matched.copy()
        matched["_series_rank"] = matched["SEM_SERIES"].map(
            lambda s: _SERIES_RANK.get(str(s).upper(), 99)
        )
        matched = matched.sort_values(["_series_rank", "SEM_SMST_SECURITY_ID"])

    row = matched.iloc[0]
    return row_to_instrument(row), None


def build_label_map(instruments: pd.DataFrame) -> dict[str, dict]:
    """Map display label -> instrument fields needed for historical fetch."""
    mapping: dict[str, dict] = {}
    for _, row in instruments.iterrows():
        item = row_to_instrument(row)
        mapping[item["label"]] = {
            "symbol": item["symbol"],
            "security_id": item["security_id"],
            "exchange_segment": item["exchange_segment"],
            "instrument_type": item["instrument_type"],
            "display_name": item["display_name"],
        }
    return mapping


def search_nse_equity_instruments(
    query: str,
    *,
    limit: int = 50,
    force_refresh: bool = False,
) -> list[dict]:
    """
    Return up to `limit` NSE equity instruments matching `query`.

    Ranking: trading-symbol prefix, then display/label prefix, then substring.
    Empty query returns an empty list.
    """
    equity = load_nse_equity_instruments(force_refresh=force_refresh)

    q = (query or "").strip().upper()
    if not q:
        return []

    symbol_prefix = equity["symbol_upper"].str.startswith(q)
    display_prefix = equity["display_upper"].str.startswith(q)
    label_prefix = equity["label_upper"].str.startswith(q)
    substring = (
        equity["symbol_upper"].str.contains(q, regex=False)
        | equity["display_upper"].str.contains(q, regex=False)
        | equity["label_upper"].str.contains(q, regex=False)
    )

    matched = equity[substring].copy()
    if matched.empty:
        return []

    matched["_rank"] = 3
    matched.loc[symbol_prefix[matched.index], "_rank"] = 0
    matched.loc[
        (~symbol_prefix[matched.index])
        & (display_prefix[matched.index] | label_prefix[matched.index]),
        "_rank",
    ] = 1
    matched = matched.sort_values(["_rank", "SEM_TRADING_SYMBOL"]).head(limit)

    return [row_to_instrument(row) for _, row in matched.iterrows()]

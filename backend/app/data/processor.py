from __future__ import annotations

import math
from datetime import date, datetime

import pandas as pd

from .. import db
from ..settings import (
    AppConfig,
    RuntimeCheckpoint,
    checkpoint_number,
    checkpoint_ordinal,
    checkpoint_ordinal_word,
    default_checkpoint_name,
    get_config,
    render_template,
    resolve_checkpoint,
)
from .loader import STATE
from .sources import CANONICAL_IMPACT_COLUMNS, CANONICAL_USER_COLUMNS, get_source
from .sources.base import ensure_columns


# --------------------------------------------------------------------------- #
# Normalization (raw source DataFrame -> typed/cleaned DataFrame)
# --------------------------------------------------------------------------- #
def normalize_users(df: pd.DataFrame, config: AppConfig) -> pd.DataFrame:
    df = ensure_columns(df.copy(), CANONICAL_USER_COLUMNS)
    grad_field = config.grad_year_field or "Graduation Term"
    # Keep only rows with a graduation term *if* that yields a non-empty roster;
    # sources without a grad term (some GivePulse groups) keep everyone.
    if grad_field in df.columns:
        has_term = df[grad_field].notna() & (df[grad_field].astype(str).str.strip() != "")
        if has_term.any():
            df = df[has_term]

    df["email"] = df["Email"].astype(str).str.lower().str.strip()
    # Drop rows without a usable email (blank export rows parse as "nan").
    df = df[df["email"].str.contains("@", na=False)]
    # Pull the first 4-digit run from the configured column so "Spring 2029",
    # "2029", and "2029-05" all resolve to 2029.
    grad_raw = df.get(grad_field, pd.Series("", index=df.index)).astype(str)
    df["grad_year"] = (
        pd.to_numeric(grad_raw.str.extract(r"(\d{4})", expand=False), errors="coerce")
        .fillna(0)
        .astype(int)
    )

    labels_map = config.class_labels
    order_by_label = {label: i for i, label in enumerate(labels_map.values())}
    other_sort = len(order_by_label)
    default_cohort_id = config.default_cohort().id

    # Class label from graduation year (CSV); fall back to a text class field
    # (e.g. GivePulse "Class Year": Senior/Junior/...) when grad year is absent.
    if config.class_field in df.columns:
        class_field_vals = df[config.class_field].astype(str).str.strip()
    else:
        class_field_vals = pd.Series([""] * len(df), index=df.index)

    def resolve_label(grad_year: int, fallback: object) -> str:
        base = labels_map.get(str(int(grad_year)), "")
        if base:
            return base
        fb = "" if fallback is None or pd.isna(fallback) else str(fallback).strip()
        if fb and fb.lower() not in {"", "nan", "none"}:
            return fb
        return "Other"

    df["class_label"] = [resolve_label(y, f) for y, f in zip(df["grad_year"], class_field_vals)]
    # Manual class overrides win over auto-detection (and, below, feed cohort
    # label matching) so a roster with no usable grad year can still be classed.
    manual_classes = {str(e).lower().strip(): str(l).strip() for e, l in config.manual_classes.items() if str(l).strip()}
    if manual_classes:
        df["class_label"] = [
            manual_classes.get(email, label) for email, label in zip(df["email"], df["class_label"])
        ]
    df["class_sort"] = df["class_label"].map(lambda label: order_by_label.get(label, other_sort))
    cohorts = [config.cohort_for(int(y), cl) for y, cl in zip(df["grad_year"], df["class_label"])]
    # Manual senior overrides: force listed emails into the senior cohort when the
    # data lacks a usable graduation year / class field.
    manual_seniors = {str(e).lower().strip() for e in config.manual_seniors}
    senior_cohort = config.senior_cohort() if manual_seniors else None
    if senior_cohort is not None:
        cohorts = [
            senior_cohort if email in manual_seniors else cohort
            for email, cohort in zip(df["email"], cohorts)
        ]
    df["cohort_id"] = [c.id for c in cohorts]
    df["cohort_label"] = [c.label for c in cohorts]
    df["is_senior"] = df["cohort_id"] != default_cohort_id

    preferred = df.get("Preferred Name", pd.Series([""] * len(df), index=df.index))
    first = df.get("First Name", pd.Series([""] * len(df), index=df.index))
    last = df.get("Last Name", pd.Series([""] * len(df), index=df.index))
    df["preferred_first"] = preferred.fillna("").astype(str).str.strip()
    df["first_name"] = first.fillna("").astype(str).str.strip()
    df["last_name"] = last.fillna("").astype(str).str.strip()
    df["display_name"] = df.apply(
        lambda row: ((row["preferred_first"] or row["first_name"]) + " " + row["last_name"]).strip(),
        axis=1,
    )
    df["last_impacts"] = df.get("Last Impacts", pd.Series([""] * len(df), index=df.index))
    return df


def normalize_impacts(df: pd.DataFrame, checkpoint: RuntimeCheckpoint, config: AppConfig) -> pd.DataFrame:
    df = ensure_columns(df.copy(), CANONICAL_IMPACT_COLUMNS)
    df["Start Date"] = pd.to_datetime(df.get("Start Date"), format="%m/%d/%Y", errors="coerce")
    df["Date Created"] = pd.to_datetime(df.get("Date Created"), format="%m/%d/%Y", errors="coerce")
    df["Hours Served"] = pd.to_numeric(df.get("Hours Served"), errors="coerce").fillna(0.0)
    df["email"] = df["Email"].astype(str).str.lower().str.strip()
    df["Verified"] = df.get("Verified", pd.Series("", index=df.index)).astype(str).fillna("").str.strip()
    df = df[df["Start Date"] >= pd.Timestamp(config.program_start)]
    df = df[df["Start Date"] <= pd.Timestamp(checkpoint.date)]
    df = df[df["Verified"].str.lower() != "disputed"]
    return df.reset_index(drop=True)


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
def format_hours(value: float) -> str:
    text = f"{float(value):.2f}"
    if text.endswith("00"):
        return f"{float(value):.1f}"
    if text.endswith("0"):
        return text[:-1]
    return text


def safe_text(value: object, fallback: str = "") -> str:
    if pd.isna(value):
        return fallback
    text = str(value).strip()
    return text if text else fallback


def reflection_text(row: pd.Series, config: AppConfig) -> str:
    """First non-empty value among the configured reflection fields."""
    for field in config.reflection.fields:
        value = safe_text(row.get(field))
        if value:
            return value
    return ""


def remaining_weeks_until_final(current_date: date, config: AppConfig) -> int:
    days_remaining = max(0, (config.program_end - current_date).days)
    return math.ceil(days_remaining / 7) if days_remaining > 0 else 0


def get_effective_reference_date(checkpoint_name: str | None = None, impacts_df: pd.DataFrame | None = None) -> date:
    checkpoint = resolve_checkpoint(checkpoint_name)
    candidates = [checkpoint.date, date.today()]
    source_df = impacts_df if impacts_df is not None else STATE.impacts_df
    if source_df is not None and not source_df.empty and source_df["Start Date"].notna().any():
        candidates.append(pd.Timestamp(source_df["Start Date"].max()).date())
    return min(candidates)


def build_checkpoint_message(status: str, hours: float, checkpoint: RuntimeCheckpoint, goal_hours: float, config: AppConfig) -> str:
    template = config.message_templates.get(status, "")
    if not template:
        return ""
    return render_template(
        template,
        {
            "ordinal": checkpoint_ordinal(checkpoint.name, config),
            "ordinal_word": checkpoint_ordinal_word(checkpoint.name, config),
            "checkpoint_number": checkpoint_number(checkpoint.name, config),
            "checkpoint_name": checkpoint.name,
            "run_date": checkpoint.date.strftime("%B %-d, %Y"),
            "goal": format_hours(goal_hours),
            "hours": format_hours(hours),
        },
    )


# --------------------------------------------------------------------------- #
# Member table
# --------------------------------------------------------------------------- #
def build_member_table(users_df: pd.DataFrame, impacts_df: pd.DataFrame, checkpoint: RuntimeCheckpoint, config: AppConfig) -> pd.DataFrame:
    st = config.status
    default_id = config.default_cohort().id
    final_cp = config.final_checkpoint()
    exemptions = db.get_exemptions()
    reference_date = get_effective_reference_date(checkpoint.name, impacts_df)
    recent_cutoff = pd.Timestamp(reference_date) - pd.Timedelta(days=st.recent_window_days)

    hours_by_email = impacts_df.groupby("email")["Hours Served"].sum()
    pending_hours = (
        impacts_df[impacts_df["Verified"].str.lower() == "pending"].groupby("email")["Hours Served"].sum()
    )
    recent_hours = impacts_df[impacts_df["Start Date"] >= recent_cutoff].groupby("email")["Hours Served"].sum()

    member_df = users_df.copy()
    member_df["hours"] = member_df["email"].map(hours_by_email).fillna(0.0)
    member_df["pending_hours"] = member_df["email"].map(pending_hours).fillna(0.0)
    member_df["recent_hours"] = member_df["email"].map(recent_hours).fillna(0.0)
    member_df["required"] = member_df["cohort_id"].apply(lambda c: checkpoint.req(c, default_id))
    member_df["final_required"] = member_df["cohort_id"].apply(
        lambda c: config.requirement(final_cp, c) if final_cp else 0.0
    )
    member_df["still_needed"] = (member_df["required"] - member_df["hours"]).clip(lower=0)
    member_df["final_still_needed"] = (member_df["final_required"] - member_df["hours"]).clip(lower=0)
    member_df["progress_pct"] = ((member_df["hours"] / member_df["required"]) * 100).clip(upper=100).fillna(0)
    # An empty groupby keeps the datetime dtype, which Series.map can't cast.
    weeks_by_email = (
        impacts_df.groupby("email")["Start Date"].apply(lambda s: s.dt.to_period("W").nunique())
        if not impacts_df.empty
        else pd.Series(dtype=float)
    )
    member_df["active_weeks"] = member_df["email"].map(weeks_by_email).fillna(0).astype(int)
    member_df["avg_week"] = (member_df["hours"] / member_df["active_weeks"].replace(0, 1)).round(2)
    weeks_remaining = remaining_weeks_until_final(reference_date, config)
    member_df["weeks_remaining_to_cp4"] = weeks_remaining
    member_df["pace_needed"] = member_df.apply(
        lambda row: round(row["final_still_needed"] / weeks_remaining, 2)
        if weeks_remaining > 0 and row["final_still_needed"] > 0
        else 0.0,
        axis=1,
    )
    member_df["pace_gap"] = (member_df["pace_needed"] - member_df["avg_week"]).round(2)
    member_df["pace_ratio"] = member_df.apply(
        lambda row: round(row["avg_week"] / row["pace_needed"], 2) if row["pace_needed"] > 0 else None,
        axis=1,
    )
    member_df["projected_final_hours"] = member_df.apply(
        lambda row: round(float(row["hours"]) + float(row["avg_week"]) * weeks_remaining, 2),
        axis=1,
    )
    member_df["projected_final_gap"] = (
        (member_df["final_required"] - member_df["projected_final_hours"]).clip(lower=0).round(2)
    )

    def compute_status(row: pd.Series) -> str:
        if row["email"] in exemptions:
            return "Exempt"
        if row["hours"] == 0 and st.blue_when_zero:
            return "Blue"
        if row["hours"] < st.yellow_ratio * row["required"]:
            return "Red"
        if row["hours"] < row["required"]:
            return "Yellow"
        return "Green"

    member_df["status"] = member_df.apply(compute_status, axis=1)
    member_df["risk_score"] = member_df.apply(
        lambda row: round(
            (
                st.weight_blue if row["status"] == "Blue"
                else st.weight_red if row["status"] == "Red"
                else st.weight_yellow if row["status"] == "Yellow"
                else 0
            )
            + max(row["pace_gap"], 0) * st.weight_pace_gap
            + (st.weight_stalled if row["recent_hours"] == 0 and row["hours"] > 0 else 0)
            + min(row["pending_hours"], st.pending_cap),
            2,
        ),
        axis=1,
    )
    member_df["message"] = member_df.apply(
        lambda row: build_checkpoint_message(row["status"], row["hours"], checkpoint, row["required"], config)
        if row["status"] != "Exempt"
        else "",
        axis=1,
    )
    member_df["exempt_reason"] = member_df["email"].map(lambda email: exemptions.get(email, {}).get("reason", ""))
    member_df = member_df.sort_values(["class_sort", "last_name", "first_name"]).reset_index(drop=True)
    return member_df


# --------------------------------------------------------------------------- #
# Load / status
# --------------------------------------------------------------------------- #
def load_dashboard_data(checkpoint_name: str | None = None, force: bool = False, refetch: bool = False) -> dict:
    """Build the dashboard for the active config + checkpoint.

    The expensive part -- pulling raw users/impacts from the source (esp. the
    GivePulse API) -- is cached on STATE and only re-run when ``refetch`` is set or
    the source/group changed. Config edits (checkpoints, cohorts, reflections) and
    checkpoint switches reuse the cached raw data and just re-process it, so they
    never re-hit the API.
    """
    config = get_config()
    name = checkpoint_name or STATE.active_checkpoint or default_checkpoint_name(config)
    checkpoint = resolve_checkpoint(name, config)
    source = get_source(config)
    desc = source.describe()
    source_label = desc.get("users_file") or desc.get("group_id") or desc.get("source")
    source_key = f"{source.name}:{desc.get('group_id') or ''}:{source_label or ''}"

    need_fetch = refetch or STATE.raw_users_df is None or STATE.raw_source_key != source_key
    if need_fetch:
        STATE.raw_users_df = source.fetch_users()
        STATE.raw_impacts_df = source.fetch_impacts()
        STATE.raw_source_key = source_key
        STATE.source_name = source.name
        STATE.users_file = source_label
        STATE.impacts_file = desc.get("impacts_file") or desc.get("source")
        STATE.last_fetched_at = datetime.utcnow().isoformat()

    users_df = normalize_users(STATE.raw_users_df, config)
    impacts_df = normalize_impacts(STATE.raw_impacts_df, checkpoint, config)
    member_df = build_member_table(users_df, impacts_df, checkpoint, config)

    STATE.users_df = users_df
    STATE.impacts_df = impacts_df
    STATE.member_df = member_df
    STATE.active_checkpoint = checkpoint.name
    STATE.last_loaded_at = datetime.utcnow().isoformat()
    return data_status()


def data_status() -> dict:
    from ..config import DEMO_MODE

    return {
        "demo_mode": DEMO_MODE,
        "loaded": STATE.member_df is not None,
        "active_checkpoint": STATE.active_checkpoint,
        "source": STATE.source_name,
        "users_file": STATE.users_file,
        "impacts_file": STATE.impacts_file,
        "users_rows": 0 if STATE.users_df is None else len(STATE.users_df),
        "impacts_rows": 0 if STATE.impacts_df is None else len(STATE.impacts_df),
        "member_rows": 0 if STATE.member_df is None else len(STATE.member_df),
        "active_member_rows": 0 if STATE.member_df is None else int((STATE.member_df["status"] != "Exempt").sum()),
        "last_loaded_at": STATE.last_loaded_at,
        "last_fetched_at": STATE.last_fetched_at,
    }


# --------------------------------------------------------------------------- #
# Read queries
# --------------------------------------------------------------------------- #
def get_members_filtered(class_name: str | None = None, status: str | None = None, sort: str | None = None) -> list[dict]:
    member_df = STATE.member_df.copy()
    if class_name:
        member_df = member_df[member_df["class_label"].str.lower() == class_name.lower()]
    if status:
        member_df = member_df[member_df["status"].str.lower() == status.lower()]
    sort_key = sort or "class_sort"
    if sort_key in member_df.columns:
        member_df = member_df.sort_values(sort_key, ascending=sort_key not in {"hours", "pending_hours", "progress_pct"})
    return member_df.fillna("").to_dict(orient="records")


def get_member_profile(email: str) -> dict:
    import math as _math

    config = get_config()
    email = email.lower().strip()
    raw = STATE.member_df[STATE.member_df["email"] == email].iloc[0].to_dict()
    member: dict = {}
    for k, v in raw.items():
        if isinstance(v, float) and (_math.isnan(v) or _math.isinf(v)):
            member[k] = None
        elif hasattr(v, "isoformat"):
            member[k] = v.isoformat()
        else:
            member[k] = v
    impacts = STATE.impacts_df[STATE.impacts_df["email"] == email].copy().sort_values("Start Date")
    weekly = (
        impacts.assign(week=impacts["Start Date"].dt.to_period("W").dt.start_time)
        .groupby("week")["Hours Served"].sum().reset_index()
    )
    partner_breakdown = impacts.groupby("Group")["Hours Served"].sum().sort_values(ascending=False).reset_index()
    history = impacts.sort_values("Start Date", ascending=False)
    cohort_id = member.get("cohort_id", config.default_cohort().id)
    checkpoint_progress = []
    for cp in config.sorted_checkpoints():
        checkpoint_hours = impacts[impacts["Start Date"] <= pd.Timestamp(cp.date)]["Hours Served"].sum()
        required = config.requirement(cp, cohort_id)
        checkpoint_progress.append(
            {
                "name": cp.name,
                "date": cp.date.isoformat(),
                "hours": round(float(checkpoint_hours), 2),
                "required": required,
                "req": required,
                "met": bool(checkpoint_hours >= required),
                "pct": round(min(100.0, float(checkpoint_hours) / required * 100 if required else 0), 1),
            }
        )
    return {
        **member,
        "weekly_activity": [
            {"week": row["week"].strftime("%b %-d"), "hours": round(float(row["Hours Served"]), 2)}
            for _, row in weekly.iterrows()
        ],
        "partner_breakdown": [
            {"partner": row["Group"] or "(No Group Listed)", "hours": round(float(row["Hours Served"]), 2)}
            for _, row in partner_breakdown.iterrows()
        ],
        "checkpoint_progress": checkpoint_progress,
        "impact_history": [
            {
                "start_date": row["Start Date"].date().isoformat() if pd.notna(row["Start Date"]) else "",
                "group": safe_text(row["Group"], "(No Group Listed)"),
                "event_name": safe_text(row["Event Name"]),
                "hours": round(float(row["Hours Served"]), 2),
                "verified": safe_text(row["Verified"]),
                "reflection": reflection_text(row, config),
            }
            for _, row in history.iterrows()
        ],
    }


def get_member_activity(email: str) -> list[dict]:
    config = get_config()
    email = email.lower().strip()
    impacts = STATE.impacts_df[STATE.impacts_df["email"] == email].copy()
    reference_date = get_effective_reference_date(STATE.active_checkpoint, STATE.impacts_df)
    all_periods = pd.period_range(start=pd.Timestamp(config.program_start), end=pd.Timestamp(reference_date), freq="W")
    weekly = pd.DataFrame(
        {
            "week_start": all_periods.start_time,
            "week_label": [period.start_time.strftime("%-m/%-d") for period in all_periods],
        }
    )
    if not impacts.empty:
        actual = (
            impacts.assign(week_start=impacts["Start Date"].dt.to_period("W").dt.start_time)
            .groupby("week_start")["Hours Served"].sum().reset_index()
        )
        actual.columns = ["week_start", "hours"]
        weekly = weekly.merge(actual, on="week_start", how="left")
    if "hours" not in weekly.columns:
        weekly["hours"] = 0.0
    weekly["hours"] = weekly["hours"].fillna(0.0)
    weekly["cumulative"] = weekly["hours"].cumsum()
    return [
        {
            "week": row["week_start"].strftime("%Y-%m-%d"),
            "week_label": row["week_label"],
            "hours": round(float(row["hours"]), 2),
            "cumulative": round(float(row["cumulative"]), 2),
        }
        for _, row in weekly.iterrows()
    ]


def get_member_impacts(email: str) -> list[dict]:
    config = get_config()
    email = email.lower().strip()
    impacts = STATE.impacts_df[STATE.impacts_df["email"] == email].copy().sort_values("Start Date", ascending=False)
    return [
        {
            "impact_id": str(row.get("Impact ID", "")),
            "start_date": row["Start Date"].date().isoformat() if pd.notna(row["Start Date"]) else "",
            "group": safe_text(row.get("Group"), "(No Group Listed)"),
            "event_name": safe_text(row.get("Event Name")),
            "hours": round(float(row.get("Hours Served", 0)), 2),
            "verified": safe_text(row.get("Verified")),
            "reflection": reflection_text(row, config),
        }
        for _, row in impacts.iterrows()
    ]


def get_date_range_hours(start: date, end: date) -> list[dict]:
    impacts = STATE.impacts_df.copy()
    subset = impacts[(impacts["Start Date"] >= pd.Timestamp(start)) & (impacts["Start Date"] <= pd.Timestamp(end))]
    grouped = subset.groupby("email").agg(hours=("Hours Served", "sum"), impacts=("Impact ID", "count")).reset_index()
    enriched = grouped.merge(
        STATE.member_df[["email", "display_name", "class_label", "status"]], on="email", how="left"
    )
    return enriched.sort_values("hours", ascending=False).fillna("").to_dict(orient="records")

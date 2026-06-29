"""Runtime, user-editable configuration.

Everything that used to be a hardcoded constant in ``config.py`` (program dates,
checkpoints, hour requirements, cohorts, reflection rules, status thresholds,
Slack templates, the active data source) now lives in an :class:`AppConfig` that
is persisted as a JSON blob in SQLite and cached in memory. Defaults reproduce
the original Bonner program exactly, so an untouched install behaves identically.

The whole config serializes to JSON for export/import, so a program can carry its
setup between machines.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #
class Cohort(BaseModel):
    """A requirement tier. A member belongs to the first cohort whose
    ``grad_years`` contains their graduation year, otherwise the default cohort."""

    id: str
    label: str
    grad_years: list[int] = Field(default_factory=list)
    is_default: bool = False


class CheckpointConfig(BaseModel):
    name: str
    date: date
    # cohort id -> required hours at this checkpoint
    requirements: dict[str, float] = Field(default_factory=dict)


class ReflectionConfig(BaseModel):
    # Impact columns that count as a "reflection". Empty list disables the feature.
    fields: list[str] = Field(default_factory=lambda: ["Review/Reflection"])
    empty_values: list[str] = Field(
        default_factory=lambda: ["", "n/a", "na", "none", "nil"]
    )
    # "all": a row is blank only if every configured field is blank.
    # "any": a row is blank if any configured field is blank.
    blank_rule: Literal["all", "any"] = "all"


class StatusConfig(BaseModel):
    # hours < yellow_ratio * required  -> Red ; < required -> Yellow ; else Green
    yellow_ratio: float = 0.75
    blue_when_zero: bool = True
    recent_window_days: int = 14
    # risk score weights
    weight_blue: float = 300
    weight_red: float = 200
    weight_yellow: float = 100
    weight_pace_gap: float = 10
    weight_stalled: float = 20  # had hours but none recently
    pending_cap: float = 10


class AppConfig(BaseModel):
    program_name: str = "Bonner Program"
    timezone: str = "America/Chicago"
    theme: Literal["dark", "light"] = "dark"
    program_start: date = date(2026, 1, 1)

    cohorts: list[Cohort] = Field(default_factory=list)
    checkpoints: list[CheckpointConfig] = Field(default_factory=list)

    reflection: ReflectionConfig = Field(default_factory=ReflectionConfig)
    status: StatusConfig = Field(default_factory=StatusConfig)

    # grad year -> display class label/sort (drives Members class filter & grouping)
    class_labels: dict[str, str] = Field(
        default_factory=lambda: {
            "2026": "Senior",
            "2027": "Junior",
            "2028": "Sophomore",
            "2029": "Freshman",
        }
    )

    # User column that holds the graduation year/term (its first 4 digits are read
    # as the grad year, e.g. "Spring 2029" / "2029" -> 2029). The grad year then
    # maps to a class label via ``class_labels`` (2029 -> Freshman, ...).
    grad_year_field: str = "Graduation Term"

    # Impact/user column that holds a class label when graduation year is absent.
    class_field: str = "Class Year"

    # Manual senior roster (lowercase emails). Used as a fallback when the data has
    # no graduation year / class field: these members are forced into the senior
    # requirement cohort regardless of grad year.
    manual_seniors: list[str] = Field(default_factory=list)

    # Manual class overrides (lowercase email -> class label, e.g. "Freshman").
    # Used when the data has no usable graduation year / class field: the label
    # replaces the auto-detected class and also drives cohort label matching.
    manual_classes: dict[str, str] = Field(default_factory=dict)

    data_source: Literal["csv"] = "csv"

    # Ordered roster for the paste-in export (one name per line; "" -> blank row).
    roster_order: list[str] = Field(default_factory=list)
    # explicit name -> email overrides for matching pasted names to members
    name_mappings: dict[str, str] = Field(default_factory=dict)

    message_templates: dict[str, str] = Field(default_factory=dict)

    onboarding_complete: bool = False

    # ---- derived helpers ------------------------------------------------- #
    @property
    def program_end(self) -> date:
        if not self.checkpoints:
            return self.program_start
        return max(cp.date for cp in self.checkpoints)

    def default_cohort(self) -> Cohort:
        for cohort in self.cohorts:
            if cohort.is_default:
                return cohort
        return self.cohorts[-1] if self.cohorts else Cohort(id="all", label="All", is_default=True)

    def cohort_for_grad_year(self, grad_year: int) -> Cohort:
        for cohort in self.cohorts:
            if cohort.grad_years and grad_year in cohort.grad_years:
                return cohort
        return self.default_cohort()

    def senior_cohort(self) -> Optional[Cohort]:
        """The cohort that represents seniors: prefer a cohort literally labelled
        "senior", otherwise the first non-default cohort."""
        for cohort in self.cohorts:
            if "senior" in cohort.label.strip().lower():
                return cohort
        for cohort in self.cohorts:
            if not cohort.is_default:
                return cohort
        return None

    def cohort_for(self, grad_year: int, class_label: str = "") -> Cohort:
        """Resolve a member's requirement cohort by graduation year, falling back
        to matching a class label (e.g. "Senior") against a cohort's label."""
        for cohort in self.cohorts:
            if cohort.grad_years and grad_year in cohort.grad_years:
                return cohort
        label = str(class_label or "").strip().lower()
        if label:
            for cohort in self.cohorts:
                if cohort.label.strip().lower() == label:
                    return cohort
        return self.default_cohort()

    def sorted_checkpoints(self) -> list[CheckpointConfig]:
        return sorted(self.checkpoints, key=lambda cp: cp.date)

    def final_checkpoint(self) -> Optional[CheckpointConfig]:
        cps = self.sorted_checkpoints()
        return cps[-1] if cps else None

    def requirement(self, checkpoint: CheckpointConfig, cohort_id: str) -> float:
        reqs = checkpoint.requirements
        if cohort_id in reqs:
            return float(reqs[cohort_id])
        default = self.default_cohort().id
        if default in reqs:
            return float(reqs[default])
        return float(next(iter(reqs.values()), 0.0))


# --------------------------------------------------------------------------- #
# Defaults (reproduce the original hardcoded Bonner program exactly)
# --------------------------------------------------------------------------- #
DEFAULT_MESSAGE_TEMPLATES = {
    "Green": (
        "Hey! I just wanted to shoot a quick hour update. This is for our {ordinal} checkpoint, "
        "which was run on {run_date} - the goal for this checkpoint was {goal} hours. "
        "You are in the green with {hours} hours. Keep up the good work! And let me know if "
        "you have any questions!"
    ),
    "Yellow": (
        "Hey! I just wanted to shoot you a quick update for this hour checkpoint. This is for "
        "our {ordinal} checkpoint, which was run on {run_date} - the goal for this checkpoint "
        "was {goal} hours. You are currently in the yellow with {hours} hours, meaning you are "
        "within 75% of your hours for this checkpoint. If you have any hours that have not yet "
        "been logged, please get them in as soon as possible. Let us know if you have any "
        "questions or if we can support you in any way!"
    ),
    "Red": (
        "Hey! I just want to give you a quick hour update. This is for our {ordinal} checkpoint, "
        "which was run on {run_date} - the goal for this checkpoint was {goal} hours. Currently, "
        "you are in the red with {hours} hours, which is okay! We just need to be aware of this "
        "so that we can make a plan to get back on track as we continue through the semester. "
        "Please reach out to the program team to figure out how we can "
        "get your hours in! Let us know if you have any questions or if we can support you in any way."
    ),
    "Blue": (
        "Hey! Just want to check in and ask how your work is going. This is for our {ordinal} "
        "checkpoint, which was run on {run_date} - the goal for this checkpoint was {goal} hours. "
        "I ran the hour report and noticed that you have not logged any hours for the semester. "
        "Myself and the other program leads are happy to work through this with you and develop a "
        "plan to get your hours logged. Please let us know how we can support you!"
    ),
}


TEMPLATE_VARIABLES = [
    {
        "token": "hours",
        "label": "Hours",
        "description": "Member's logged hours",
        "example": "58.5",
    },
    {
        "token": "goal",
        "label": "Goal",
        "description": "Checkpoint goal hours",
        "example": "69",
    },
    {
        "token": "run_date",
        "label": "Run date",
        "description": "Checkpoint date",
        "example": "March 20, 2026",
    },
    {
        "token": "ordinal",
        "label": "Ordinal",
        "description": "Checkpoint ordinal like \"2nd\"",
        "example": "2nd",
    },
    {
        "token": "ordinal_word",
        "label": "Ordinal (word)",
        "description": "Checkpoint ordinal as a word",
        "example": "second",
    },
    {
        "token": "checkpoint_number",
        "label": "Checkpoint number",
        "description": "Checkpoint number",
        "example": "2",
    },
    {
        "token": "checkpoint_name",
        "label": "Checkpoint name",
        "description": "Configured checkpoint name",
        "example": "CP2",
    },
]


def render_template(template: str, values: dict[str, str]) -> str:
    """Substitute ``{token}`` placeholders with ``values``, leaving unknown
    tokens and any stray braces untouched so user-edited templates never raise."""

    def _sub(match: re.Match[str]) -> str:
        token = match.group(1)
        return values[token] if token in values else match.group(0)

    return re.sub(r"\{(\w+)\}", _sub, template)


def default_config() -> AppConfig:
    return AppConfig(
        program_name="Bonner Program",
        program_start=date(2026, 1, 1),
        cohorts=[
            Cohort(id="senior", label="Senior", grad_years=[2026]),
            Cohort(id="all", label="All others", grad_years=[], is_default=True),
        ],
        checkpoints=[
            CheckpointConfig(name="CP1", date=date(2026, 2, 13), requirements={"senior": 23.4, "all": 26.6}),
            CheckpointConfig(name="CP2", date=date(2026, 3, 20), requirements={"senior": 58.5, "all": 69.0}),
            CheckpointConfig(name="CP3", date=date(2026, 4, 17), requirements={"senior": 87.75, "all": 103.5}),
            CheckpointConfig(name="CP4", date=date(2026, 5, 14), requirements={"senior": 117.0, "all": 133.0}),
        ],
        message_templates=dict(DEFAULT_MESSAGE_TEMPLATES),
    )


# --------------------------------------------------------------------------- #
# Load / cache
# --------------------------------------------------------------------------- #
_CACHE: AppConfig | None = None


def get_config() -> AppConfig:
    global _CACHE
    if _CACHE is None:
        _CACHE = _load_from_db()
    return _CACHE


def reload_config() -> AppConfig:
    global _CACHE
    _CACHE = _load_from_db()
    return _CACHE


def save_config(config: AppConfig) -> AppConfig:
    """Persist and refresh the cache. Secrets are handled separately."""
    from . import db

    db.set_config_json(config.model_dump(mode="json"))
    return reload_config()


def _load_from_db() -> AppConfig:
    from . import db

    raw = db.get_config_json()
    if not raw:
        config = default_config()
        db.set_config_json(config.model_dump(mode="json"))
        return config
    # Merge stored values over defaults so new fields get sensible defaults.
    merged = default_config().model_dump(mode="json")
    merged.update(raw)
    # Migrate older configs: GivePulse was removed; force CSV and drop its block.
    merged.pop("givepulse", None)
    if merged.get("data_source") != "csv":
        merged["data_source"] = "csv"
    config = AppConfig.model_validate(merged)
    if not config.message_templates:
        config.message_templates = dict(DEFAULT_MESSAGE_TEMPLATES)
    return config


# --------------------------------------------------------------------------- #
# Runtime checkpoint resolution (replaces the old config.Checkpoint helpers)
# --------------------------------------------------------------------------- #
_ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"]
_ORDINAL_WORDS = [
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "ninth",
    "tenth",
]


@dataclass(frozen=True)
class RuntimeCheckpoint:
    name: str
    date: date
    requirements: dict[str, float]

    def req(self, cohort_id: str, default_id: str) -> float:
        if cohort_id in self.requirements:
            return float(self.requirements[cohort_id])
        if default_id in self.requirements:
            return float(self.requirements[default_id])
        return float(next(iter(self.requirements.values()), 0.0))


def default_checkpoint_name(config: AppConfig | None = None) -> str:
    config = config or get_config()
    today = date.today()
    cps = config.sorted_checkpoints()
    if not cps:
        return "TODAY"
    for cp in cps:
        if cp.date >= today:
            return cp.name
    return cps[-1].name


def _interpolate(milestones: list[tuple[date, float]], target: date) -> float:
    if target >= milestones[-1][0]:
        return milestones[-1][1]
    if target <= milestones[0][0]:
        return 0.0
    for i in range(1, len(milestones)):
        prev_d, prev_r = milestones[i - 1]
        next_d, next_r = milestones[i]
        if prev_d <= target <= next_d:
            span = (next_d - prev_d).days
            elapsed = (target - prev_d).days
            frac = elapsed / span if span else 1.0
            return prev_r + (next_r - prev_r) * frac
    return milestones[-1][1]


def today_checkpoint(config: AppConfig | None = None) -> RuntimeCheckpoint:
    config = config or get_config()
    today = date.today()
    cps = config.sorted_checkpoints()
    default_id = config.default_cohort().id
    requirements: dict[str, float] = {}
    for cohort in config.cohorts:
        milestones = [(config.program_start, 0.0)] + [
            (cp.date, cp.requirements.get(cohort.id, cp.requirements.get(default_id, 0.0))) for cp in cps
        ]
        requirements[cohort.id] = round(_interpolate(milestones, today), 2) if cps else 0.0
    return RuntimeCheckpoint(name="TODAY", date=today, requirements=requirements)


def resolve_checkpoint(name: str | None, config: AppConfig | None = None) -> RuntimeCheckpoint:
    config = config or get_config()
    active = name or default_checkpoint_name(config)
    if active == "TODAY":
        return today_checkpoint(config)
    for cp in config.sorted_checkpoints():
        if cp.name == active:
            return RuntimeCheckpoint(name=cp.name, date=cp.date, requirements=dict(cp.requirements))
    final = config.final_checkpoint()
    if final:
        return RuntimeCheckpoint(name=final.name, date=final.date, requirements=dict(final.requirements))
    return today_checkpoint(config)


def checkpoint_ordinal(name: str, config: AppConfig | None = None) -> str:
    config = config or get_config()
    for idx, cp in enumerate(config.sorted_checkpoints()):
        if cp.name == name:
            return _ORDINALS[idx] if idx < len(_ORDINALS) else f"{idx + 1}th"
    return "current pace"


def checkpoint_ordinal_word(name: str, config: AppConfig | None = None) -> str:
    config = config or get_config()
    for idx, cp in enumerate(config.sorted_checkpoints()):
        if cp.name == name:
            return _ORDINAL_WORDS[idx] if idx < len(_ORDINAL_WORDS) else f"{idx + 1}th"
    return "current"


def checkpoint_number(name: str, config: AppConfig | None = None) -> str:
    config = config or get_config()
    for idx, cp in enumerate(config.sorted_checkpoints()):
        if cp.name == name:
            return str(idx + 1)
    return ""

"""Generate FSRS reference vectors from py-fsrs for the ts-fsrs parity test.

Output: tests/fixtures/fsrs/vectors.json (deterministic; fuzz off, no (re)learning steps).
The top-level header is the scheduler config other consumers copy verbatim.

Usage: python scripts/fsrs/gen_vectors.py [--out PATH]
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from importlib.metadata import version
from pathlib import Path

from fsrs import Card, Rating, Scheduler

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "tests" / "fixtures" / "fsrs" / "vectors.json"
BASE = datetime(2026, 1, 1, 9, 0, 0, tzinfo=timezone.utc)
MAX_INTERVAL = 365

# Each step: (rating, when) where when is "due" (review exactly at due), or a float
# multiple of the current interval measured from the last review (0.5 = early, 3.0 = late).
CASES: list[tuple[str, list[tuple[int, str | float]]]] = [
    ("first-again", [(1, "due"), (3, "due")]),
    ("first-hard", [(2, "due"), (3, "due")]),
    ("first-good", [(3, "due"), (3, "due")]),
    ("first-easy", [(4, "due"), (4, "due")]),
    ("good-streak-to-cap", [(3, "due")] * 12),
    ("lapse-mid-streak", [(3, "due")] * 4 + [(1, "due")] + [(3, "due")] * 3),
    ("early-review", [(3, "due"), (3, "due"), (3, 0.5), (3, "due")]),
    ("late-review", [(3, "due"), (3, "due"), (3, 3.0), (2, "due")]),
    ("mixed-ratings", [(4, "due"), (2, "due"), (1, "due"), (4, "due"), (3, 2.0)]),
]


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build() -> dict:
    scheduler = Scheduler(
        desired_retention=0.9,
        learning_steps=(),
        relearning_steps=(),
        maximum_interval=MAX_INTERVAL,
        enable_fuzzing=False,
    )
    cases = []
    for index, (case_id, plan) in enumerate(CASES):
        # Explicit card_id: the default is wall-clock based, which would break determinism.
        card = Card(card_id=index + 1, due=BASE)
        last_review = BASE
        steps = []
        for rating, when in plan:
            if when == "due":
                review = card.due
            else:
                review = last_review + (card.due - last_review) * float(when)
            if review == last_review and steps:
                raise ValueError(f"{case_id}: zero-length interval")
            card, _ = scheduler.review_card(card, Rating(rating), review)
            last_review = review
            steps.append(
                {
                    "rating": rating,
                    "review": iso(review),
                    "expect": {
                        "state": int(card.state),
                        "stability": card.stability,
                        "difficulty": card.difficulty,
                        "due": iso(card.due),
                    },
                }
            )
        cases.append({"id": case_id, "card_created": iso(BASE), "steps": steps})

    return {
        "generator": {"script": "scripts/fsrs/gen_vectors.py", "py_fsrs_version": version("fsrs")},
        "parameters": list(scheduler.parameters),
        "desired_retention": scheduler.desired_retention,
        "maximum_interval": scheduler.maximum_interval,
        "learning_steps": [],
        "relearning_steps": [],
        "enable_fuzzing": scheduler.enable_fuzzing,
        "cases": cases,
    }


def render() -> str:
    return json.dumps(build(), indent=2) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render(), encoding="utf-8", newline="\n")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()

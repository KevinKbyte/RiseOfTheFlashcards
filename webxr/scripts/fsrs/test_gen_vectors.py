"""Requirement: the vendored FSRS fixture tests/fixtures/fsrs/vectors.json must be exactly what the
pinned generator (py-fsrs 6.3.2, fuzz off, no learning/relearning steps) produces, byte-for-byte,
so the UE repo can copy its header verbatim and the ts-fsrs parity test replays real reference data."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import gen_vectors  # noqa: E402


# Covers: SPIKE-FSRS
def test_regenerated_vectors_match_vendored_fixture_byte_for_byte(tmp_path: Path) -> None:
    out = tmp_path / "vectors.json"
    out.write_text(gen_vectors.render(), encoding="utf-8", newline="\n")
    assert out.read_bytes() == gen_vectors.DEFAULT_OUT.read_bytes()


# Covers: SPIKE-FSRS
def test_header_pins_py_fsrs_6_3_2_with_fuzz_off_and_no_steps() -> None:
    data = gen_vectors.build()
    assert data["generator"]["py_fsrs_version"] == "6.3.2"
    assert len(data["parameters"]) == 21
    assert data["desired_retention"] == 0.9
    assert data["maximum_interval"] == 365
    assert data["learning_steps"] == [] and data["relearning_steps"] == []
    assert data["enable_fuzzing"] is False

#!/usr/bin/env python3
"""
recolor-shift.py

Swaps the remaining hardcoded chrome colors in four components over to the
La La Land tokens. Run once, from the repo root.

    python3 scripts/recolor-shift.py

Why a script instead of four pasted files: the changes are eleven lines spread
across roughly two thousand. Retyping two thousand lines to move eleven is how
you introduce a bug nobody can find later. Every edit below is an exact string
match with an expected count, so the script either applies all of them or
touches nothing and tells you which one drifted.

WHAT THIS DOES NOT TOUCH, on purpose:
  - lib/scale.js and every --band-* value. Green and red are the Excel colors
    the daily email uses. They stay.
  - StoreTrend cellStyle(), its legend swatches, the target ReferenceLine and
    the week-total SPLH colors. That is the six step performance scale.
  - Any threshold, any ratio, any report logic.

It is safe to run twice: if the source strings are already gone it reports
"already applied" and exits without writing.
"""

import sys
from pathlib import Path

# (path, [(find, replace, expected_count), ...])
EDITS = [
    (
        "components/WeekView.js",
        [
            (
                '            background: "#1a1a2e",\n            color: "#fff",',
                '            background: "var(--ink)",\n            color: "var(--cream-300)",',
                1,
            ),
            (
                '              background: "#1a6630",\n              color: "#fff",',
                '              background: "var(--band-green)",\n              color: "#fff",',
                1,
            ),
            (
                '              background: "#ededea",\n              color: "#5f5f5c",',
                '              background: "var(--surface-3)",\n              color: "var(--text2)",',
                1,
            ),
            ('"#999994"', '"var(--text3)"', 3),
        ],
    ),
    (
        "components/StoreTrend.js",
        [
            (
                'background: "#1a1a2e", color: "#fff", padding: "10px 13px"',
                'background: "var(--ink)", color: "var(--cream-300)", padding: "10px 13px"',
                1,
            ),
            (
                'stroke="#1a1a2e" strokeWidth={2.5} dot={{ r: 4, fill: "#1a1a2e" }}',
                'stroke="#2E1F15" strokeWidth={2.5} dot={{ r: 4, fill: "#2E1F15" }}',
                1,
            ),
        ],
    ),
    (
        "components/TPLH.js",
        [
            ('                    transform: "translate(-50%, -50%)",\n', "", 1),
        ],
    ),
    (
        "components/ServiceBoard.js",
        [
            ('                transform: "translate(-50%, -50%)",\n', "", 1),
            ('background: "var(--cobalt)"', 'background: "var(--accent)"', 1),
            ("Blue band holds the middle 50%", "Shaded band holds the middle 50%", 1),
        ],
    ),
]


def main():
    root = Path.cwd()
    problems = []
    planned = []

    for rel, edits in EDITS:
        path = root / rel
        if not path.exists():
            problems.append(f"{rel}: not found. Run this from the repo root.")
            continue

        src = path.read_text(encoding="utf-8")
        out = src
        applied = 0

        for find, repl, expected in edits:
            n = out.count(find)
            if n == expected:
                out = out.replace(find, repl)
                applied += 1
            elif n == 0 and repl and out.count(repl) > 0:
                applied += 1
            elif n == 0 and not repl:
                applied += 1
            else:
                problems.append(
                    f"{rel}: expected {expected} of\n    {find!r}\n  found {n}. "
                    "The file drifted from the version this script was written against."
                )

        if applied == len(edits) and out != src:
            planned.append((path, out, rel))
        elif applied == len(edits):
            print(f"  {rel}: already applied")

    if problems:
        print("Nothing was written. Fix these first:\n", file=sys.stderr)
        for p in problems:
            print(f"  - {p}\n", file=sys.stderr)
        sys.exit(1)

    for path, out, rel in planned:
        path.write_text(out, encoding="utf-8")
        print(f"  {rel}: patched")

    if not planned:
        print("\nNo changes needed.")
    else:
        print(f"\n{len(planned)} file(s) updated.")


if __name__ == "__main__":
    main()

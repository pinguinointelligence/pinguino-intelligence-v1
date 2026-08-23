#!/usr/bin/env python3
"""
Deterministic extraction of the official Comprital catalogue's product tables.

ANALYSIS TOOL, not runtime code. It reads a manufacturer PDF the owner already
holds and emits a JSON artifact; nothing in the app imports it. Requires `pypdf`
in a local virtualenv, deliberately kept out of the project's runtime deps.

WHY POSITION-BASED. Flattening this catalogue to text interleaves the two
side-by-side table blocks, so a regex over the flat text reads a description's
"pasta 100%" as a dosage. Every value here is bound to its product by geometry
instead.

WHAT THE PDF ACTUALLY LOOKS LIKE. The tables are upright, not rotated — of 5,354
text chunks in the document, five are rotated and none carries a product code.
But the rendering does NOT preserve row alignment: a product's code (x≈42), its
name and description (x≈90) and its numeric cells (x≈266) sit on three different
baselines whose vertical order varies. For "UNICA 100" the data row sits ABOVE
its own code; for "B312" the dose is not in the dose column at all but appended
to the end of the description sentence.

So a fixed row rule would be a guess. Instead each data cluster is bound to the
NEAREST code in its own table block, and only when that nearest code wins by a
clear margin (`AMBIGUITY_MARGIN`). Anything closer than that margin to a second
candidate is left unresolved, because at that point the PDF genuinely does not
say which product the numbers belong to.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - tooling guard
    sys.exit("pypdf is required: python3 -m venv venv && venv/bin/pip install pypdf")

CODE_RE = re.compile(r"\b((?:P|B|PC|PF|PP|T)\s?\d{1,4}\s?[A-Z]?)\b")
DOSE_RE = re.compile(r"(\d{1,4}(?:[.,]\d+)?)\s*(g\s*/\s*[lL]|%)")
# The process column prints C, F, or C/F for "either".
PROCESS_RE = re.compile(r"(?<![A-Za-z/])(C\s?/\s?F|F\s?/\s?C|C|F)(?![A-Za-z])")
# The fat column prints A, V, or A/V.
FAT_RE = re.compile(r"(?<![A-Za-z/])(A\s?/\s?V|V\s?/\s?A|A|V)(?![A-Za-z])")

#: A cell belongs to a code only if the runner-up is this much further away.
AMBIGUITY_MARGIN = 1.8
#: Beyond this vertical distance a cell and a code are simply unrelated.
MAX_BINDING_DISTANCE = 40.0
#: Chunks left of this x are the left table block, right of it the right block.
BLOCK_SPLIT_X = 600.0
#: Product codes are printed in the leftmost column of their block.
CODE_COLUMN_WIDTH = 30.0


def chunks_for(page) -> list[tuple[float, float, str]]:
    out: list[tuple[float, float, str]] = []

    def visit(text, cm, tm, font_dict, font_size):  # noqa: ANN001 - pypdf callback
        if text and text.strip():
            out.append((round(tm[4], 2), round(tm[5], 2), text.strip()))

    page.extract_text(visitor_text=visit)
    return out


def normalise_code(raw: str) -> str:
    return raw.replace(" ", "").upper()


def extract_page(page, page_number: int) -> list[dict]:
    items = chunks_for(page)
    if not items:
        return []

    results: list[dict] = []
    for lo, hi in ((0.0, BLOCK_SPLIT_X), (BLOCK_SPLIT_X, 10_000.0)):
        block = [c for c in items if lo <= c[0] < hi]
        if not block:
            continue
        code_x = min(c[0] for c in block)

        # Codes: printed in the block's leftmost column, one per product.
        codes: list[tuple[float, str]] = []
        for x, y, text in block:
            if x - code_x > CODE_COLUMN_WIDTH:
                continue
            match = CODE_RE.search(text)
            if match:
                codes.append((y, normalise_code(match.group(1))))
        if not codes:
            continue

        # Data cells: chunks carrying a dose or a process flag, to the right of
        # the description column, so a sentence mentioning "100g/L" in prose is
        # not mistaken for the dose cell.
        data_min_x = code_x + 150
        for x, y, text in block:
            if x < data_min_x:
                continue
            dose = DOSE_RE.search(text)
            process = PROCESS_RE.search(text)
            if not dose and not process:
                continue

            ranked = sorted(((abs(y - cy), code) for cy, code in codes), key=lambda r: r[0])
            nearest_distance, nearest_code = ranked[0]
            if nearest_distance > MAX_BINDING_DISTANCE:
                continue
            runner_up = ranked[1][0] if len(ranked) > 1 else float("inf")
            if runner_up < nearest_distance * AMBIGUITY_MARGIN:
                # Two products are equally plausible owners of this cell. The PDF
                # does not say which; neither will this parser.
                results.append(
                    {
                        "code": nearest_code,
                        "page": page_number,
                        "binding": "ambiguous",
                        "dose": None,
                        "process": None,
                        "fat": None,
                        "cell_text": text[:80],
                    }
                )
                continue

            fat = FAT_RE.search(text)
            results.append(
                {
                    "code": nearest_code,
                    "page": page_number,
                    "binding": "unambiguous",
                    "distance": round(nearest_distance, 1),
                    "margin": round(runner_up / nearest_distance, 2) if nearest_distance else None,
                    "dose": f"{dose.group(1)}{dose.group(2)}".replace(" ", "") if dose else None,
                    "process": process.group(1).replace(" ", "") if process else None,
                    "fat": fat.group(1).replace(" ", "") if fat else None,
                    "cell_text": text[:80],
                }
            )
    return results


def main() -> None:
    pdf, out = Path(sys.argv[1]), Path(sys.argv[2])
    reader = PdfReader(str(pdf))
    facts: dict[str, dict] = {}
    ambiguous: set[str] = set()

    for number, page in enumerate(reader.pages):
        for record in extract_page(page, number):
            if record["binding"] == "ambiguous":
                ambiguous.add(record["code"])
                continue
            existing = facts.setdefault(
                record["code"],
                {"code": record["code"], "page": record["page"], "dose": None, "process": None, "fat": None,
                 "evidence": []},
            )
            for field in ("dose", "process", "fat"):
                if record[field] and existing[field] is None:
                    existing[field] = record[field]
            existing["evidence"].append(record["cell_text"])

    # A code seen ambiguously anywhere keeps whatever it proved elsewhere, but is
    # flagged so the caller can treat it with the caution it earned.
    for code in ambiguous:
        if code in facts:
            facts[code]["saw_ambiguous_cell"] = True

    out.write_text(json.dumps(facts, indent=2, ensure_ascii=False))
    print(f"codes with any bound fact: {len(facts)}")
    print(f"  dose:    {sum(1 for f in facts.values() if f['dose'])}")
    print(f"  process: {sum(1 for f in facts.values() if f['process'])}")
    print(f"  fat A/V: {sum(1 for f in facts.values() if f['fat'])}")
    print(f"codes touched by an ambiguous cell: {len(ambiguous)}")


if __name__ == "__main__":
    main()

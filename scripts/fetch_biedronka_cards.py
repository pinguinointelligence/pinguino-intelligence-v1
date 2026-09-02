#!/usr/bin/env python3
"""
Fetch and parse the Biedronka product cards already named in the import file.

ANALYSIS TOOL, not runtime code. It visits only URLs the owner's own export
already contains — no search, no crawling, no discovery. Output is a JSON
evidence file the (pure, tested) TypeScript merge layer consumes.

The site's robots.txt disallows search and query paths; those are never touched.
Requests are serialised with a delay so the shop is not hammered.

Nothing here decides truth. It records what each card literally published —
including which basis the nutrition table declared — and leaves every judgement
about identity and provenance to the merge layer.
"""
from __future__ import annotations

import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
DELAY_SECONDS = 1.5
TIMEOUT_SECONDS = 45

#: Card label -> the field the merge layer knows. The shop prints two different
#: label vocabularies ("Zawartość tłuszczów (ogólnie)" and plain "Tłuszcz"), so
#: labels are normalised before lookup rather than matched literally. Anything
#: unlisted is ignored rather than guessed at.
NUTRIENT_LABELS = {
    "wartosc energetyczna": "kcal_per_100g",
    "tluszcz": "fat_percent",
    "tluszczow": "fat_percent",
    "kwasy tluszczowe nasycone": "saturated_fat_percent",
    "weglowodany": "carbohydrate_percent",
    "weglowodanow": "carbohydrate_percent",
    "cukry": "total_sugars_percent",
    "blonnik": "fiber_percent",
    "blonnika": "fiber_percent",
    "bialko": "protein_percent",
    "bialek": "protein_percent",
    "sol": "salt_percent",
    "soli": "salt_percent",
    "poliole": "polyol_percent",
}

#: Polish letters that survive NFKD, folded so labels compare reliably.
STROKED = {"\u0142": "l", "\u0141": "l"}


def normalise_label(label: str) -> str:
    """Strip the decorations the two vocabularies differ by, then fold to ASCII."""
    import unicodedata

    text = label.lower().strip()
    text = re.sub(r"^(w tym|zawartosc|zawartość)\s+", "", text)
    text = re.sub(r"\s*\(.*?\)", "", text)
    text = re.sub(r"\s*(kcal|kj)\s*$", "", text)
    text = "".join(STROKED.get(ch, ch) for ch in text)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip()

TAGS = re.compile(r"<[^>]+>")
SPACES = re.compile(r"\s+")


def text_of(fragment: str) -> str:
    return SPACES.sub(" ", html.unescape(TAGS.sub(" ", fragment))).strip()


def parse_number(raw: str, prefer_kcal: bool = False) -> float | None:
    """
    Read '1.5 g', '44 kcal', '632 kJ / 151 kcal', '<0,5 g'.

    A '<' bound is not a measurement, so it is refused rather than rounded down.
    When a cell carries both energy units the kcal figure is taken explicitly —
    reading the first number would silently record kilojoules as kilocalories.
    """
    cleaned = raw.strip().lower()
    if cleaned.startswith("<") or cleaned.startswith("&lt;"):
        return None
    if prefer_kcal and "kcal" in cleaned:
        match = re.search(r"(-?\d+(?:[.,]\d+)?)\s*kcal", cleaned)
        if match:
            return float(match.group(1).replace(",", "."))
    match = re.search(r"(-?\d+(?:[.,]\d+)?)", cleaned)
    return float(match.group(1).replace(",", ".")) if match else None


def parse_card(body: str) -> dict:
    card: dict = {
        "title": None,
        "heading": None,
        "basis": None,
        "nutrition": {},
        "ingredients": None,
        "allergens": None,
        "legalName": None,
    }

    title = re.search(r"<title>(.*?)</title>", body, re.S)
    if title:
        card["title"] = text_of(title.group(1))
    heading = re.search(r"<h1[^>]*>(.*?)</h1>", body, re.S)
    if heading:
        card["heading"] = text_of(heading.group(1))

    table = re.search(r"(product-description__table.{0,6000}?</table>)", body, re.S)
    if table:
        block = table.group(1)
        headers = [text_of(h) for h in re.findall(r"<th>(.*?)</th>", block, re.S)]
        # The basis is printed in the table's own header — never assumed.
        for header in headers:
            if re.match(r"^w\s*100\s*(g|ml)$", header.strip(), re.I):
                card["basis"] = "per_100g" if header.strip().lower().endswith("g") else "per_100ml"
        for label_raw, value_raw in re.findall(
            r"<tr>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*</tr>", block, re.S
        ):
            label = normalise_label(text_of(label_raw))
            field = NUTRIENT_LABELS.get(label)
            if not field:
                card.setdefault("unmappedLabels", []).append(label)
                continue
            value = parse_number(text_of(value_raw), prefer_kcal=field == "kcal_per_100g")
            if value is not None:
                card["nutrition"][field] = value

    ingredients = re.search(r"Składniki:\s*(.{0,1200}?)(?:Pozostałe informacje|</)", body, re.S)
    if ingredients:
        card["ingredients"] = text_of(ingredients.group(1))[:1000] or None
    legal = re.search(r"Nazwa wymagana prawnie:\s*(.{0,300}?)(?:<|Pozostałe)", body, re.S)
    if legal:
        card["legalName"] = text_of(legal.group(1))[:200] or None
    allergens = re.search(r"Alergeny:\s*(.{0,400}?)(?:<|Pozostałe)", body, re.S)
    if allergens:
        card["allergens"] = text_of(allergens.group(1))[:300] or None
    return card


def fetch(url: str) -> tuple[int, str | None, str | None]:
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "pl-PL,pl"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.status, response.read().decode("utf-8", errors="ignore"), None
    except urllib.error.HTTPError as error:
        return error.code, None, f"http {error.code}"
    except Exception as error:  # noqa: BLE001 - network failures are data here
        return 0, None, str(error)[:200]


def main() -> None:
    targets = json.loads(Path(sys.argv[1]).read_text())
    out_path = Path(sys.argv[2])
    results: list[dict] = []

    for index, target in enumerate(targets, start=1):
        status, body, error = fetch(target["url"])
        record = {
            "productId": target["productId"],
            "url": target["url"],
            "httpStatus": status,
            "error": error,
            "card": parse_card(body) if body else None,
        }
        results.append(record)
        if index % 25 == 0 or index == len(targets):
            print(f"{index}/{len(targets)} fetched", flush=True)
            out_path.write_text(json.dumps(results, indent=1, ensure_ascii=False))
        time.sleep(DELAY_SECONDS)

    out_path.write_text(json.dumps(results, indent=1, ensure_ascii=False))
    ok = sum(1 for r in results if r["httpStatus"] == 200)
    with_nutrition = sum(1 for r in results if r["card"] and r["card"]["nutrition"])
    print(f"done: {len(results)} urls, {ok} fetched, {with_nutrition} with a nutrition table")


if __name__ == "__main__":
    main()

"""cardmarket trend prices, matched to our printings.

cardmarket's public files don't say if a product is base or parallel (3 € vs
600 €), or if an expansion is the EN or JP one. so it's two steps:

1. expansion -> (language, pack) comes from cardmarket_expansions.csv, which i
   checked by hand. guessing the language from dates went wrong before.
2. inside one expansion + card number, our printings (base, p1, p2 ...) get
   matched to their products in the order cardmarket listed them. if anything
   doesn't add up the whole group is skipped, no price is better than a wrong one.

checked against 7,813 pairs from my old app, 99.7% agree.
"""

import csv
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from itertools import pairwise
from pathlib import Path

import httpx2
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from api.db import engine
from api.models import Card, PricePoint, Printing

_BASE = "https://downloads.s3.cardmarket.com/productCatalog"
GAME = 18  # one piece, not documented anywhere, found it in categoryName
PRODUCTS_URL = f"{_BASE}/productList/products_singles_{GAME}.json"
PRICES_URL = f"{_BASE}/priceGuide/price_guide_{GAME}.json"
EXPANSIONS_CSV = Path(__file__).with_name("cardmarket_expansions.csv")

# "Nami (OP01-016)", "Uta ( ST11-001)", the number is the only thing to match on
_CARD_NUMBER = re.compile(r"\(\s*([A-Z0-9]+-\d+)\s*\)")
# cheapest first, a parallel is never worth less than its base
_VARIANT_RANK = {"base": 0, "parallel": 1, "reprint": 2, "treasure_rare": 3}
_ORDINAL = re.compile(r"_[pr](\d+)$")


@dataclass(frozen=True)
class Product:
    id: int
    expansion: int
    card_number: str | None
    listed_at: str  # "2023-02-10 14:08:17", sorts as text
    trend_cents: int | None


@dataclass(frozen=True)
class OurPrinting:
    source_ref: str  # "english:569101:OP01-016_p1"
    card_number: str
    variant: str

    @property
    def order(self) -> tuple[int, int]:
        ordinal = _ORDINAL.search(self.source_ref)
        return _VARIANT_RANK[self.variant], int(ordinal.group(1)) if ordinal else 0


def to_cents(euros: float | None) -> int | None:
    # via str, Decimal(2.43) would be 2.4300000000000001598...
    # cardmarket writes 0 or null when there's no price
    return round(Decimal(str(euros)) * 100) if euros else None


def parse(products_json: dict, prices_json: dict) -> list[Product]:
    trend = {p["idProduct"]: p.get("trend") for p in prices_json["priceGuides"]}
    result = []
    for p in products_json["products"]:
        number = _CARD_NUMBER.search(p["name"])
        result.append(
            Product(
                id=p["idProduct"],
                expansion=p["idExpansion"],
                card_number=number.group(1) if number else None,
                listed_at=p["dateAdded"],
                trend_cents=to_cents(trend.get(p["idProduct"])),
            )
        )
    return result


def load_expansions(path: Path = EXPANSIONS_CSV) -> dict[int, tuple[str, str]]:
    with path.open(encoding="utf-8") as f:
        return {
            int(row["id_expansion"]): (row["locale"], row["pack_id"])
            for row in csv.DictReader(f)
        }


def _prices_contradict(theirs: list[Product], ours: list[OurPrinting]) -> bool:
    # a parallel cheaper than its base means the order is wrong
    known = [(p.trend_cents, o.order[0]) for p, o in zip(theirs, ours) if p.trend_cents]
    return any(
        price > next_price and rank < next_rank
        for (price, rank), (next_price, next_rank) in pairwise(known)
    )


def pair(
    products: list[Product],
    printings: list[OurPrinting],
    expansions: dict[int, tuple[str, str]],
) -> tuple[dict[int, str], Counter]:
    # cardmarket product id -> our source_ref for every group we trust,
    # plus how many products got skipped and why
    ours = defaultdict(list)
    for printing in printings:
        locale, pack, _ = printing.source_ref.split(":")
        ours[(locale, pack, printing.card_number)].append(printing)

    buckets = defaultdict(list)
    skipped = Counter()
    for product in products:
        if product.card_number is None:
            skipped["no card number"] += 1
        elif product.expansion not in expansions:
            skipped["unknown expansion"] += 1
        else:
            locale, pack = expansions[product.expansion]
            buckets[(locale, pack, product.card_number)].append(product)

    matched = {}
    for key, theirs in buckets.items():
        mine = sorted(ours.get(key, []), key=lambda p: p.order)
        theirs.sort(key=lambda p: (p.listed_at, p.id))
        if not mine:
            reason = "no such printing"
        elif len(mine) != len(theirs):
            reason = "count differs"
        elif len({p.listed_at for p in theirs}) != len(theirs):
            reason = "listed in the same second"
        elif _prices_contradict(theirs, mine):
            reason = "prices contradict the order"
        else:
            matched.update({p.id: o.source_ref for p, o in zip(theirs, mine)})
            continue
        skipped[reason] += len(theirs)
    return matched, skipped


def suggest_expansions(
    products: list[Product],
    printings: list[OurPrinting],
    expansions: dict[int, tuple[str, str]],
    listed_since: str,
) -> list[str]:
    # for new expansions we don't know yet: which packs their card numbers fit.
    # older unknown ones are reprints and promos we skip on purpose
    pack_numbers = defaultdict(set)
    for printing in printings:
        locale, pack, _ = printing.source_ref.split(":")
        pack_numbers[(locale, pack)].add(printing.card_number)

    unknown = defaultdict(list)
    for product in products:
        if product.expansion not in expansions and product.card_number:
            unknown[product.expansion].append(product)

    hints = []
    for expansion, items in sorted(unknown.items()):
        first = min(p.listed_at for p in items)
        numbers = {p.card_number for p in items}
        fits = sorted(
            f"{locale}:{pack}"
            for (locale, pack), known in pack_numbers.items()
            if len(numbers & known) >= 0.9 * len(numbers)
        )
        if first >= listed_since and len(items) >= 5 and fits:
            hints.append(
                f"expansion {expansion}: {len(items)} products, first listed "
                f"{first[:10]}, fits {' or '.join(fits)}"
            )
    return hints


def import_prices(session: Session, products: list[Product], today: date) -> dict:
    rows = session.execute(
        select(
            Printing.id, Printing.source_ref, Card.card_number, Printing.variant
        ).join(Card, Card.id == Printing.card_id)
    ).all()
    printings = [OurPrinting(ref, number, variant) for _, ref, number, variant in rows]
    id_by_ref = {ref: printing_id for printing_id, ref, _, _ in rows}
    expansions = load_expansions()

    matched, skipped = pair(products, printings, expansions)
    by_id = {p.id: p for p in products}

    # clear first, otherwise a product that moved to another printing since the
    # last run hits the unique constraint halfway through
    session.execute(update(Printing).values(cardmarket_id=None))
    if matched:
        session.execute(
            update(Printing),
            [
                {"id": id_by_ref[ref], "cardmarket_id": pid}
                for pid, ref in matched.items()
            ],
        )

    points = [
        {
            "printing_id": id_by_ref[ref],
            "day": today,
            "trend_cents": by_id[pid].trend_cents,
        }
        for pid, ref in matched.items()
        if by_id[pid].trend_cents
    ]
    if points:
        stmt = insert(PricePoint).values(points)
        # running it twice a day just updates the price
        session.execute(
            stmt.on_conflict_do_update(
                index_elements=[PricePoint.printing_id, PricePoint.day],
                set_={"trend_cents": stmt.excluded.trend_cents},
            )
        )
    return {
        "printings_matched": len(matched),
        "prices_stored": len(points),
        "skipped": dict(skipped),
        "suggestions": suggest_expansions(
            products, printings, expansions, str(today - timedelta(days=120))
        ),
    }


def run() -> None:
    headers = {"User-Agent": "logpose (self-hosted card collection tracker)"}
    with httpx2.Client(headers=headers, timeout=60) as client:
        products_json = client.get(PRODUCTS_URL).raise_for_status().json()
        prices_json = client.get(PRICES_URL).raise_for_status().json()

    with Session(engine) as session:
        summary = import_prices(
            session, parse(products_json, prices_json), date.today()
        )
        session.commit()

    print(
        f"matched {summary['printings_matched']} printings, "
        f"stored {summary['prices_stored']} prices for {date.today()}"
    )
    for reason, count in sorted(summary["skipped"].items()):
        print(f"  skipped {count:>5} products: {reason}")
    for hint in summary["suggestions"]:
        print(f"  add to cardmarket_expansions.csv? {hint}")

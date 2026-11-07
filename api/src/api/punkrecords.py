import re


def set_code(raw_title: str, pack_id: str) -> str:
    match = re.search(r"[\[【]([^\]】]+)[\]】]", raw_title)

    if match:
        return match.group(1)

    return f"PACK-{pack_id}"


def parse_card_id(card_id: str) -> tuple[str, str]:
    nr, _, suffix = card_id.partition("_")

    match suffix[:1]:
        case "p":
            variant = "parallel"
        case "r":
            variant = "reprint"
        case _:
            variant = "base"

    return (nr, variant)

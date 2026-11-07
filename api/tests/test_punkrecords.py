from api.punkrecords import parse_card_id, set_code


def test_set_code_en():
    title = "STARTER DECK -Straw Hat Crew- [ST-01]"
    pack_id = "569001"
    expected = "ST-01"
    actual = set_code(title, pack_id)
    assert actual == expected


def test_set_code_jp():
    title = "スタートデッキ 麦わらの一味【ST-01】"
    pack_id = "569001"
    expected = "ST-01"
    actual = set_code(title, pack_id)
    assert actual == expected


def test_set_code_promo():
    title = "Promotion card"
    pack_id = "550001"
    expected = "PACK-550001"
    actual = set_code(title, pack_id)
    assert actual == expected


def test_parse_card_id_base():
    card_id = "OP01-016"
    expected = ("OP01-016", "base")
    actual = parse_card_id(card_id)
    assert expected == actual


def test_parse_card_id_parallel():
    card_id = "OP01-016_p2"
    expected = ("OP01-016", "parallel")
    actual = parse_card_id(card_id)
    assert expected == actual


def test_parse_card_id_reprint():
    card_id = "OP01-016_r1"
    expected = ("OP01-016", "reprint")
    actual = parse_card_id(card_id)
    assert expected == actual

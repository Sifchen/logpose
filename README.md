# Logpose

collection tracker for the One Piece TCG. keeps track of what cards i have,
where they are and what i paid, and shows what they're worth on Cardmarket.

it's a rewrite of an older app i built for myself, this time with tests and CI
from the start.

## features

- all EN and JP printings (9,805), imported from [punk-records](https://github.com/buhbbl/punk-records)
- login with server-side sessions
- collection as a card grid or a table, with filters
- add cards by typing a set or a name and clicking through the cards
- daily Cardmarket trend prices for about 80% of printings, value over time,
  links to the Cardmarket product page

## stack

| | |
|---|---|
| API | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Postgres 16 |
| Web | React 19, TypeScript, Vite, TanStack Query, Tailwind CSS |
| Checks | pytest against a real Postgres, Vitest, Ruff, Oxlint, GitHub Actions |

## try it

you only need Docker.

```sh
docker compose up --build -d
docker compose logs -f app      # first start loads cards and prices, takes about a minute
```

when the log says `Uvicorn running`, hit Ctrl+C and make a login:

```sh
docker compose exec app logpose create-user you@example.com   # asks for a password
```

then open http://localhost:8000. every start runs the migrations and only loads
cards or prices if they're missing, so later starts are quick.

## develop

needs Docker, [uv](https://docs.astral.sh/uv/), Node 24 and `make`.

```sh
make db                                        # just postgres, in docker
make migrate
make import                                    # all cards, ~30 s
make prices                                    # today's cardmarket prices, ~5 s
cd api && uv run logpose create-user you@example.com && cd ..
make api                                       # api on :8000
make web                                       # second terminal, ui on :5173
```

### tests

tests run against a real postgres, not sqlite or mocks. create the test db once:

```sh
docker compose exec db createdb -U logpose logpose_test
make test
make lint
```

CI runs the same `make lint`, `make test` and `make build` on every PR and
builds the docker image.

## layout

```
api/src/api/
  main.py         app + routers
  models.py       all tables
  auth.py         passwords, sessions, login/logout/me
  catalog.py      sets, printing search, prices (same for every user)
  collection.py   your locations, lots and value history
  images.py       card images (downloaded once, then served from here)
  punkrecords.py  card import
  cardmarket.py   price import, matches cardmarket products to printings
  cli.py          logpose import-cards | import-prices | create-user | setup
api/alembic/      migrations
api/tests/        each test runs in a transaction that gets rolled back
web/src/          react app, api.ts is the only file that talks to the server
```

## some decisions

- **no price is better than a wrong one.** cardmarket's public files don't say
  if a product is base or parallel (2 € vs 2,000 €) or english or japanese.
  the language per expansion comes from a small table i checked by hand
  (`cardmarket_expansions.csv`). inside an expansion the variants get matched
  by the order cardmarket listed them, and a whole group gets skipped if
  anything doesn't add up. checked against 7,813 pairs from my old app, 99.7%
  agree. the other ~20% just show no price.
- **prices are kept per day** (`price_points`), you can't download old prices
  later. that's what the value line on the home page uses.
- **lots, not a counter.** "3 copies of OP01-016, bought on 2026-03-02 for
  2.50 € each". how many you own is the sum of your lots.
- **money is integer cents**, floats can't do 0.29 exactly.
- **sessions in the db, not JWT.** the cookie has a random token, the db only
  stores its sha256. logout deletes the row so a copied cookie stops working.
  cookie is `HttpOnly` and `SameSite=Lax`, passwords use argon2id.
- **someone else's lot is a 404**, not a 403, so you can't even tell it exists.
- **postgres checks it too.** quantity > 0, valid condition, no negative price,
  as check constraints, so a bug in the api can't store a bad row.
- **the card import is pinned** to a fixed punk-records commit and can run
  twice without changing anything.

## not done yet

- no rate limit on login, fine for a few users but needed before it's public
- ~20% of printings have no price, mostly reprints and promos the matching skips
- prices refresh on container start or with `make prices`, no daily job yet
- every account has its own collection, no shared collections yet

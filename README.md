# Logpose

collection tracker for the One Piece TCG. keeps track of what cards i have,
where they are and what i paid.

it's a rewrite of an older app i built for myself, this time with tests and CI
from the start.

## features

- all EN and JP printings (9,805), imported from [punk-records](https://github.com/buhbbl/punk-records)
- login with server-side sessions
- collection: add cards by name or number, with quantity, condition, price paid
  and location. filter, edit, delete
- next up: cardmarket prices

## stack

| | |
|---|---|
| API | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Postgres 16 |
| Web | React 19, TypeScript, Vite, TanStack Query, Tailwind CSS |
| Checks | pytest against a real Postgres, Ruff, Oxlint, GitHub Actions |

## run it

needs Docker, [uv](https://docs.astral.sh/uv/), Node 24 and `make`.

```sh
make db                                        # just postgres, in docker
make migrate
make import                                    # all cards, ~30 s
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

## layout

```
api/src/api/
  main.py         app + routers
  models.py       all tables
  auth.py         passwords, sessions, login/logout/me
  catalog.py      sets and printing search (same for every user)
  collection.py   your locations and lots
  punkrecords.py  card import
  cli.py          logpose import-cards | create-user
api/alembic/      migrations
api/tests/        each test runs in a transaction that gets rolled back
web/src/          react app, api.ts is the only file that talks to the server
```

## some decisions

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
- card images are linked straight from bandai's site
- every account has its own collection, no shared collections yet

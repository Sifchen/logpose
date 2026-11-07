# `uv run logpose <command>`, admin stuff that has no ui on purpose

import argparse
import getpass
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from api import cardmarket, punkrecords
from api.auth import hash_password, normalize_email
from api.db import engine
from api.models import User


def create_user(email: str) -> None:
    email = normalize_email(email)
    password = getpass.getpass("Password: ")
    if len(password) < 8:
        sys.exit("Password must be at least 8 characters.")
    if password != getpass.getpass("Repeat: "):
        sys.exit("Passwords do not match.")

    with Session(engine) as session:
        if session.scalars(select(User).where(User.email == email)).first():
            sys.exit(f"{email} already exists.")
        session.add(User(email=email, password_hash=hash_password(password)))
        session.commit()
    print(f"Created {email}.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="logpose")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("import-cards", help="import sets and cards from punk-records")
    commands.add_parser(
        "import-prices", help="match and store today's Cardmarket prices"
    )
    new_user = commands.add_parser("create-user", help="create a login")
    new_user.add_argument("email")

    args = parser.parse_args()
    if args.command == "import-cards":
        punkrecords.run()
    elif args.command == "import-prices":
        cardmarket.run()
    elif args.command == "create-user":
        create_user(args.email)


if __name__ == "__main__":
    main()

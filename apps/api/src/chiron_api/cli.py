from __future__ import annotations

import argparse
import getpass
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from chiron_api.auth.passwords import hash_password
from chiron_api.db.models import User, UserProfile, UserRole, UserStatus
from chiron_api.db.session import SessionLocal

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 256


@dataclass(frozen=True)
class AdminBootstrapResult:
    action: Literal["created", "promoted", "unchanged"]
    email: str


def normalize_email(email: str) -> str:
    return email.strip().lower()


def find_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def create_or_promote_admin(
    db: Session,
    *,
    email: str,
    password: str | None,
    first_name: str = "Admin",
    last_name: str = "MAKA",
) -> AdminBootstrapResult:
    normalized_email = normalize_email(email)
    if len(normalized_email) < 3 or len(normalized_email) > 320:
        raise ValueError("Email non valida.")

    user = find_user_by_email(db, normalized_email)
    if user is None:
        if password is None:
            raise ValueError("La password e obbligatoria per un nuovo amministratore.")
        if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
            raise ValueError(
                f"La password deve contenere tra {MIN_PASSWORD_LENGTH} e "
                f"{MAX_PASSWORD_LENGTH} caratteri.",
            )
        user = User(
            email=normalized_email,
            password_hash=hash_password(password),
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
        )
        user.profile = UserProfile(
            first_name=first_name.strip() or "Admin",
            last_name=last_name.strip() or "MAKA",
        )
        db.add(user)
        action: Literal["created", "promoted", "unchanged"] = "created"
    else:
        changed = user.role != UserRole.ADMIN or user.status != UserStatus.ACTIVE
        user.role = UserRole.ADMIN
        user.status = UserStatus.ACTIVE
        user.deleted_at = None
        if user.profile is None:
            user.profile = UserProfile(
                first_name=first_name.strip() or "Admin",
                last_name=last_name.strip() or "MAKA",
            )
            changed = True
        db.add(user)
        action = "promoted" if changed else "unchanged"

    db.commit()
    return AdminBootstrapResult(action=action, email=user.email)


def prompt_password() -> str:
    password = getpass.getpass("Password iniziale: ")
    confirmation = getpass.getpass("Ripeti password: ")
    if password != confirmation:
        raise ValueError("Le password non coincidono.")
    return password


def run_create_admin(args: argparse.Namespace) -> int:
    email = normalize_email(args.email or input("Email amministratore: "))
    with SessionLocal() as db:
        existing_user = find_user_by_email(db, email)
        needs_profile = existing_user is None or existing_user.profile is None
        first_name = args.first_name
        last_name = args.last_name
        if needs_profile:
            first_name = first_name or input("Nome [Admin]: ").strip() or "Admin"
            last_name = last_name or input("Cognome [MAKA]: ").strip() or "MAKA"
        password = prompt_password() if existing_user is None else None
        result = create_or_promote_admin(
            db,
            email=email,
            password=password,
            first_name=first_name or "Admin",
            last_name=last_name or "MAKA",
        )

    messages = {
        "created": "Amministratore creato. Il setup 2FA verra richiesto al primo login.",
        "promoted": "Account promosso ad amministratore e riattivato.",
        "unchanged": "L'account e gia un amministratore attivo: nessuna modifica.",
    }
    print(f"{messages[result.action]} Email: {result.email}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="maka", description="Comandi operativi MAKA")
    subparsers = parser.add_subparsers(dest="command", required=True)
    create_admin_parser = subparsers.add_parser(
        "create-admin",
        help="Crea o promuove un amministratore in modo idempotente",
    )
    create_admin_parser.add_argument("--email")
    create_admin_parser.add_argument("--first-name")
    create_admin_parser.add_argument("--last-name")
    create_admin_parser.set_defaults(handler=run_create_admin)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.handler(args)
    except ValueError as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    raise SystemExit(main())

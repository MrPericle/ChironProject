import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

DIGITS = 6
PERIOD_SECONDS = 30


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _decode_secret(secret: str) -> bytes:
    padding = "=" * ((8 - len(secret) % 8) % 8)
    return base64.b32decode(secret.upper() + padding)


def generate_totp_code(secret: str, *, for_time: int | None = None) -> str:
    timestamp = int(time.time()) if for_time is None else for_time
    counter = timestamp // PERIOD_SECONDS
    digest = hmac.new(_decode_secret(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code_int = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code_int % (10**DIGITS)).zfill(DIGITS)


def verify_totp_code(secret: str, code: str, *, valid_window: int = 1) -> bool:
    if not code.isdigit() or len(code) != DIGITS:
        return False

    now = int(time.time())
    for window_offset in range(-valid_window, valid_window + 1):
        candidate_time = now + (window_offset * PERIOD_SECONDS)
        if hmac.compare_digest(generate_totp_code(secret, for_time=candidate_time), code):
            return True

    return False


def build_otpauth_uri(secret: str, *, account_name: str, issuer: str = "Chiron Project") -> str:
    label = f"{issuer}:{account_name}"
    return (
        f"otpauth://totp/{quote(label)}"
        f"?secret={secret}&issuer={quote(issuer)}&algorithm=SHA1&digits={DIGITS}&period={PERIOD_SECONDS}"
    )


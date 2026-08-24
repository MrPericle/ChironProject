import base64
import hashlib

from cryptography.fernet import Fernet


def _fernet(secret_key: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(secret_key.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_secret(secret: str, secret_key: str) -> str:
    return _fernet(secret_key).encrypt(secret.encode("utf-8")).decode("ascii")


def decrypt_secret(encrypted_secret: str, secret_key: str) -> str:
    return _fernet(secret_key).decrypt(encrypted_secret.encode("ascii")).decode("utf-8")


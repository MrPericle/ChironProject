import hashlib
import math
import time
from collections import defaultdict, deque
from threading import Lock


class AuthRateLimiter:
    """Process-local sliding-window limiter for sensitive authentication attempts."""

    def __init__(self, *, max_attempts: int, window_seconds: int) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def retry_after(self, key: str) -> int | None:
        with self._lock:
            attempts = self._active_attempts(key)
            if len(attempts) < self.max_attempts:
                return None
            return max(1, math.ceil(self.window_seconds - (time.monotonic() - attempts[0])))

    def record_failure(self, key: str) -> int | None:
        with self._lock:
            attempts = self._active_attempts(key)
            self._attempts[key] = attempts
            attempts.append(time.monotonic())
            if len(attempts) < self.max_attempts:
                return None
            return max(1, math.ceil(self.window_seconds - (time.monotonic() - attempts[0])))

    def reset(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)

    def _active_attempts(self, key: str) -> deque[float]:
        now = time.monotonic()
        attempts = self._attempts.get(key, deque())
        while attempts and now - attempts[0] >= self.window_seconds:
            attempts.popleft()
        if not attempts:
            self._attempts.pop(key, None)
        return attempts


def auth_rate_limit_key(scope: str, identity: str, client_host: str | None) -> str:
    fingerprint = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]
    return f"{scope}:{client_host or 'unknown'}:{fingerprint}"

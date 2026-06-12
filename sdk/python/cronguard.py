"""
CronGuard SDK — Python

pip install requests  (seule dépendance)

Usage :
    from cronguard import monitor, CronGuard

    # Décorateur (le plus simple)
    @monitor('ma-ping-key')
    def my_job():
        records = sync_database()
        return {'records': records}

    my_job()

    # Context manager
    with CronGuard('ma-ping-key') as cg:
        records = sync_database()
        cg.set_records(records)

    # Manuel
    cg = CronGuard('ma-ping-key')
    cg.success(records=1500, duration_ms=4200)
    cg.fail(exit_code=1, output=str(e))
"""

import time
import traceback
import functools
import os
from typing import Optional, Callable, Any
import requests

CRONGUARD_URL = os.environ.get('CRONGUARD_URL', 'https://api.cronguard.io')
TIMEOUT_S = 5


class CronGuard:
    def __init__(self, ping_key: str, base_url: str = CRONGUARD_URL):
        self.ping_key  = ping_key
        self.base_url  = base_url.rstrip('/')
        self._records  = None
        self._start    = None

    # ── API directe ───────────────────────────────────────────────────────────

    def success(self, records: Optional[int] = None, duration_ms: Optional[int] = None):
        self._ping({'status': 'success', 'records': records, 'duration_ms': duration_ms})

    def fail(self, exit_code: int = 1, output: str = '', duration_ms: Optional[int] = None):
        self._ping({
            'status':      'fail',
            'exit_code':   exit_code,
            'output':      output[:3000],
            'duration_ms': duration_ms,
        })

    def set_records(self, count: int):
        """Utilisé dans le context manager pour transmettre le nb de records."""
        self._records = count

    # ── Context manager ───────────────────────────────────────────────────────

    def __enter__(self):
        self._start = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = int((time.time() - self._start) * 1000) if self._start else None

        if exc_type is None:
            self.success(records=self._records, duration_ms=duration_ms)
        else:
            self.fail(
                exit_code=1,
                output=f"{exc_type.__name__}: {exc_val}\n{''.join(traceback.format_tb(exc_tb))}",
                duration_ms=duration_ms,
            )
        return False  # Ne supprime pas l'exception

    # ── Interne ───────────────────────────────────────────────────────────────

    def _ping(self, payload: dict):
        # Nettoie les None pour ne pas polluer le payload
        body = {k: v for k, v in payload.items() if v is not None}
        try:
            requests.post(
                f"{self.base_url}/ping/{self.ping_key}",
                json=body,
                timeout=TIMEOUT_S,
            )
        except Exception:
            pass  # Ne jamais crasher à cause du monitoring


# ── Décorateur ────────────────────────────────────────────────────────────────

def monitor(ping_key: str, base_url: str = CRONGUARD_URL):
    """
    Décorateur qui wrappe automatiquement une fonction avec le monitoring.

    @monitor('ma-ping-key')
    def my_job():
        ...
        return {'records': 1500}   # 'records' est extrait automatiquement
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs) -> Any:
            start = time.time()
            try:
                result = fn(*args, **kwargs)
                duration_ms = int((time.time() - start) * 1000)
                records = None
                if isinstance(result, dict):
                    records = result.get('records') or result.get('count')
                CronGuard(ping_key, base_url).success(
                    records=records, duration_ms=duration_ms
                )
                return result
            except Exception as e:
                duration_ms = int((time.time() - start) * 1000)
                CronGuard(ping_key, base_url).fail(
                    exit_code=1,
                    output=traceback.format_exc(),
                    duration_ms=duration_ms,
                )
                raise
        return wrapper
    return decorator

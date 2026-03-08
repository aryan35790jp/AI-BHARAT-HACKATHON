from __future__ import annotations

import functools
import logging
import random
import time
from typing import Callable, TypeVar

from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable)

_RETRYABLE_CODES = {
    "ProvisionedThroughputExceededException",
    "ThrottlingException",
    "RequestLimitExceeded",
    "InternalServerError",
    "ServiceUnavailable",
    "ModelTimeoutException",
    "ThrottlingException",
    "ModelNotReadyException",
}


def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 8.0,
    jitter: bool = True,
) -> Callable[[F], F]:
    """Exponential-backoff retry decorator for AWS service calls.

    Retries on known transient AWS error codes. Non-retryable errors are
    re-raised immediately.
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exc: Exception | None = None

            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except ClientError as exc:
                    error_code = exc.response.get("Error", {}).get("Code", "")
                    if error_code not in _RETRYABLE_CODES:
                        raise

                    last_exc = exc
                    if attempt >= max_retries:
                        break

                    delay = min(base_delay * (2 ** attempt), max_delay)
                    if jitter:
                        delay = delay * (0.5 + random.random())

                    logger.warning(
                        "Retryable error '%s' from %s (attempt %d/%d). "
                        "Sleeping %.2fs.",
                        error_code,
                        func.__name__,
                        attempt + 1,
                        max_retries,
                        delay,
                    )
                    time.sleep(delay)

                except Exception as exc:
                    last_exc = exc
                    if attempt >= max_retries:
                        break

                    delay = min(base_delay * (2 ** attempt), max_delay)
                    if jitter:
                        delay = delay * (0.5 + random.random())

                    logger.warning(
                        "Unexpected error from %s (attempt %d/%d): %s. "
                        "Sleeping %.2fs.",
                        func.__name__,
                        attempt + 1,
                        max_retries,
                        exc,
                        delay,
                    )
                    time.sleep(delay)

            logger.error(
                "All %d retries exhausted for %s. Last error: %s",
                max_retries,
                func.__name__,
                last_exc,
            )
            raise last_exc  # type: ignore[misc]

        return wrapper  # type: ignore[return-value]

    return decorator

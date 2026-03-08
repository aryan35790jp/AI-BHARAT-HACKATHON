"""
CORS middleware.

Architecture Decision:
  CORS headers are set on EVERY response (success and error).
  Preflight OPTIONS requests are handled here, not in the router.
  In dev: Access-Control-Allow-Origin = * (any origin)
  In prod: Restrict to your actual frontend domain.
"""

from config.settings import Settings


def get_cors_headers(settings: Settings) -> dict:
    """Build CORS headers from settings."""
    return {
        "Access-Control-Allow-Origin": settings.allowed_origins,
        "Access-Control-Allow-Headers": settings.allowed_headers,
        "Access-Control-Allow-Methods": settings.allowed_methods,
        "Content-Type": "application/json",
    }


def handle_cors_preflight(settings: Settings) -> dict:
    """Handle OPTIONS preflight request."""
    return {
        "statusCode": 200,
        "headers": get_cors_headers(settings),
        "body": '{"message": "CORS preflight OK"}',
    }

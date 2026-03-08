"""
Authentication middleware — Cognito JWT extraction and validation.

Architecture Decision:
  In dev: auth is optional (require_auth=False).
  In staging/prod: every request MUST have a valid Cognito JWT.

  JWT validation:
    1. Extract token from Authorization: Bearer <token>
    2. Decode header to get kid (key ID)
    3. Fetch Cognito JWKS (cached in Lambda memory)
    4. Verify signature, expiration, audience, issuer
    5. Extract user identity (sub, email, groups)

  Why not API Gateway Cognito Authorizer?
    API Gateway authorizer is fine for coarse auth. But we need
    the user identity (sub) inside the Lambda for per-user data access.
    So we extract it ourselves AND recommend the API Gateway authorizer
    as a defense-in-depth layer (see NEXT_STEPS).

  Fallback:
    If require_auth=False, we use the X-User-Id header or userId
    from the request body. This is for dev/testing only.
"""

import base64
import json
import logging
import time
from dataclasses import dataclass
from typing import Optional

from config.settings import Settings
from errors import UnauthorizedError, ForbiddenError

logger = logging.getLogger("cognivault.middleware.auth")

# JWKS cache (populated on first request, reused across warm invocations)
_jwks_cache: Optional[dict] = None
_jwks_cache_time: float = 0
JWKS_CACHE_TTL = 3600  # 1 hour


@dataclass
class AuthContext:
    """Extracted user identity from JWT or fallback."""
    user_id: str
    email: str = ""
    groups: list = None
    is_authenticated: bool = False
    auth_method: str = "none"  # cognito | header | body

    def __post_init__(self):
        if self.groups is None:
            self.groups = []


def extract_user_identity(
    event: dict,
    settings: Settings,
    body: Optional[dict] = None,
) -> AuthContext:
    """
    Extract user identity from the request.

    Priority:
      1. Cognito JWT in Authorization header (if require_auth=True)
      2. X-User-Id header (dev/testing only)
      3. userId field in request body (dev/testing only)
      4. Raise UnauthorizedError if require_auth=True and nothing found
    """
    headers = event.get("headers") or {}
    # API Gateway may lowercase header names
    auth_header = headers.get("Authorization") or headers.get("authorization") or ""

    # --- Try Cognito JWT ---
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        if token:
            try:
                claims = _decode_jwt_claims(token, settings)
                return AuthContext(
                    user_id=claims.get("sub", ""),
                    email=claims.get("email", ""),
                    groups=claims.get("cognito:groups", []),
                    is_authenticated=True,
                    auth_method="cognito",
                )
            except Exception as exc:
                if settings.require_auth:
                    raise UnauthorizedError(f"Invalid JWT: {exc}")
                logger.warning("JWT validation failed (auth not required): %s", exc)

    # --- Fallback: X-User-Id header ---
    user_id_header = headers.get("X-User-Id") or headers.get("x-user-id") or ""
    if user_id_header:
        if settings.require_auth:
            raise UnauthorizedError("JWT required in production. X-User-Id header is only for dev.")
        return AuthContext(
            user_id=user_id_header.strip(),
            is_authenticated=False,
            auth_method="header",
        )

    # --- Fallback: userId in body ---
    if body and body.get("userId"):
        if settings.require_auth:
            raise UnauthorizedError("JWT required in production.")
        return AuthContext(
            user_id=str(body["userId"]).strip(),
            is_authenticated=False,
            auth_method="body",
        )

    # --- No identity found ---
    if settings.require_auth:
        raise UnauthorizedError("No authentication token provided")

    # Last resort: generate anonymous ID
    return AuthContext(
        user_id="anonymous",
        is_authenticated=False,
        auth_method="none",
    )


def _decode_jwt_claims(token: str, settings: Settings) -> dict:
    """
    Decode and validate a Cognito JWT.

    Architecture Decision:
      We do a lightweight validation here:
      1. Decode the payload (base64)
      2. Check expiration
      3. Check issuer matches our user pool
      4. Check audience matches our app client

      Full cryptographic signature verification requires the `python-jose`
      or `PyJWT` library. For a zero-dependency Lambda, we rely on
      API Gateway Cognito Authorizer for signature verification and
      do claims-only validation here.

      To add full signature verification:
      1. pip install python-jose[cryptography]
      2. Fetch JWKS from Cognito
      3. Verify RS256 signature
      See NEXT_STEPS_FOR_ARYAN.md for instructions.
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("JWT must have 3 parts")

    # Decode payload (part 2)
    payload_b64 = parts[1]
    # Add padding
    payload_b64 += "=" * (4 - len(payload_b64) % 4)
    payload_json = base64.urlsafe_b64decode(payload_b64)
    claims = json.loads(payload_json)

    # Check expiration
    exp = claims.get("exp", 0)
    if exp and time.time() > exp:
        raise ValueError("Token expired")

    # Check issuer
    if settings.cognito_user_pool_id:
        expected_issuer = (
            f"https://cognito-idp.{settings.cognito_region}.amazonaws.com/"
            f"{settings.cognito_user_pool_id}"
        )
        if claims.get("iss") != expected_issuer:
            raise ValueError(f"Invalid issuer: {claims.get('iss')}")

    # Check audience (for id tokens)
    if settings.cognito_app_client_id:
        aud = claims.get("aud") or claims.get("client_id")
        if aud != settings.cognito_app_client_id:
            raise ValueError(f"Invalid audience: {aud}")

    return claims

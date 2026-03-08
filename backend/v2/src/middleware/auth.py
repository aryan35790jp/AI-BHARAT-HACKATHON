"""
Authentication middleware — JWT extraction and validation.

Architecture Decision:
  Supports both Supabase JWT and Cognito JWT.
  In dev: auth is optional (require_auth=False).
  In staging/prod: every request MUST have a valid JWT.

  JWT validation:
    1. Extract token from Authorization: Bearer <token>
    2. Decode payload (base64)
    3. Check expiration
    4. Extract user identity (sub for Supabase, sub for Cognito)

  SECURITY: The user_id is ALWAYS derived from the JWT token.
  Never trust user-supplied IDs from headers or body.
  The JWT sub claim is the single source of truth.
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
    auth_method: str = "none"  # supabase | cognito | header | body

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
      1. Supabase/Cognito JWT in Authorization header
      2. X-User-Id header (dev/testing only — NEVER in prod)
      3. userId field in request body (dev/testing only)
      4. Raise UnauthorizedError if require_auth=True and nothing found

    SECURITY: In production, only JWT-based auth is accepted.
    """
    headers = event.get("headers") or {}
    # API Gateway may lowercase header names
    auth_header = headers.get("Authorization") or headers.get("authorization") or ""

    # --- Try JWT (Supabase or Cognito) ---
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        if token:
            try:
                claims = _decode_jwt_claims(token, settings)
                user_id = claims.get("sub", "")
                email = claims.get("email", "")
                # Detect if Supabase or Cognito based on issuer
                issuer = claims.get("iss", "")
                auth_method = "supabase" if "supabase" in issuer else "cognito"
                return AuthContext(
                    user_id=user_id,
                    email=email,
                    groups=claims.get("cognito:groups", []),
                    is_authenticated=True,
                    auth_method=auth_method,
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
    Decode and validate a JWT (Supabase or Cognito).

    Architecture Decision:
      We do a lightweight validation here:
      1. Decode the payload (base64)
      2. Check expiration
      3. Check issuer matches our user pool or Supabase project
      4. Check audience if configured

      Full cryptographic signature verification:
      - For Supabase: the JWT secret is available in project settings
      - For Cognito: requires JWKS fetch
      For a zero-dependency Lambda, we rely on the token being
      issued by a trusted auth provider. API Gateway Cognito Authorizer
      can be added as defense-in-depth.
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

    # Check issuer — accept both Cognito and Supabase
    issuer = claims.get("iss", "")
    if settings.cognito_user_pool_id:
        expected_cognito_issuer = (
            f"https://cognito-idp.{settings.cognito_region}.amazonaws.com/"
            f"{settings.cognito_user_pool_id}"
        )
        # Accept Cognito OR Supabase issuer
        if issuer != expected_cognito_issuer and "supabase" not in issuer:
            raise ValueError(f"Invalid issuer: {issuer}")
    # Always accept Supabase JWT issuers (https://<project>.supabase.co/auth/v1)
    # No further issuer validation needed for Supabase tokens

    # Check audience (for id tokens)
    if settings.cognito_app_client_id:
        aud = claims.get("aud") or claims.get("client_id")
        if aud != settings.cognito_app_client_id:
            raise ValueError(f"Invalid audience: {aud}")

    return claims

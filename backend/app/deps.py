from __future__ import annotations

from fastapi import Depends, HTTPException, Request

from app.auth.dev_identity import build_dev_user
from app.auth.principal import parse_x_ms_client_principal
from app.config import Settings, get_settings
from app.schemas.common import CurrentUser


async def get_current_user(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if settings.env == "dev":
        return build_dev_user(settings)

    header = request.headers.get("X-MS-CLIENT-PRINCIPAL")
    claims = parse_x_ms_client_principal(header)
    if not claims:
        raise HTTPException(status_code=401, detail="missing or invalid principal")

    # Lazy import to avoid pulling storage on module load
    from app.services.user_service import get_user_service

    users = get_user_service()
    row = users.get(claims["email"])
    if not row or not row.is_active:
        raise HTTPException(status_code=403, detail="user not provisioned")

    return CurrentUser(
        email=row.email,
        role=row.role,
        oid=claims.get("oid"),
        source="entra",
    )


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="admin required")
    return user


def riaas_enabled(user: CurrentUser, settings: Settings) -> bool:
    if settings.env == "dev":
        return True
    return user.email.lower() in settings.riaas_allowed_list


# Process-lifetime dedup for the first-access audit event.
_riaas_access_logged: set[str] = set()


def require_riaas_access(
    user: CurrentUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    # 404, not 403: the Organization Performance surface must be invisible
    # to non-flagged users, not visibly forbidden.
    if not riaas_enabled(user, settings):
        raise HTTPException(status_code=404, detail="not found")

    if user.email not in _riaas_access_logged:
        _riaas_access_logged.add(user.email)
        from app.services.audit_service import get_audit_service

        get_audit_service().write(
            actor=user.email, entity="riaas", action="access_granted"
        )
    return user

from __future__ import annotations

import re
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import EmailStr, Field, field_validator
from sqlalchemy import func, select

from northstar_api.dependencies import AdminPrincipal, CurrentPrincipal, DBSession
from northstar_api.models import Tenant, TenantMembership
from northstar_api.schemas import APIModel

router = APIRouter(prefix="/workspace", tags=["workspace"])


class WorkspacePreferences(APIModel):
    timezone: str = Field(default="Asia/Calcutta", min_length=2, max_length=80)
    default_language: str = Field(default="English", min_length=2, max_length=60)
    date_format: Literal["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] = "DD/MM/YYYY"


class WhiteLabelSettings(APIModel):
    company_name: str = Field(default="Northstar AI", min_length=2, max_length=120)
    logo_data_url: str = Field(default="", max_length=500_000)
    favicon_data_url: str = Field(default="", max_length=500_000)
    app_icon_data_url: str = Field(default="", max_length=500_000)
    primary_color: str = "#146cf6"
    secondary_color: str = "#705cf6"
    support_email: EmailStr | None = None
    support_url: str = Field(default="", max_length=2000)
    browser_title: str = Field(default="Northstar AI", min_length=1, max_length=120)
    custom_domain: str = Field(default="", max_length=253)
    dns_status: Literal["not-configured", "pending", "verified"] = "not-configured"
    branded_login: bool = True
    branded_dashboard: bool = True
    branded_widget: bool = True
    branded_emails: bool = True
    remove_platform_branding: bool = False

    @field_validator("primary_color", "secondary_color")
    @classmethod
    def valid_color(cls, value: str) -> str:
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("must be a six-digit hex color")
        return value.lower()

    @field_validator("logo_data_url", "favicon_data_url", "app_icon_data_url")
    @classmethod
    def safe_image(cls, value: str) -> str:
        if value and not re.match(r"^data:image/(png|jpeg|webp|svg\+xml);base64,", value):
            raise ValueError("must be a supported image data URL")
        return value

    @field_validator("custom_domain")
    @classmethod
    def normalize_domain(cls, value: str) -> str:
        normalized = value.strip().lower().removeprefix("https://").removeprefix("http://").strip("/")
        if normalized and ("/" in normalized or " " in normalized or "." not in normalized):
            raise ValueError("must be a valid hostname")
        return normalized


class WorkspaceOut(APIModel):
    id: str
    name: str
    slug: str
    plan: str
    member_count: int
    preferences: WorkspacePreferences
    white_label: WhiteLabelSettings


class WorkspacePatch(APIModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    slug: str | None = Field(default=None, min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    preferences: WorkspacePreferences | None = None
    white_label: WhiteLabelSettings | None = None


def _workspace_response(tenant: Tenant, member_count: int) -> WorkspaceOut:
    settings: dict[str, Any] = tenant.settings_json or {}
    return WorkspaceOut(
        id=str(tenant.id),
        name=tenant.name,
        slug=tenant.slug,
        plan=tenant.plan,
        member_count=member_count,
        preferences=WorkspacePreferences.model_validate(settings.get("preferences", {})),
        white_label=WhiteLabelSettings.model_validate(
            {"companyName": tenant.name, **settings.get("whiteLabel", {})}
        ),
    )


async def _load_workspace(tenant_id: Any, session: DBSession) -> tuple[Tenant, int]:
    tenant = await session.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if not tenant:
        raise HTTPException(status_code=404, detail="Workspace not found")
    member_count = int(
        await session.scalar(
            select(func.count()).select_from(TenantMembership).where(TenantMembership.tenant_id == tenant_id)
        )
        or 0
    )
    return tenant, member_count


@router.get("", response_model=WorkspaceOut)
async def get_workspace(principal: CurrentPrincipal, session: DBSession) -> WorkspaceOut:
    tenant, member_count = await _load_workspace(principal.tenant_id, session)
    return _workspace_response(tenant, member_count)


@router.patch("", response_model=WorkspaceOut)
async def update_workspace(
    payload: WorkspacePatch,
    principal: AdminPrincipal,
    session: DBSession,
) -> WorkspaceOut:
    tenant, member_count = await _load_workspace(principal.tenant_id, session)
    if payload.slug and payload.slug != tenant.slug:
        duplicate = await session.scalar(select(Tenant.id).where(Tenant.slug == payload.slug))
        if duplicate:
            raise HTTPException(status_code=409, detail="Workspace slug is already in use")
        tenant.slug = payload.slug
    if payload.name is not None:
        tenant.name = payload.name.strip()

    settings = dict(tenant.settings_json or {})
    if payload.preferences is not None:
        settings["preferences"] = payload.preferences.model_dump(by_alias=True)
    if payload.white_label is not None:
        settings["whiteLabel"] = payload.white_label.model_dump(by_alias=True, mode="json")
    tenant.settings_json = settings
    await session.commit()
    await session.refresh(tenant)
    return _workspace_response(tenant, member_count)

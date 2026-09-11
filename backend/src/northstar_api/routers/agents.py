from __future__ import annotations

from copy import deepcopy
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from northstar_api.config import get_settings
from northstar_api.database import get_session
from northstar_api.dependencies import AdminPrincipal, CurrentPrincipal
from northstar_api.models import (
    Agent,
    AgentStatus,
    Conversation,
    ConversationState,
    KnowledgeSource,
    default_appearance,
)
from northstar_api.schemas import (
    AgentAppearance,
    AgentCreate,
    AgentDuplicate,
    AgentModelProfile,
    AgentOut,
    AgentPatch,
    AgentSecurity,
)
from northstar_api.services.localization import localized_appearance
from northstar_api.services.outbox import enqueue_event

router = APIRouter(prefix="/agents", tags=["agents"])
DB = Annotated[AsyncSession, Depends(get_session)]


async def agent_response(session: AsyncSession, agent: Agent) -> AgentOut:
    conversations = int(
        await session.scalar(
            select(func.count())
            .select_from(Conversation)
            .where(Conversation.tenant_id == agent.tenant_id, Conversation.agent_id == agent.id)
        )
        or 0
    )
    resolved = int(
        await session.scalar(
            select(func.count())
            .select_from(Conversation)
            .where(
                Conversation.tenant_id == agent.tenant_id,
                Conversation.agent_id == agent.id,
                Conversation.state == ConversationState.RESOLVED,
            )
        )
        or 0
    )
    knowledge = int(
        await session.scalar(
            select(func.count())
            .select_from(KnowledgeSource)
            .where(KnowledgeSource.tenant_id == agent.tenant_id, KnowledgeSource.agent_id == agent.id)
        )
        or 0
    )
    return AgentOut(
        id=agent.id,
        public_id=agent.public_id,
        name=agent.name,
        description=agent.description,
        instructions=agent.instructions,
        status=agent.status,
        purpose=agent.purpose,
        tone=agent.tone,
        language=agent.language,
        avatar=agent.avatar,
        conversations=conversations,
        resolution_rate=round((resolved / conversations) * 100, 1) if conversations else 0,
        knowledge_count=knowledge,
        last_updated=agent.updated_at,
        created_at=agent.created_at,
        appearance=AgentAppearance.model_validate(agent.appearance),
        model=AgentModelProfile.model_validate(agent.model_profile),
        security=AgentSecurity.model_validate(agent.security),
    )


async def scoped_agent(session: AsyncSession, tenant_id: UUID, agent_id: UUID) -> Agent:
    agent = await session.scalar(
        select(Agent).where(Agent.id == agent_id, Agent.tenant_id == tenant_id, Agent.deleted_at.is_(None))
    )
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.get("", response_model=list[AgentOut])
async def list_agents(principal: CurrentPrincipal, session: DB) -> list[AgentOut]:
    agents = (
        await session.scalars(
            select(Agent)
            .where(Agent.tenant_id == principal.tenant_id, Agent.deleted_at.is_(None))
            .order_by(Agent.updated_at.desc())
        )
    ).all()
    return [await agent_response(session, agent) for agent in agents]


@router.post("", response_model=AgentOut, status_code=201)
async def create_agent(payload: AgentCreate, principal: AdminPrincipal, session: DB) -> AgentOut:
    appearance = default_appearance()
    appearance.update(localized_appearance(payload.language))
    appearance["deploymentChannel"] = payload.deployment_channel
    instructions = {
        "support": "Answer customer questions using trusted knowledge. Be clear, helpful, and escalate when information is missing.",
        "lead": "Qualify each lead with one useful question at a time, understand their needs, and recommend the appropriate next step.",
        "education": "Teach clearly from trusted knowledge, explain concepts step by step, and say when verified information is unavailable.",
    }.get(
        payload.template or "",
        "Help visitors with accurate, concise answers. Use trusted knowledge first and clearly say when information is unavailable.",
    )
    agent = Agent(
        tenant_id=principal.tenant_id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        instructions=instructions,
        status=AgentStatus.DRAFT,
        purpose=payload.purpose,
        tone=payload.tone,
        language=payload.language,
        appearance=appearance,
    )
    session.add(agent)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="An agent with this name already exists") from None
    enqueue_event(
        session,
        tenant_id=principal.tenant_id,
        aggregate_type="agent",
        aggregate_id=agent.id,
        event_type="agent.created.v1",
        payload={"agentId": str(agent.id), "purpose": agent.purpose.value},
    )
    await session.commit()
    return await agent_response(session, agent)


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: UUID, principal: CurrentPrincipal, session: DB) -> AgentOut:
    return await agent_response(session, await scoped_agent(session, principal.tenant_id, agent_id))


@router.post("/{agent_id}/duplicate", response_model=AgentOut, status_code=201)
async def duplicate_agent(
    agent_id: UUID, payload: AgentDuplicate, principal: AdminPrincipal, session: DB
) -> AgentOut:
    source = await scoped_agent(session, principal.tenant_id, agent_id)
    appearance = deepcopy(source.appearance)
    appearance["deploymentChannel"] = payload.deployment_channel
    duplicate = Agent(
        tenant_id=principal.tenant_id,
        name=payload.name.strip(),
        description=source.description,
        instructions=source.instructions,
        status=AgentStatus.DRAFT,
        purpose=source.purpose,
        tone=source.tone,
        language=source.language,
        avatar=source.avatar,
        appearance=appearance,
        model_profile=deepcopy(source.model_profile),
        security=deepcopy(source.security),
    )
    session.add(duplicate)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="An agent with this name already exists") from None
    enqueue_event(
        session,
        tenant_id=principal.tenant_id,
        aggregate_type="agent",
        aggregate_id=duplicate.id,
        event_type="agent.duplicated.v1",
        payload={
            "agentId": str(duplicate.id),
            "sourceAgentId": str(source.id),
            "deploymentChannel": payload.deployment_channel,
            "purpose": duplicate.purpose.value,
        },
    )
    await session.commit()
    await session.refresh(duplicate)
    return await agent_response(session, duplicate)


@router.patch("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: UUID, payload: AgentPatch, principal: AdminPrincipal, session: DB
) -> AgentOut:
    agent = await scoped_agent(session, principal.tenant_id, agent_id)
    patch = payload.model_dump(exclude_unset=True)
    if "model" in patch:
        configured_model = get_settings().nvidia_model
        if payload.model and payload.model.model != configured_model:
            raise HTTPException(
                status_code=422, detail=f"This deployment only permits model {configured_model}"
            )
        assert payload.model is not None
        agent.model_profile = payload.model.model_dump(by_alias=True)
        patch.pop("model")
    if "appearance" in patch:
        assert payload.appearance is not None
        agent.appearance = payload.appearance.model_dump(by_alias=True)
        patch.pop("appearance")
    if "security" in patch:
        assert payload.security is not None
        agent.security = payload.security.model_dump(by_alias=True)
        patch.pop("security")
    if "language" in patch and "appearance" not in payload.model_fields_set:
        next_appearance = deepcopy(agent.appearance)
        next_appearance.update(localized_appearance(str(patch["language"])))
        agent.appearance = next_appearance
    for name, value in patch.items():
        setattr(agent, name, value)
    enqueue_event(
        session,
        tenant_id=principal.tenant_id,
        aggregate_type="agent",
        aggregate_id=agent.id,
        event_type="agent.updated.v1",
        payload={"agentId": str(agent.id), "fields": sorted(payload.model_fields_set)},
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="An agent with this name already exists") from None
    await session.refresh(agent)
    return await agent_response(session, agent)


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: UUID, principal: AdminPrincipal, session: DB) -> Response:
    from datetime import UTC, datetime

    agent = await scoped_agent(session, principal.tenant_id, agent_id)
    agent.deleted_at = datetime.now(UTC)
    enqueue_event(
        session,
        tenant_id=principal.tenant_id,
        aggregate_type="agent",
        aggregate_id=agent.id,
        event_type="agent.deleted.v1",
        payload={"agentId": str(agent.id)},
    )
    await session.commit()
    return Response(status_code=204)

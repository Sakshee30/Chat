"""Add first-class Agent purpose while preserving existing agents.

Revision ID: 0006_agent_purpose
Revises: 0005_help_center
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_agent_purpose"
down_revision = "0005_help_center"
branch_labels = None
depends_on = None

AGENT_PURPOSE = sa.Enum(
    "lead_generation",
    "education",
    "support",
    name="agent_purpose",
    native_enum=False,
)


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column(
            "purpose",
            AGENT_PURPOSE,
            nullable=False,
            server_default=sa.text("'support'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("agents", "purpose")

from __future__ import annotations

from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ArtifactMeta(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    schema_version: int = Field(alias="schemaVersion")
    display_name: str = Field(alias="displayName")
    tagline: str
    default_scheme_id: str = Field(alias="defaultSchemeId")


class ContentItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    name: str
    slug: str
    section: str
    type: Literal[
        "text",
        "link",
        "href",
        "contact",
        "pdf",
        "website",
        "htmlCard",
        "section",
    ]
    description: Optional[str] = None
    value: Optional[float] = None
    hidden: Optional[bool] = None
    html: Optional[str] = None
    url: Optional[str] = None
    source: Optional[str] = None
    pdf: Optional[str] = None
    preview_image: Optional[str] = Field(None, alias="previewImage")
    image: Optional[str] = None
    embed: Optional[str] = None
    color: Optional[str] = None
    kicker: Optional[str] = None
    template: Optional[str] = None
    email: Optional[str] = None
    href: Optional[str] = None


class ManifestNode(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[UUID] = None
    name: str
    slug: Optional[str] = None
    type: Optional[str] = None
    children: list["ManifestNode"] = Field(default_factory=list)


class SubtreeNode(ManifestNode):
    pass


class ArtifactStats(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    schema_version: int = Field(alias="schemaVersion")
    item_count: int = Field(alias="itemCount")
    section_count: int = Field(alias="sectionCount")
    leaf_count: int = Field(alias="leafCount")
    type_breakdown: dict[str, int] = Field(alias="typeBreakdown")
    asset_counts: dict[str, int] = Field(alias="assetCounts")
    asset_total_bytes: int = Field(alias="assetTotalBytes")
    hidden_count: int = Field(alias="hiddenCount")


class SearchResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    name: str
    slug: str
    matched_field: str = Field(alias="matchedField")
    excerpt: str


class TreeLine(BaseModel):
    depth: int
    id: Optional[UUID] = None
    slug: Optional[str] = None
    name: str
    type: Optional[str] = None


class ValidationResult(BaseModel):
    valid: bool
    errors: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[dict[str, Any]] = Field(default_factory=list)


class ToolResult(BaseModel):
    ok: bool
    data: Optional[dict[str, Any]] = None
    error: Optional[dict[str, Any]] = None


class EditSessionState(BaseModel):
    artifact_path: str
    artifact_meta: Optional[ArtifactMeta] = None
    operations: list[dict[str, Any]] = Field(default_factory=list)
    last_validation: Optional[ValidationResult] = None
    manifest_rebuilt: bool = False
    preview_url: Optional[str] = None
    errors: list[str] = Field(default_factory=list)
    status: str = "idle"


class MutationSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    slug: Optional[str] = None
    manifest_rebuilt: bool = Field(alias="manifestRebuilt")


class ZipExportResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    zip_path: str = Field(alias="zipPath")
    size_bytes: int = Field(alias="sizeBytes")
    sha256: str


class ImportResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    artifact_path: str = Field(alias="artifactPath")
    item_count: int = Field(alias="itemCount")
    schema_version: int = Field(alias="schemaVersion")


def validate_item(item: dict[str, Any]) -> ContentItem:
    return ContentItem.model_validate(item)


ManifestNode.model_rebuild()
SubtreeNode.model_rebuild()

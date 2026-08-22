"""Authenticated server-side Data Science Assistant proxy."""
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.deps import get_current_active_user
from app.models import User


router = APIRouter()


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)


class AssistantChatRequest(BaseModel):
    system_prompt: str = Field(min_length=1, max_length=30000)
    messages: list[AssistantMessage] = Field(default_factory=list, max_length=20)


class AssistantChatResponse(BaseModel):
    content: str
    model: str


def _gemini_contents(messages: list[AssistantMessage]) -> list[dict]:
    """Build a valid multi-turn generateContent history ending in a user turn."""
    recent = messages[-20:]

    # The UI greeting is local-only. Start provider history at the first real user turn
    # so the request never begins with a synthetic model prefill.
    first_user = next((index for index, item in enumerate(recent) if item.role == "user"), None)
    if first_user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user message is required.",
        )
    recent = recent[first_user:]

    if recent[-1].role != "user":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The conversation must end with a user message.",
        )

    return [
        {
            "role": "model" if message.role == "assistant" else "user",
            "parts": [{"text": message.content}],
        }
        for message in recent
    ]


@router.post("/chat", response_model=AssistantChatResponse)
async def chat(
    request: AssistantChatRequest,
    _current_user: User = Depends(get_current_active_user),
):
    if not settings.GEMINI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI assistant is not configured on this deployment yet.",
        )

    payload = {
        "system_instruction": {"parts": [{"text": request.system_prompt}]},
        "contents": _gemini_contents(request.messages),
        "generationConfig": {
            "maxOutputTokens": 1200,
            "thinkingConfig": {"thinkingLevel": "low"},
        },
    }

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.GEMINI_MODEL}:generateContent"
    )

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                url,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": settings.GEMINI_API_KEY,
                },
                json=payload,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider is temporarily unreachable.",
        ) from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider rejected the request.",
        )

    data = response.json()
    candidates = data.get("candidates") or []
    parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
    text = "".join(part.get("text", "") for part in parts if not part.get("thought")).strip()

    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider returned an empty response.",
        )

    return AssistantChatResponse(content=text, model=settings.GEMINI_MODEL)

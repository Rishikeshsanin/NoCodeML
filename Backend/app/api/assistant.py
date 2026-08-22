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

    contents = [
        {
            "role": "model" if message.role == "assistant" else "user",
            "parts": [{"text": message.content}],
        }
        for message in request.messages[-20:]
    ]

    payload = {
        "system_instruction": {"parts": [{"text": request.system_prompt}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.6,
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
    text = "".join(part.get("text", "") for part in parts).strip()

    if not text:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider returned an empty response.",
        )

    return AssistantChatResponse(content=text, model=settings.GEMINI_MODEL)

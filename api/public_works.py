from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool

from services.public_work_service import public_work_service


def create_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/public-works")
    async def list_public_works(limit: int = Query(default=60, ge=1, le=200)):
        items = await run_in_threadpool(public_work_service.list_public_works, limit)
        return {"items": items}

    return router

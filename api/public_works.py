from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from api.support import require_admin, require_image_access
from services.public_work_service import public_work_service


def create_router() -> APIRouter:
    router = APIRouter()

    @router.get("/api/public-works")
    async def list_public_works(limit: int = Query(default=60, ge=1, le=200), authorization: str | None = Header(default=None)):
        require_image_access(authorization)
        items = await run_in_threadpool(public_work_service.list_public_works, limit)
        return {"items": items}

    @router.get("/api/public-works/{work_id}")
    async def get_public_work(work_id: str):
        item = await run_in_threadpool(public_work_service.get_public_work, work_id)
        if not item:
            raise HTTPException(status_code=404, detail={"error": "public work not found"})
        return {"item": item}

    @router.delete("/api/public-works/{work_id}")
    async def delete_public_work(work_id: str, authorization: str | None = Header(default=None)):
        require_admin(authorization)
        if not await run_in_threadpool(public_work_service.delete_public_work, work_id):
            raise HTTPException(status_code=404, detail={"error": "public work not found"})
        return {"ok": True}

    return router

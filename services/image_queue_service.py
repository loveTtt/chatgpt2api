from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import Lock, Thread
from typing import Callable
import uuid



ImageQueueOperation = Callable[[], object]


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class ImageQueueTicket:
    id: str
    link_id: str
    limit: int
    operation: ImageQueueOperation
    status: str = "queued"
    result: object | None = None
    error: str | None = None
    created_at: str = field(default_factory=_now_iso)
    updated_at: str = field(default_factory=_now_iso)


class ImageLinkPermit:
    def __init__(self, service: "ImageQueueService", link_id: str, limit: int):
        self._service = service
        self._link_id = link_id
        self._limit = limit
        self._released = False

    def release(self) -> None:
        if self._released:
            return
        self._released = True
        self._service.release(self._link_id, self._limit)


class ImageQueueService:
    def __init__(self):
        self._lock = Lock()
        self._active_counts: dict[str, int] = {}
        self._queues: dict[str, deque[str]] = {}
        self._tickets: dict[str, ImageQueueTicket] = {}

    @staticmethod
    def _normalize_limit(value: object) -> int:
        try:
            return max(1, int(str(value)))
        except (TypeError, ValueError):
            return 10

    @staticmethod
    def _error_message(exc: Exception) -> str:
        detail = getattr(exc, "detail", None)
        if isinstance(detail, dict):
            error = detail.get("error")
            if isinstance(error, str) and error:
                return error
        if isinstance(detail, str) and detail:
            return detail
        return str(exc) or "image generation failed"

    @staticmethod
    def _ticket_view(ticket: ImageQueueTicket, position: int = 0) -> dict[str, object]:
        result: dict[str, object] = {
            "ticket_id": ticket.id,
            "status": ticket.status,
            "position": position,
            "created_at": ticket.created_at,
            "updated_at": ticket.updated_at,
        }
        if ticket.result is not None:
            result["result"] = ticket.result
        if ticket.error:
            result["error"] = ticket.error
        return result

    def enter_or_enqueue(
        self,
        *,
        link_id: str,
        limit: object,
        operation: ImageQueueOperation,
    ) -> tuple[ImageLinkPermit | None, dict[str, object] | None]:
        normalized_link_id = str(link_id or "").strip()
        if not normalized_link_id:
            raise ValueError("link_id is required")
        normalized_limit = self._normalize_limit(limit)
        with self._lock:
            queue = self._queues.setdefault(normalized_link_id, deque())
            active_count = self._active_counts.get(normalized_link_id, 0)
            if not queue and active_count < normalized_limit:
                self._active_counts[normalized_link_id] = active_count + 1
                return ImageLinkPermit(self, normalized_link_id, normalized_limit), None

            ticket = ImageQueueTicket(
                id=uuid.uuid4().hex,
                link_id=normalized_link_id,
                limit=normalized_limit,
                operation=operation,
            )
            self._tickets[ticket.id] = ticket
            queue.append(ticket.id)
            return None, {"queued": True, **self._ticket_view(ticket, len(queue))}

    def release(self, link_id: str, limit: int) -> None:
        with self._lock:
            active_count = max(0, self._active_counts.get(link_id, 0) - 1)
            if active_count:
                self._active_counts[link_id] = active_count
            else:
                self._active_counts.pop(link_id, None)
        self._drain(link_id, limit)

    def get_status(self, ticket_id: str, *, link_id: str | None = None, is_admin: bool = False) -> dict[str, object] | None:
        normalized_ticket_id = str(ticket_id or "").strip()
        with self._lock:
            ticket = self._tickets.get(normalized_ticket_id)
            if ticket is None:
                return None
            if not is_admin and link_id is not None and ticket.link_id != link_id:
                return None
            position = 0
            if ticket.status == "queued":
                queue = self._queues.get(ticket.link_id, deque())
                try:
                    position = list(queue).index(ticket.id) + 1
                except ValueError:
                    position = 0
            return self._ticket_view(ticket, position)

    def _drain(self, link_id: str, limit: int) -> None:
        starters: list[ImageQueueTicket] = []
        with self._lock:
            queue = self._queues.setdefault(link_id, deque())
            normalized_limit = self._normalize_limit(limit)
            while queue and self._active_counts.get(link_id, 0) < normalized_limit:
                ticket_id = queue.popleft()
                ticket = self._tickets.get(ticket_id)
                if ticket is None or ticket.status != "queued":
                    continue
                ticket.status = "running"
                ticket.updated_at = _now_iso()
                self._active_counts[link_id] = self._active_counts.get(link_id, 0) + 1
                starters.append(ticket)
        for ticket in starters:
            Thread(target=self._run_ticket, args=(ticket,), daemon=True).start()

    def _run_ticket(self, ticket: ImageQueueTicket) -> None:
        try:
            result = ticket.operation()
        except Exception as exc:
            with self._lock:
                ticket.status = "error"
                ticket.error = self._error_message(exc)
                ticket.updated_at = _now_iso()
        else:
            with self._lock:
                ticket.status = "completed"
                ticket.result = result
                ticket.updated_at = _now_iso()
        finally:
            self.release(ticket.link_id, ticket.limit)


image_queue_service = ImageQueueService()

---
title: Image link queue and upstream account concurrency design
---

# Image link queue and upstream account concurrency design

## Goal

Avoid multiple image generation requests hitting the same upstream account at once, and prevent one shared image link from starting too many concurrent image requests.

## Decisions

- Each upstream `access_token` allows at most 3 active image requests.
- Each `image_link` has a configurable concurrent request limit, defaulting to 10.
- Admin and normal user keys do not enter the `image_link` queue.
- Requests exceeding an `image_link` limit enter a FIFO queue for that link.
- The browser receives a ticket and polls status to display how many requests are ahead.
- The queue is in memory. Restarting the backend drops queued/running tickets.
- The image page always generates one image per request; the image count control is removed.

## API shape

- Existing image endpoints return the normal image response when a request can start immediately.
- When an `image_link` is saturated, the endpoint returns `202` with `queued`, `ticket_id`, `status`, and `position`.
- `GET /api/image-queue/{ticket_id}` returns ticket status, current position, result, or error.

## Execution flow

1. Authenticate the caller.
2. For `image_link` callers, enter the per-link gate.
3. If the request is queued, return a ticket immediately.
4. A background worker starts tickets in FIFO order as active slots free up.
5. The image operation acquires an upstream account slot before calling ChatGPT.
6. The slot is released when the upstream call succeeds or fails.
7. The frontend polls ticket status and updates queued/generating/success/error states.

## Testing

- Unit test upstream account slot selection and release.
- Unit test per-link FIFO ticket positioning.
- API test queued response and ticket completion path.
- Frontend type check after removing the image count control and adding queue polling.

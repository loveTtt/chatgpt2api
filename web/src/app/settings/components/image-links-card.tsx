"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, CheckCircle2, Copy, ImageIcon, Link2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createImageLink, deleteImageLink, fetchImageLinks, updateImageLink, type ImageLink } from "@/lib/api";

const PAGE_SIZE = 10;
const MAX_CREATE_COUNT = 100;

function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildImageLink(rawKey?: string | null) {
  if (!rawKey) {
    return "";
  }
  if (typeof window === "undefined") {
    return rawKey;
  }
  const url = new URL("/image", window.location.origin);
  url.searchParams.set("key", rawKey);
  return url.toString();
}

function getStatus(item: ImageLink) {
  if (!item.enabled) {
    return { label: "已禁用", variant: "secondary" as const };
  }
  if (item.expires_at && new Date(item.expires_at).getTime() <= Date.now()) {
    return { label: "已过期", variant: "warning" as const };
  }
  if (item.quota_remaining <= 0) {
    return { label: "额度耗尽", variant: "danger" as const };
  }
  return { label: "可使用", variant: "success" as const };
}

export function ImageLinksCard() {
  const didLoadRef = useRef(false);
  const [items, setItems] = useState<ImageLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [quotaLimit, setQuotaLimit] = useState("10");
  const [createCount, setCreateCount] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const normalizedPage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (normalizedPage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, normalizedPage]);
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.has(item.id)), [items, selectedIds]);
  const selectablePageItems = pageItems.filter((item) => Boolean(item.key));
  const allPageSelected = selectablePageItems.length > 0 && selectablePageItems.every((item) => selectedIds.has(item.id));

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await fetchImageLinks();
      setItems(data.items);
      setSelectedIds((current) => new Set(data.items.filter((item) => current.has(item.id)).map((item) => item.id)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载授权画图链接失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void load();
  }, []);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const setItemPending = (id: string, isPending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current);
      if (isPending) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    const normalizedQuotaLimit = Number.parseInt(quotaLimit, 10);
    if (!Number.isFinite(normalizedQuotaLimit) || normalizedQuotaLimit < 1) {
      toast.error("额度上限必须大于 0");
      return;
    }
    const normalizedCreateCount = Number.parseInt(createCount, 10);
    if (!Number.isFinite(normalizedCreateCount) || normalizedCreateCount < 1 || normalizedCreateCount > MAX_CREATE_COUNT) {
      toast.error(`生成数量必须在 1 到 ${MAX_CREATE_COUNT} 之间`);
      return;
    }

    setIsCreating(true);
    try {
      const data = await createImageLink({
        name: name.trim(),
        quota_limit: normalizedQuotaLimit,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        count: normalizedCreateCount,
      });
      setItems(data.items);
      setSelectedIds(new Set(data.created.map((item) => item.id)));
      setPage(1);
      setName("");
      setQuotaLimit("10");
      setCreateCount("1");
      setExpiresAt("");
      setIsDialogOpen(false);
      toast.success(`已创建 ${data.created.length} 条授权画图链接`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建授权画图链接失败");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggle = async (item: ImageLink) => {
    setItemPending(item.id, true);
    try {
      const data = await updateImageLink(item.id, { enabled: !item.enabled });
      setItems(data.items);
      toast.success(item.enabled ? "授权画图链接已禁用" : "授权画图链接已启用");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新授权画图链接失败");
    } finally {
      setItemPending(item.id, false);
    }
  };

  const handleDelete = async (item: ImageLink) => {
    if (!window.confirm(`确认删除授权画图链接「${item.name}」吗？`)) {
      return;
    }
    setItemPending(item.id, true);
    try {
      const data = await deleteImageLink(item.id);
      setItems(data.items);
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      toast.success("授权画图链接已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除授权画图链接失败");
    } finally {
      setItemPending(item.id, false);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const handleCopySelected = async () => {
    const links = selectedItems.map((item) => buildImageLink(item.key)).filter(Boolean);
    if (links.length === 0) {
      toast.error("请选择可复制的授权链接");
      return;
    }
    await handleCopy(links.join("\n"));
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const togglePageSelected = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of selectablePageItems) {
        if (checked) {
          next.add(item.id);
        } else {
          next.delete(item.id);
        }
      }
      return next;
    });
  };

  return (
    <>
      <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
        <CardContent className="space-y-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-stone-100">
                <Link2 className="size-5 text-stone-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">授权画图链接</h2>
                <p className="text-sm text-stone-500">生成带使用上限的画图入口；访问者只能进入画图页，成功生成后消耗额度。</p>
              </div>
            </div>
            <Button className="h-9 rounded-xl bg-stone-950 px-4 text-white hover:bg-stone-800" onClick={() => setIsDialogOpen(true)}>
              <Plus className="size-4" />
              创建授权链接
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <LoaderCircle className="size-5 animate-spin text-stone-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl bg-stone-50 px-6 py-10 text-center text-sm text-stone-500">
              暂无授权画图链接。创建后可把链接发给临时使用者，按成功生成图片数消耗额度。
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600 md:flex-row md:items-center md:justify-between">
                <label className="flex items-center gap-2">
                  <Checkbox checked={allPageSelected} onCheckedChange={(checked) => togglePageSelected(Boolean(checked))} />
                  选择当前页
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <span>已选择 {selectedItems.length} 条</span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-xl border-stone-200 bg-white px-4 text-stone-700"
                    onClick={() => void handleCopySelected()}
                    disabled={selectedItems.length === 0}
                  >
                    <Copy className="size-4" />
                    批量复制链接
                  </Button>
                </div>
              </div>

              <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {pageItems.map((item) => {
                  const isPending = pendingIds.has(item.id);
                  const status = getStatus(item);
                  const link = buildImageLink(item.key);
                  return (
                    <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white px-4 py-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={(checked) => toggleSelected(item.id, Boolean(checked))}
                            disabled={!item.key}
                            className="mt-1"
                          />
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-sm font-medium text-stone-800">{item.name}</div>
                              <Badge variant={status.variant} className="rounded-md">
                                {status.label}
                              </Badge>
                              <Badge variant="info" className="rounded-md">
                                剩余 {item.quota_remaining}/{item.quota_limit}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                              <span>创建时间 {formatDateTime(item.created_at)}</span>
                              <span>最近使用 {formatDateTime(item.last_used_at)}</span>
                              <span>过期时间 {formatDateTime(item.expires_at)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 md:shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 rounded-xl border-stone-200 bg-white px-4 text-stone-700"
                            onClick={() => void handleToggle(item)}
                            disabled={isPending}
                          >
                            {isPending ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : item.enabled ? (
                              <Ban className="size-4" />
                            ) : (
                              <CheckCircle2 className="size-4" />
                            )}
                            {item.enabled ? "禁用" : "启用"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 rounded-xl border-rose-200 bg-white px-4 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => void handleDelete(item)}
                            disabled={isPending}
                          >
                            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                            删除
                          </Button>
                        </div>
                      </div>

                      {link ? (
                        <div className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3 md:flex-row md:items-center md:justify-between">
                          <code className="break-all font-mono text-[13px] text-stone-700">{link}</code>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 rounded-xl border-stone-200 bg-white px-4 text-stone-700 md:shrink-0"
                            onClick={() => void handleCopy(link)}
                          >
                            <Copy className="size-4" />
                            复制链接
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 text-sm text-stone-500 md:flex-row md:items-center md:justify-between">
                <span>
                  第 {normalizedPage}/{totalPages} 页，共 {items.length} 条
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-xl border-stone-200 bg-white px-4 text-stone-700"
                    disabled={normalizedPage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-xl border-stone-200 bg-white px-4 text-stone-700"
                    disabled={normalizedPage >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-2xl p-6">
          <DialogHeader className="gap-2">
            <DialogTitle>创建授权画图链接</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              链接可直接打开画图页；额度按成功生成的图片数扣减，失败不会扣减。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">名称（可选）</label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：活动海报临时链接"
                className="h-11 rounded-xl border-stone-200 bg-white"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700">额度上限</label>
                <Input
                  type="number"
                  min={1}
                  value={quotaLimit}
                  onChange={(event) => setQuotaLimit(event.target.value)}
                  className="h-11 rounded-xl border-stone-200 bg-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-stone-700">生成数量</label>
                <Input
                  type="number"
                  min={1}
                  max={MAX_CREATE_COUNT}
                  value={createCount}
                  onChange={(event) => setCreateCount(event.target.value)}
                  className="h-11 rounded-xl border-stone-200 bg-white"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">过期时间（可选）</label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="h-11 rounded-xl border-stone-200 bg-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              className="h-10 rounded-xl bg-stone-100 px-5 text-stone-700 hover:bg-stone-200"
              onClick={() => setIsDialogOpen(false)}
              disabled={isCreating}
            >
              取消
            </Button>
            <Button
              type="button"
              className="h-10 rounded-xl bg-stone-950 px-5 text-white hover:bg-stone-800"
              onClick={() => void handleCreate()}
              disabled={isCreating}
            >
              {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

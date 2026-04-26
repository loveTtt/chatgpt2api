"use client";

import { useCallback, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Download, Share2, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

type LightboxImage = {
  id: string;
  src: string;
  prompt?: string;
  revisedPrompt?: string;
  downloadName?: string;
  width?: number;
  height?: number;
  createdAt?: string;
  shareUrl?: string;
};

type ImageLightboxProps = {
  images: LightboxImage[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
  variant?: "overlay" | "details";
};

function formatDetailTime(value?: string) {
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

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5 rounded-2xl bg-stone-50/90 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400">{label}</div>
      <div className="text-sm font-medium text-stone-700">{value}</div>
    </div>
  );
}

export function ImageLightbox({
  images,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
  variant = "overlay",
}: ImageLightboxProps) {
  const current = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(currentIndex - 1);
  }, [hasPrev, currentIndex, onIndexChange]);

  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(currentIndex + 1);
  }, [hasNext, currentIndex, onIndexChange]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, goPrev, goNext]);

  const handleDownload = useCallback(() => {
    if (!current) return;
    const link = document.createElement("a");
    link.href = current.src;
    link.download = current.downloadName || `image-${current.id}.png`;
    link.click();
  }, [current]);

  const handleShare = useCallback(async () => {
    if (!current?.shareUrl) {
      toast.error("当前作品不支持分享");
      return;
    }
    try {
      await navigator.clipboard.writeText(current.shareUrl);
      toast.success("作品链接已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }, [current]);

  if (!current) return null;

  const sizeLabel = current.width && current.height ? `${current.width} × ${current.height}` : "—";
  const isDetails = variant === "details";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-50 outline-none",
            isDetails ? "flex items-center justify-center p-3 sm:p-6" : "flex items-center justify-center",
          )}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">图片预览</DialogPrimitive.Title>

          {isDetails ? (
            <div className="relative flex h-full max-h-[92vh] w-full max-w-[1360px] flex-col overflow-hidden rounded-[32px] border border-white/15 bg-[#f4ece3]/95 shadow-[0_32px_120px_-40px_rgba(15,23,42,0.45)] lg:flex-row">
              <div className="relative flex min-h-[320px] min-w-0 flex-1 items-center justify-center p-3 sm:p-5 lg:p-7">
                {images.length > 1 ? (
                  <span className="absolute left-4 top-4 z-10 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white/90">
                    {currentIndex + 1} / {images.length}
                  </span>
                ) : null}
                {hasPrev ? (
                  <button
                    type="button"
                    onClick={goPrev}
                    className="absolute left-4 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white/90 transition hover:bg-black/65"
                    aria-label="上一张"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                ) : null}
                {hasNext ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="absolute right-4 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white/90 transition hover:bg-black/65"
                    aria-label="下一张"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                ) : null}
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[28px] border border-[#e9dcc8] bg-[#f8f1e8] p-3 sm:p-4 lg:p-6">
                  <img
                    src={current.src}
                    alt=""
                    className="max-h-full max-w-full rounded-[24px] object-contain"
                    draggable={false}
                  />
                </div>
              </div>

              <aside className="flex w-full max-w-[420px] shrink-0 flex-col gap-4 overflow-y-auto border-t border-[#eadfce] bg-white/78 p-4 backdrop-blur-md sm:p-6 lg:border-t-0 lg:border-l">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">已公开</span>
                    <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950">单图作品详情</h2>
                  </div>
                  <DialogPrimitive.Close className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:text-stone-900">
                    <X className="size-4" />
                    <span className="sr-only">关闭</span>
                  </DialogPrimitive.Close>
                </div>

                <section className="space-y-4 rounded-[28px] border border-stone-200/80 bg-white/90 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <DetailField label="尺寸" value={sizeLabel} />
                    <DetailField label="作品创建时间" value={formatDetailTime(current.createdAt)} />
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-stone-950 px-5 text-sm font-medium text-white transition hover:bg-stone-800"
                    >
                      <Download className="size-4" />
                      下载图片
                    </button>
                    {current.shareUrl ? (
                      <button
                        type="button"
                        onClick={() => void handleShare()}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-5 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
                      >
                        <Share2 className="size-4" />
                        分享作品
                      </button>
                    ) : null}
                  </div>
                </section>

                <section className="space-y-4 rounded-[28px] border border-stone-200/80 bg-white/90 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-2xl font-semibold tracking-tight text-stone-950">提示词</h3>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400">主提示词</div>
                    <div className="max-h-[240px] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-stone-700">
                      {current.prompt || "无提示词"}
                    </div>
                  </div>
                  {current.revisedPrompt ? (
                    <div className="space-y-2 border-t border-stone-200 pt-4">
                      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400">修订提示词</div>
                      <div className="max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words text-xs leading-6 text-stone-500">
                        {current.revisedPrompt}
                      </div>
                    </div>
                  ) : null}
                </section>
              </aside>
            </div>
          ) : (
            <>
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                {images.length > 1 && (
                  <span className="rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-white/90">
                    {currentIndex + 1} / {images.length}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex size-9 items-center justify-center rounded-full bg-black/50 text-white/90 transition hover:bg-black/70"
                  aria-label="下载图片"
                >
                  <Download className="size-4" />
                </button>
                <DialogPrimitive.Close className="inline-flex size-9 items-center justify-center rounded-full bg-black/50 text-white/90 transition hover:bg-black/70">
                  <X className="size-4" />
                  <span className="sr-only">关闭</span>
                </DialogPrimitive.Close>
              </div>

              {hasPrev && (
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute left-4 z-10 inline-flex size-10 items-center justify-center rounded-full bg-black/40 text-white/90 transition hover:bg-black/60"
                  aria-label="上一张"
                >
                  <ChevronLeft className="size-5" />
                </button>
              )}

              <div
                className="flex max-h-[90vh] max-w-[90vw] items-center justify-center"
                onClick={() => onOpenChange(false)}
              >
                <img
                  src={current.src}
                  alt=""
                  className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
                  onClick={(e) => e.stopPropagation()}
                  draggable={false}
                />
              </div>

              {hasNext && (
                <button
                  type="button"
                  onClick={goNext}
                  className="absolute right-4 z-10 inline-flex size-10 items-center justify-center rounded-full bg-black/40 text-white/90 transition hover:bg-black/60"
                  aria-label="下一张"
                >
                  <ChevronRight className="size-5" />
                </button>
              )}
              {current.prompt || current.revisedPrompt ? (
                <div className="absolute inset-x-4 bottom-4 z-10 mx-auto max-w-3xl rounded-3xl border border-white/10 bg-black/60 p-4 text-white shadow-2xl backdrop-blur-md">
                  {current.prompt ? (
                    <div className="text-sm leading-6 text-white/90">
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.2em] text-white/45">Prompt</div>
                      {current.prompt}
                    </div>
                  ) : null}
                  {current.revisedPrompt ? (
                    <div className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-white/65">
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/35">Revised</div>
                      {current.revisedPrompt}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { ImageLightbox } from "@/components/image-lightbox";
import { Button } from "@/components/ui/button";
import { deletePublicWork, fetchPublicWorkById, fetchPublicWorks, type PublicWork } from "@/lib/api";
import { getStoredAuthSession } from "@/store/auth";

function formatWorkTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildWorkUrl(url: string) {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

function buildShareUrl(workId: string) {
  if (typeof window === "undefined") {
    return `/works?view=${encodeURIComponent(workId)}`;
  }
  const url = new URL("/works", window.location.origin);
  url.searchParams.set("view", workId);
  return url.toString();
}

function WorksPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewWorkId = String(searchParams.get("view") || "").trim();
  const [works, setWorks] = useState<PublicWork[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canAccessPublicList, setCanAccessPublicList] = useState(false);

  const buildWorksUrl = useCallback(
    (workId?: string) => {
      const nextSearch = new URLSearchParams(searchParams.toString());
      if (workId) {
        nextSearch.set("view", workId);
      } else {
        nextSearch.delete("view");
      }
      const query = nextSearch.toString();
      return query ? `/works?${query}` : "/works";
    },
    [searchParams],
  );

  const syncViewParam = useCallback(
    (workId?: string) => {
      router.replace(buildWorksUrl(workId), { scroll: false });
    },
    [buildWorksUrl, router],
  );

  const lightboxImages = useMemo(
    () =>
      works.map((work) => ({
        id: work.id,
        src: buildWorkUrl(work.image_url),
        title: work.title,
        prompt: work.prompt,
        width: work.width,
        height: work.height,
        fileSizeBytes: work.file_size_bytes,
        createdAt: work.created_at,
        shareUrl: buildShareUrl(work.id),
        downloadName: `work-${work.id}.png`,
      })),
    [works],
  );

  const loadWorks = useCallback(async () => {
    setIsLoading(true);
    try {
      if (viewWorkId) {
        const data = await fetchPublicWorkById(viewWorkId);
        setWorks([data.item]);
        return;
      }

      if (!canAccessPublicList) {
        setWorks([]);
        return;
      }

      const data = await fetchPublicWorks(60);
      setWorks(data.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : viewWorkId ? "读取分享作品失败" : "读取作品失败";
      toast.error(message);
      if (viewWorkId) {
        setWorks([]);
        return;
      }
      setWorks([]);
    } finally {
      setIsLoading(false);
    }
  }, [canAccessPublicList, viewWorkId]);

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      const session = await getStoredAuthSession();
      if (!active) {
        return;
      }
      const isAuthenticated = Boolean(session?.key && session?.role);
      setIsAdmin(session?.role === "admin");
      setCanAccessPublicList(isAuthenticated);
    };

    void loadSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadWorks();
  }, [loadWorks]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!viewWorkId) {
      setLightboxOpen(false);
      return;
    }

    const targetIndex = works.findIndex((work) => work.id === viewWorkId);
    if (targetIndex >= 0) {
      setLightboxIndex(targetIndex);
      setLightboxOpen(true);
      return;
    }

    setLightboxOpen(false);
  }, [isLoading, viewWorkId, works]);

  const handleOpenWork = useCallback(
    (index: number) => {
      const targetWork = works[index];
      if (!targetWork) {
        return;
      }
      setLightboxIndex(index);
      setLightboxOpen(true);
      syncViewParam(targetWork.id);
    },
    [syncViewParam, works],
  );

  const handleLightboxOpenChange = useCallback(
    (open: boolean) => {
      setLightboxOpen(open);
      if (!open) {
        if (viewWorkId && canAccessPublicList) {
          syncViewParam();
        }
        return;
      }
      const targetWork = works[lightboxIndex];
      if (targetWork) {
        syncViewParam(targetWork.id);
      }
    },
    [canAccessPublicList, lightboxIndex, syncViewParam, viewWorkId, works],
  );

  const handleLightboxIndexChange = useCallback(
    (index: number) => {
      setLightboxIndex(index);
      const targetWork = works[index];
      if (targetWork) {
        syncViewParam(targetWork.id);
      }
    },
    [syncViewParam, works],
  );

  const handleDeleteWork = useCallback(
    async (image: { id: string }) => {
      await deletePublicWork(image.id);
      const nextWorks = works.filter((work) => work.id !== image.id);
      setWorks(nextWorks);
      setLightboxOpen(false);
      syncViewParam();
      if (nextWorks.length === 0) {
        setLightboxIndex(0);
      } else if (lightboxIndex >= nextWorks.length) {
        setLightboxIndex(nextWorks.length - 1);
      }
      toast.success("作品已删除");
    },
    [lightboxIndex, syncViewParam, works],
  );

  const isBusy = isLoading;

  return (
    <>
      <section className="mx-auto w-full max-w-[1380px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 border-b border-stone-200/70 pb-6 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.24em] text-stone-400">Public works</p>
            <h1
              className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl"
              style={{ fontFamily: '"Palatino Linotype","Book Antiqua","URW Palladio L","Times New Roman",serif' }}
            >
              作品
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
              公开生成的图片会按自然比例排列在这里，点击图片可查看作品详情、复制分享链接并下载原图。
            </p>
          </div>
          <Button
            variant="outline"
            className="w-fit rounded-full border-stone-200 bg-white text-stone-700 shadow-none hover:bg-stone-50"
            onClick={() => void loadWorks()}
            disabled={isBusy || (!viewWorkId && !canAccessPublicList)}
          >
            <RefreshCw className={isBusy ? "size-4 animate-spin" : "size-4"} />
            刷新
          </Button>
        </div>

        {isBusy ? (
          <div className="flex min-h-[42vh] items-center justify-center text-stone-400">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : works.length === 0 ? (
          <div className="flex min-h-[42vh] items-center justify-center text-center">
            <div>
              <div className="mx-auto mb-5 h-px w-20 bg-stone-200" />
              <p className="text-sm text-stone-500">
                {viewWorkId ? "分享作品不存在或已删除。" : canAccessPublicList ? "还没有公开作品。" : "请使用分享链接查看单个作品。"}
              </p>
            </div>
          </div>
        ) : viewWorkId ? (
          <div className="mx-auto max-w-4xl">
            {works.map((work, index) => {
              const imageUrl = buildWorkUrl(work.image_url);
              return (
                <article key={work.id}>
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenWork(index);
                    }}
                    className="relative block w-full cursor-zoom-in overflow-hidden bg-stone-100 text-left"
                  >
                    <img
                      src={imageUrl}
                      alt={work.prompt || `作品 ${index + 1}`}
                      width={work.width || undefined}
                      height={work.height || undefined}
                      className="block h-auto w-full"
                    />
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="columns-1 gap-5 space-y-5 sm:columns-2 xl:columns-3 2xl:columns-4">
            {works.map((work, index) => {
              const imageUrl = buildWorkUrl(work.image_url);
              return (
                <article key={work.id} className="group break-inside-avoid">
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenWork(index);
                    }}
                    className="relative block w-full cursor-zoom-in overflow-hidden bg-stone-100 text-left"
                  >
                    <img
                      src={imageUrl}
                      alt={work.prompt || `作品 ${index + 1}`}
                      width={work.width || undefined}
                      height={work.height || undefined}
                      className="block h-auto w-full transition duration-300 group-hover:scale-[1.015] group-hover:brightness-75"
                    />
                    <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-stone-950/75 via-stone-950/10 to-transparent p-4 opacity-0 transition duration-300 group-hover:opacity-100">
                      <div className="translate-y-2 transition duration-300 group-hover:translate-y-0">
                        <p className="line-clamp-2 text-base font-semibold text-white">{work.title || "未命名作品"}</p>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/85">{work.prompt || "无提示词"}</p>
                        <p className="mt-2 text-xs text-white/60">{formatWorkTime(work.created_at)}</p>
                      </div>
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={handleLightboxOpenChange}
        onIndexChange={handleLightboxIndexChange}
        variant="details"
        canDelete={isAdmin}
        onDelete={handleDeleteWork}
      />
    </>
  );
}

export default function WorksPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <LoaderCircle className="size-5 animate-spin text-stone-400" />
        </div>
      }
    >
      <WorksPageContent />
    </Suspense>
  );
}

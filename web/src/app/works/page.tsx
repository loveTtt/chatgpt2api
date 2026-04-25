"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ImageLightbox } from "@/components/image-lightbox";
import { Button } from "@/components/ui/button";
import { fetchPublicWorks, type PublicWork } from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";

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

function WorksPageContent() {
  const [works, setWorks] = useState<PublicWork[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const lightboxImages = useMemo(
    () =>
      works.map((work) => ({
        id: work.id,
        src: buildWorkUrl(work.image_url),
        prompt: work.prompt,
        revisedPrompt: work.revised_prompt,
        downloadName: `work-${work.id}.png`,
      })),
    [works],
  );

  const loadWorks = async () => {
    setIsLoading(true);
    try {
      const data = await fetchPublicWorks(60);
      setWorks(data.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取作品失败";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadWorks();
  }, []);

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
              公开生成的图片会按自然比例排列在这里，点击图片可查看提示词并下载原图。
            </p>
          </div>
          <Button
            variant="outline"
            className="w-fit rounded-full border-stone-200 bg-white text-stone-700 shadow-none hover:bg-stone-50"
            onClick={() => void loadWorks()}
            disabled={isLoading}
          >
            <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
            刷新
          </Button>
        </div>

        {isLoading ? (
          <div className="flex min-h-[42vh] items-center justify-center text-stone-400">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : works.length === 0 ? (
          <div className="flex min-h-[42vh] items-center justify-center text-center">
            <div>
              <div className="mx-auto mb-5 h-px w-20 bg-stone-200" />
              <p className="text-sm text-stone-500">还没有公开作品。</p>
            </div>
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
                      setLightboxIndex(index);
                      setLightboxOpen(true);
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
                        <p className="line-clamp-3 text-sm leading-6 text-white">{work.prompt || "无提示词"}</p>
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
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}

function WorksPageGuarded() {
  const { isCheckingAuth, session } = useAuthGuard();

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return <WorksPageContent />;
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
      <WorksPageGuarded />
    </Suspense>
  );
}

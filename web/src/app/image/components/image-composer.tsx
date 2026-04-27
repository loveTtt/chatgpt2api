"use client";

import { ArrowUp, Check, ChevronDown, ImagePlus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type RefObject } from "react";

import { ImageLightbox } from "@/components/image-lightbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  builtinQuickPrompts,
  loadCustomQuickPrompts,
  removeCustomQuickPrompt,
  type CustomQuickPrompt,
  type QuickPromptItem,
} from "@/lib/image-quick-prompts";
import { cn } from "@/lib/utils";
import type { ImageConversationMode } from "@/store/image-conversations";

type ImageComposerProps = {
  mode: ImageConversationMode;
  prompt: string;
  imageSize: string;
  isPublic: boolean;
  availableQuota: string;
  referenceImages: Array<{ name: string; dataUrl: string }>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPromptChange: (value: string) => void;
  onImageSizeChange: (value: string) => void;
  onPublicChange: (value: boolean) => void;
  onSubmit: () => void | Promise<void>;
  onPickReferenceImage: () => void;
  onReferenceImageChange: (files: File[]) => void | Promise<void>;
  onRemoveReferenceImage: (index: number) => void;
};

const imageSizeOptions = [
  { value: "", label: "自动", triggerLabel: "自动" },
  { value: "1:1", label: "方形 1:1", triggerLabel: "1:1" },
  { value: "3:4", label: "竖版 3:4", triggerLabel: "3:4" },
  { value: "9:16", label: "故事 9:16", triggerLabel: "9:16" },
  { value: "4:3", label: "横屏 4:3", triggerLabel: "4:3" },
  { value: "16:9", label: "宽屏 16:9", triggerLabel: "16:9" },
];

export function ImageComposer({
  mode,
  prompt,
  imageSize,
  isPublic,
  availableQuota,
  referenceImages,
  textareaRef,
  fileInputRef,
  onPromptChange,
  onImageSizeChange,
  onPublicChange,
  onSubmit,
  onPickReferenceImage,
  onReferenceImageChange,
  onRemoveReferenceImage,
}: ImageComposerProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isSizeMenuOpen, setIsSizeMenuOpen] = useState(false);
  const [isQuickPromptDialogOpen, setIsQuickPromptDialogOpen] = useState(false);
  const [customQuickPrompts, setCustomQuickPrompts] = useState<CustomQuickPrompt[]>([]);
  const sizeMenuRef = useRef<HTMLDivElement>(null);
  const lightboxImages = useMemo(
    () => referenceImages.map((image, index) => ({ id: `${image.name}-${index}`, src: image.dataUrl })),
    [referenceImages],
  );
  const currentImageSizeOption = imageSizeOptions.find((option) => option.value === imageSize) || imageSizeOptions[0];

  useEffect(() => {
    setCustomQuickPrompts(loadCustomQuickPrompts());
  }, []);

  useEffect(() => {
    if (!isSizeMenuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!sizeMenuRef.current?.contains(event.target as Node)) {
        setIsSizeMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isSizeMenuOpen]);

  const handleTextareaPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void onReferenceImageChange(imageFiles);
  };

  const handleApplyQuickPrompt = (value: string) => {
    onPromptChange(value);
    setIsQuickPromptDialogOpen(false);
    toast.success("已应用快捷提示词");
    textareaRef.current?.focus();
  };

  const handleRemoveCustomQuickPrompt = (id: string) => {
    const nextItems = removeCustomQuickPrompt(id);
    setCustomQuickPrompts(nextItems);
    toast.success("已删除快捷提示词");
  };

  return (
    <div className="shrink-0 flex justify-center">
      <div style={{ width: "min(980px, 100%)" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void onReferenceImageChange(Array.from(event.target.files || []));
          }}
        />

        <Dialog open={isQuickPromptDialogOpen} onOpenChange={setIsQuickPromptDialogOpen}>
          <DialogContent className="w-[min(92vw,760px)] rounded-[32px] border-stone-200 bg-[#f8f3ec] p-0 shadow-[0_36px_120px_-45px_rgba(16,24,40,0.45)]">
            <DialogHeader className="border-b border-stone-200/80 px-6 pt-6 pb-4">
              <DialogTitle className="text-2xl tracking-tight text-stone-950">快捷提示词</DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <QuickPromptSection
                builtinItems={builtinQuickPrompts}
                customItems={customQuickPrompts}
                onApply={handleApplyQuickPrompt}
                onRemove={handleRemoveCustomQuickPrompt}
                embedded
              />
            </div>
          </DialogContent>
        </Dialog>

        {referenceImages.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2 px-1">
            {referenceImages.map((image, index) => (
              <div key={`${image.name}-${index}`} className="relative size-16">
                <button
                  type="button"
                  onClick={() => {
                    setLightboxIndex(index);
                    setLightboxOpen(true);
                  }}
                  className="group size-16 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 transition hover:border-stone-300"
                  aria-label={`预览参考图 ${image.name || index + 1}`}
                >
                  <img
                    src={image.dataUrl}
                    alt={image.name || `参考图 ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveReferenceImage(index);
                  }}
                  className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:text-stone-800"
                  aria-label={`移除参考图 ${image.name || index + 1}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="rounded-[32px] border border-stone-200 bg-white">
          <div
            className="relative cursor-text"
            onClick={() => {
              textareaRef.current?.focus();
            }}
          >
            <ImageLightbox
              images={lightboxImages}
              currentIndex={lightboxIndex}
              open={lightboxOpen}
              onOpenChange={setLightboxOpen}
              onIndexChange={setLightboxIndex}
              hidePromptOverlay
            />
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              onPaste={handleTextareaPaste}
              placeholder={
                mode === "edit" ? "描述你希望如何修改这张参考图，可直接粘贴图片" : "输入你想要生成的画面，也可直接粘贴图片"
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
              className="min-h-[148px] resize-none rounded-[32px] border-0 bg-transparent px-6 pt-6 pb-24 text-[15px] leading-7 text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0"
            />

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-4 pt-6 sm:px-6">
              <div className="flex items-end justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-full border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 shadow-none sm:h-10 sm:px-4 sm:text-sm"
                    onClick={onPickReferenceImage}
                  >
                    <ImagePlus className="size-3.5 sm:size-4" />
                    <span>{referenceImages.length > 0 ? "继续添加参考图" : "加入编辑"}</span>
                  </Button>

                  <div className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-medium text-stone-600 sm:px-3 sm:py-2 sm:text-xs">
                    <span className="hidden xs:inline">剩余额度 </span>{availableQuota}
                  </div>

                  <div ref={sizeMenuRef} className="relative">
                    <button
                      type="button"
                      className="flex h-9 items-center gap-2 rounded-full border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 transition hover:border-stone-300 sm:h-10 sm:px-4 sm:text-sm"
                      onClick={() => setIsSizeMenuOpen((open) => !open)}
                    >
                      <AspectRatioIcon value={currentImageSizeOption.value} />
                      <span>{currentImageSizeOption.triggerLabel}</span>
                      <ChevronDown className={cn("size-4 shrink-0 opacity-60 transition", isSizeMenuOpen && "rotate-180")} />
                    </button>
                    {isSizeMenuOpen ? (
                      <div className="absolute bottom-[calc(100%+10px)] left-0 z-50 w-[196px] overflow-hidden rounded-3xl border border-white/80 bg-white p-2 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
                        {imageSizeOptions.map((option) => {
                          const active = option.value === imageSize;
                          return (
                            <button
                              key={option.label}
                              type="button"
                              className={cn(
                                "flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100",
                                active && "bg-stone-100 font-medium text-stone-950",
                              )}
                              onClick={() => {
                                onImageSizeChange(option.value);
                                setIsSizeMenuOpen(false);
                              }}
                            >
                              <span className="flex items-center gap-2.5">
                                <AspectRatioIcon value={option.value} />
                                <span>{option.label}</span>
                              </span>
                              {active ? <Check className="size-4" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-full border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 shadow-none sm:h-10 sm:px-4 sm:text-sm"
                    onClick={() => setIsQuickPromptDialogOpen(true)}
                  >
                    <Sparkles className="size-3.5 sm:size-4" />
                    <span>快捷提示词</span>
                  </Button>

                  <label className="flex cursor-pointer items-center gap-2 rounded-full border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 transition hover:border-stone-300 sm:px-3 sm:py-2 sm:text-xs">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(event) => onPublicChange(event.target.checked)}
                      className="size-3.5 rounded border-stone-300 text-stone-950 focus:ring-stone-400"
                    />
                    <span>公开到作品页</span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void onSubmit()}
                  disabled={!prompt.trim() || (mode === "edit" && referenceImages.length === 0)}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 sm:size-11"
                  aria-label={mode === "edit" ? "编辑图片" : "生成图片"}
                >
                  <ArrowUp className="size-3.5 sm:size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickPromptSection({
  builtinItems,
  customItems,
  onApply,
  onRemove,
  embedded = false,
}: {
  builtinItems: QuickPromptItem[];
  customItems: CustomQuickPrompt[];
  onApply: (prompt: string) => void;
  onRemove: (id: string) => void;
  embedded?: boolean;
}) {
  return (
    <div className={cn(!embedded && "mb-3 rounded-[28px] border border-stone-200 bg-white/80 p-4 sm:p-5")}>
      <div className="space-y-4">
        <QuickPromptGroup title="公共参考" items={builtinItems} onApply={onApply} />
        <QuickPromptGroup title="我的快捷提示词" items={customItems} onApply={onApply} onRemove={onRemove} emptyText="还没有添加快捷提示词，可从作品详情页加入。" />
      </div>
    </div>
  );
}

function QuickPromptGroup({
  title,
  items,
  onApply,
  onRemove,
  emptyText,
}: {
  title: string;
  items: QuickPromptItem[];
  onApply: (prompt: string) => void;
  onRemove?: (id: string) => void;
  emptyText?: string;
}) {
  return (
    <div className="space-y-2.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400">{title}</div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <div key={item.id} className="group inline-flex max-w-full items-center rounded-full border border-stone-200 bg-stone-50 pr-1">
              <button
                type="button"
                title={item.prompt}
                onClick={() => onApply(item.prompt)}
                className="max-w-[240px] truncate rounded-full px-3 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-100 hover:text-stone-950 sm:max-w-[280px] sm:text-sm"
              >
                {item.name}
              </button>
              {onRemove ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(item.id);
                  }}
                  className="inline-flex size-7 items-center justify-center rounded-full text-stone-400 transition hover:bg-white hover:text-stone-700"
                  aria-label={`删除快捷提示词 ${item.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-500">{emptyText || "暂无数据"}</div>
      )}
    </div>
  );
}

function AspectRatioIcon({ value }: { value: string }) {
  if (!value) {
    return (
      <span className="relative inline-flex h-4 w-5 items-center justify-center text-current">
        <span className="absolute h-[10px] w-[16px] translate-x-[2px] translate-y-[-1px] rounded-[4px] border border-current opacity-45" />
        <span className="absolute h-[10px] w-[16px] rounded-[4px] border border-current" />
      </span>
    );
  }

  const boxClassName =
    value === "1:1"
      ? "h-[14px] w-[14px]"
      : value === "3:4"
        ? "h-[16px] w-[12px]"
        : value === "9:16"
          ? "h-[16px] w-[10px]"
          : value === "4:3"
            ? "h-[12px] w-[16px]"
            : "h-[10px] w-[18px]";

  return (
    <span className="inline-flex h-4 w-5 items-center justify-center text-current">
      <span className={cn("rounded-[4px] border border-current", boxClassName)} />
    </span>
  );
}

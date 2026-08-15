// Animation Preview component
import m from "mithril";
import { state } from "../../state/state.ts";
import { ANIMATIONS } from "../../state/constants.ts";
import { CollapsibleSection } from "../CollapsibleSection.ts";
import {
  repaintStaticPreviewFrameForTests,
  setPreviewAnimation,
  startPreviewAnimation,
  stopPreviewAnimation,
  getCustomAnimations,
} from "../../canvas/preview-animation.ts";
import {
  initPreviewCanvas,
  setPreviewCanvasZoom,
} from "../../canvas/preview-canvas.ts";
import {
  downloadAnimationDirectionPNG,
  getAnimationDirectionOptions,
} from "../../canvas/animation-direction-download.ts";
import PinchToZoom from "./PinchToZoom.ts";
import { ScrollableContainer } from "./ScrollableContainer.ts";
import { PreviewMetadataLoadingOverlay } from "./PreviewMetadataLoadingOverlay.ts";

type PreviewCanvasAttrs = {
  selectedAnimation: string;
  zoomLevel: number;
  onFrameCycleUpdate: (frameCycle: string) => void;
};

type PreviewCanvasState = {
  zoomLevel: number;
  lastAnimation: string;
  _pinchUnmounted: boolean;
  pinch: PinchToZoom | null;
};

const PreviewCanvas: m.Component<PreviewCanvasAttrs, PreviewCanvasState> = {
  oncreate(vnode) {
    const canvas = vnode.dom as HTMLCanvasElement;
    const { selectedAnimation, onFrameCycleUpdate } = vnode.attrs;
    const zoomLevel = vnode.attrs.zoomLevel || 1;

    if (!window.canvasRenderer) {
      console.error("Canvas renderer not available yet");
      return;
    }

    initPreviewCanvas(canvas);
    const frames = setPreviewAnimation(selectedAnimation);
    startPreviewAnimation();

    if (frames) {
      onFrameCycleUpdate(frames.join("-"));
    }

    vnode.state.zoomLevel = zoomLevel;
    vnode.state.lastAnimation = selectedAnimation;
    vnode.state._pinchUnmounted = false;
    vnode.state.pinch = null;
    PinchToZoom.create(
      canvas,
      (scale) => {
        vnode.state.zoomLevel = scale;

        if (window.canvasRenderer) {
          m.redraw();
          setPreviewCanvasZoom(vnode.state.zoomLevel);
        }

        state.previewCanvasZoomLevel = vnode.state.zoomLevel;
      },
      vnode.state.zoomLevel,
    ).then((pinch) => {
      if (vnode.state._pinchUnmounted) {
        pinch.destroy();
        return;
      }
      vnode.state.pinch = pinch;
    });
  },
  onupdate(vnode) {
    const { selectedAnimation } = vnode.attrs;

    if (vnode.state.lastAnimation !== selectedAnimation) {
      if (window.canvasRenderer) {
        stopPreviewAnimation();
        setPreviewAnimation(selectedAnimation);
        initPreviewCanvas(vnode.dom as HTMLCanvasElement);
        startPreviewAnimation();
      }
      vnode.state.lastAnimation = selectedAnimation;
    }

    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
    repaintStaticPreviewFrameForTests();
  },
  onremove(vnode) {
    vnode.state._pinchUnmounted = true;
    vnode.state.pinch?.destroy();
    vnode.state.pinch = null;
    if (window.canvasRenderer) {
      stopPreviewAnimation();
    }
  },
  view() {
    return m("canvas#previewAnimations");
  },
};

type AnimationOption = { value: string; label: string };

/** Chinese display names for custom animations (fall back to the key itself). */
const CUSTOM_ANIMATION_LABELS: Record<string, string> = {
  wheelchair: "轮椅",
  tool_rod: "工具杆",
  slash_128: "挥砍 (128)",
  backslash_128: "反挥砍 (128)",
  halfslash_128: "半挥砍 (128)",
  thrust_oversize: "突刺 (超尺寸)",
  slash_oversize: "挥砍 (超尺寸)",
  slash_reverse_oversize: "反向挥砍 (超尺寸)",
  whip_oversize: "鞭子 (超尺寸)",
  tool_whip: "工具鞭",
  walk_128: "走路 (128)",
  thrust_128: "突刺 (128)",
};

type AnimationPreviewState = {
  selectedAnimation: string;
  selectedDirection: string;
  zoomLevel: number;
  frameCycle: string;
};

export const AnimationPreview: m.Component<
  Record<string, never>,
  AnimationPreviewState
> = {
  oninit(vnode) {
    vnode.state.selectedAnimation = "walk";
    vnode.state.selectedDirection = "down";
    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
    if (window.canvasRenderer) {
      const frames = setPreviewAnimation("walk");
      vnode.state.frameCycle = frames ? frames.join("-") : "";
    } else {
      vnode.state.frameCycle = "";
    }
  },
  onupdate(vnode) {
    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 1;
  },
  view(vnode) {
    const customAnims = Object.keys(getCustomAnimations());
    const allAnimations: AnimationOption[] = [
      ...ANIMATIONS,
      ...customAnims.map((anim) => ({
        value: anim,
        label:
          CUSTOM_ANIMATION_LABELS[anim] ??
          anim.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      })),
    ];

    if (
      !allAnimations.find(
        (anim) => anim.value === vnode.state.selectedAnimation,
      )
    ) {
      vnode.state.selectedAnimation = "walk";
      state.selectedAnimation = "walk";
      if (window.canvasRenderer) {
        const frames = setPreviewAnimation("walk");
        vnode.state.frameCycle = frames ? frames.join("-") : "";
      }
    }

    const directionOptions = getAnimationDirectionOptions(
      vnode.state.selectedAnimation,
    );
    const availableDirections = directionOptions
      .filter((direction) => direction.available)
      .map((direction) => direction.value);
    if (
      availableDirections.length > 0 &&
      !availableDirections.includes(vnode.state.selectedDirection)
    ) {
      vnode.state.selectedDirection = availableDirections[0];
    }

    const selectedDirectionOption =
      directionOptions.find(
        (direction) => direction.value === vnode.state.selectedDirection,
      ) ?? directionOptions[0];

    const onDownloadDirection = async (): Promise<void> => {
      const result = await downloadAnimationDirectionPNG(
        vnode.state.selectedAnimation,
        vnode.state.selectedDirection,
      );
      if (!result.success) {
        alert(result.message);
      }
      m.redraw();
    };

    return m(
      CollapsibleSection,
      {
        title: "动画预览",
        defaultOpen: true,
        boxClass: "box",
      },
      [
        m("div.columns.is-multiline", [
          m("div.column", [
            m("div.field.is-horizontal.is-align-items-center", [
              m("div.field-label.is-normal", [m("label.label.mb-0", "动画")]),
              m("div.field-body", [
                m("div.field.has-addons.mb-0", [
                  m("div.control", [
                    m("div.select", [
                      m(
                        "select",
                        {
                          value: vnode.state.selectedAnimation,
                          onchange: (e: Event) => {
                            const target = e.target as HTMLSelectElement;
                            vnode.state.selectedAnimation = target.value;
                            state.selectedAnimation =
                              vnode.state.selectedAnimation;
                            if (window.canvasRenderer) {
                              const frames = setPreviewAnimation(target.value);
                              vnode.state.frameCycle = frames
                                ? frames.join("-")
                                : "";
                            }
                          },
                        },
                        allAnimations.map((anim) =>
                          m("option", { value: anim.value }, anim.label),
                        ),
                      ),
                    ]),
                  ]),
                  m("div.control", [
                    m("span.button.is-static.is-light", vnode.state.frameCycle),
                  ]),
                ]),
              ]),
            ]),
            m("div.field.is-horizontal.is-align-items-center.mt-2", [
              m("div.field-label.is-normal", [m("label.label.mb-0", "方向")]),
              m("div.field-body", [
                m("div.field.has-addons.mb-0", [
                  m("div.control", [
                    m("div.select", [
                      m(
                        "select",
                        {
                          value: vnode.state.selectedDirection,
                          onchange: (e: Event) => {
                            const target = e.target as HTMLSelectElement;
                            vnode.state.selectedDirection = target.value;
                          },
                        },
                        directionOptions.map((direction) =>
                          m(
                            "option",
                            {
                              value: direction.value,
                              disabled: !direction.available,
                              title: direction.available
                                ? undefined
                                : "此动画不提供该方向",
                            },
                            direction.label,
                          ),
                        ),
                      ),
                    ]),
                  ]),
                  m("div.control", [
                    m(
                      "button.button.is-small.is-primary",
                      {
                        disabled:
                          !window.canvasRenderer || state.isRenderingCharacter,
                        title: `下载 ${vnode.state.selectedAnimation} ${selectedDirectionOption.label} 方向的单行精灵表 PNG`,
                        onclick: onDownloadDirection,
                      },
                      "下载精灵表 (PNG)",
                    ),
                  ]),
                ]),
              ]),
            ]),
          ]),
          m("div.column", [
            m("div.field.is-horizontal.is-align-items-center", [
              m("div.field-label.is-normal", [
                m(
                  "label.label.mb-0",
                  `缩放：${Math.round(vnode.state.zoomLevel * 100)}%`,
                ),
              ]),
              m("div.field-body", [
                m("div.field.mb-0", [
                  m("div.control.is-expanded", [
                    m("input.is-fullwidth[type=range]", {
                      min: 0.5,
                      max: 2,
                      step: 0.1,
                      value: vnode.state.zoomLevel,
                      oninput: (e: Event) => {
                        const target = e.target as HTMLInputElement;
                        vnode.state.zoomLevel = parseFloat(target.value);
                        state.previewCanvasZoomLevel = vnode.state.zoomLevel;
                        if (window.canvasRenderer) {
                          setPreviewCanvasZoom(vnode.state.zoomLevel);
                        }
                      },
                    }),
                  ]),
                ]),
              ]),
            ]),
          ]),
        ]),
        m("div.mt-3", [
          m("div.preview-canvas-area", [
            m(ScrollableContainer, { classes: "spritesheet-preview" }, [
              m("div.preview-canvas-root", [
                m(PreviewCanvas, {
                  selectedAnimation: vnode.state.selectedAnimation,
                  zoomLevel: vnode.state.zoomLevel,
                  onFrameCycleUpdate: (frameCycle) => {
                    vnode.state.frameCycle = frameCycle;
                  },
                }),
                state.isRenderingCharacter
                  ? m("div.preview-canvas-busy", { "aria-hidden": true }, [
                      m("span.loading", {
                        "aria-label": "正在渲染角色",
                      }),
                    ])
                  : null,
                m(PreviewMetadataLoadingOverlay),
              ]),
            ]),
          ]),
        ]),
      ],
    );
  },
};

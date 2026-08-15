// Download a single direction of a selected animation as a one-row spritesheet PNG.
import { err, type Result } from "neverthrow";
import {
  ANIMATION_CONFIGS,
  DIRECTIONS,
  FRAME_SIZE,
} from "../state/constants.ts";
import { canvas as renderCanvas, SHEET_WIDTH } from "./renderer.ts";
import { customAnimations } from "../custom-animations.ts";
import { customAnimYPositions } from "./preview-animation.ts";
import { canvasToBlob, get2DContext } from "./canvas-utils.ts";
import {
  checkFrameContentFromImageData,
  newAnimationFromSheet,
} from "../utils/zip-helpers.ts";
import { triggerBlobDownload } from "./download.ts";
import { state } from "../state/state.ts";

/** A direction option for the Animation Preview direction selector. */
export type AnimationDirectionOption = {
  value: string;
  label: string;
  /** Directions that do not exist for the selected animation are disabled. */
  available: boolean;
};

type AnimationConfigEntry = {
  row: number;
  num: number;
  cycle: number[];
};

/**
 * Number of direction rows the animation has on the render canvas.
 * Standard animations expose `num` rows (usually 4); custom animations expose
 * one row per direction in their `frames` definition.
 */
export function getAnimationDirectionRowCount(animationName: string): number {
  const customDef = customAnimations[animationName];
  if (customDef) {
    return customDef.frames.length;
  }

  const config = (
    ANIMATION_CONFIGS as Record<string, AnimationConfigEntry | undefined>
  )[animationName];
  return config ? config.num : 0;
}

/** Whether the animation has a row for the given direction. */
export function isAnimationDirectionAvailable(
  animationName: string,
  direction: string,
): boolean {
  const dirIndex = DIRECTIONS.indexOf(direction);
  return (
    dirIndex >= 0 && dirIndex < getAnimationDirectionRowCount(animationName)
  );
}

/** Direction options for the selector, in LPC order (up, left, down, right). */
export function getAnimationDirectionOptions(
  animationName: string,
): AnimationDirectionOption[] {
  const rowCount = getAnimationDirectionRowCount(animationName);
  return DIRECTIONS.map((direction, index) => ({
    value: direction,
    label: direction.charAt(0).toUpperCase() + direction.slice(1),
    available: index < rowCount,
  }));
}

/**
 * Find the last 64px frame column with content in a pre-fetched row. Returns
 * -1 when the whole row is transparent.
 */
function findLastNonEmptyFrameColumn(
  rowImageData: ImageData,
  frameWidth: number,
  frameHeight: number,
): number {
  const frameCount = Math.floor(rowImageData.width / frameWidth);
  for (let col = frameCount - 1; col >= 0; col--) {
    if (
      checkFrameContentFromImageData(
        rowImageData,
        col * frameWidth,
        frameWidth,
        frameHeight,
      )
    ) {
      return col;
    }
  }
  return -1;
}

/**
 * Extract the spritesheet row for one animation + one direction from the main
 * render canvas. Standard rows are trimmed to their last non-empty frame
 * column; custom animation rows use the exact width from their definition.
 * Errs when the canvas is unavailable, the direction does not exist, or the
 * row has no rendered content.
 */
export function extractAnimationDirectionCanvas(
  animationName: string,
  direction: string,
): Result<HTMLCanvasElement, string> {
  if (!renderCanvas) {
    return err("Character canvas is not ready yet.");
  }

  const dirIndex = DIRECTIONS.indexOf(direction);
  if (
    dirIndex < 0 ||
    dirIndex >= getAnimationDirectionRowCount(animationName)
  ) {
    return err(
      `Direction "${direction}" is not available for animation "${animationName}".`,
    );
  }

  const customDef = customAnimations[animationName];
  if (customDef) {
    const yPos = customAnimYPositions[animationName];
    if (yPos === undefined) {
      return err(
        `Custom animation "${animationName}" is not present in the current render.`,
      );
    }
    const frameSize = customDef.frameSize;
    const frameCount = customDef.frames[dirIndex]?.length ?? 0;
    if (frameCount === 0) {
      return err(
        `Custom animation "${animationName}" has no frames for direction "${direction}".`,
      );
    }

    const rowResult = newAnimationFromSheet(renderCanvas, {
      x: 0,
      y: yPos + dirIndex * frameSize,
      width: frameCount * frameSize,
      height: frameSize,
    });
    return rowResult.mapErr(
      () =>
        `Custom animation "${animationName}" has no rendered content for direction "${direction}".`,
    );
  }

  const config = (
    ANIMATION_CONFIGS as Record<string, AnimationConfigEntry | undefined>
  )[animationName];
  if (!config) {
    return err(`Unknown animation: "${animationName}".`);
  }

  const srcY = config.row * FRAME_SIZE + dirIndex * FRAME_SIZE;
  const rowWidth = Math.min(SHEET_WIDTH, renderCanvas.width);

  let rowImageData: ImageData;
  try {
    const readCtx = get2DContext(renderCanvas, true);
    rowImageData = readCtx.getImageData(0, srcY, rowWidth, FRAME_SIZE);
  } catch (e) {
    console.error("Failed to read animation row from canvas:", e);
    return err("Failed to read the animation row from the canvas.");
  }

  const lastFrameColumn = findLastNonEmptyFrameColumn(
    rowImageData,
    FRAME_SIZE,
    FRAME_SIZE,
  );
  if (lastFrameColumn < 0) {
    return err(
      `Animation "${animationName}" has no rendered content for direction "${direction}".`,
    );
  }

  const rowResult = newAnimationFromSheet(renderCanvas, {
    x: 0,
    y: srcY,
    width: (lastFrameColumn + 1) * FRAME_SIZE,
    height: FRAME_SIZE,
  });
  return rowResult.mapErr(
    () =>
      `Animation "${animationName}" has no rendered content for direction "${direction}".`,
  );
}

/**
 * Download the selected animation's single-direction row as a PNG
 * (`lpc_<bodyType>_<animation>_<direction>.png`).
 */
export async function downloadAnimationDirectionPNG(
  animationName: string,
  direction: string,
): Promise<{ success: boolean; message: string }> {
  const extractResult = extractAnimationDirectionCanvas(
    animationName,
    direction,
  );
  if (extractResult.isErr()) {
    return { success: false, message: extractResult.error };
  }

  try {
    const blob = await canvasToBlob(extractResult.value);
    const filename = `lpc_${state.bodyType}_${animationName}_${direction}.png`;
    triggerBlobDownload(blob, filename);
    return { success: true, message: filename };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: `PNG encoding failed: ${msg}` };
  }
}

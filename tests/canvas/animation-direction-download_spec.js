import { expect } from "chai";
import sinon from "sinon";
import { describe, it, beforeEach, afterEach } from "mocha-globals";
import {
  downloadAnimationDirectionPNG,
  extractAnimationDirectionCanvas,
  getAnimationDirectionOptions,
  getAnimationDirectionRowCount,
  isAnimationDirectionAvailable,
} from "../../sources/canvas/animation-direction-download.ts";
import {
  getCanvas,
  initCanvas,
  resetOffscreenCanvasStateForTests,
} from "../../sources/canvas/renderer.ts";
import { setCustomAnimYPositions } from "../../sources/canvas/preview-animation.ts";

const FRAME_SIZE = 64;

function getRendererCanvas() {
  const result = getCanvas();
  expect(result.isOk()).to.equal(true);
  return result._unsafeUnwrap();
}

describe("canvas/animation-direction-download.ts", () => {
  afterEach(() => {
    resetOffscreenCanvasStateForTests();
    setCustomAnimYPositions({});
    sinon.restore();
  });

  describe("getAnimationDirectionRowCount", () => {
    it("returns 4 rows for a four-direction standard animation", () => {
      expect(getAnimationDirectionRowCount("walk")).to.equal(4);
    });

    it("returns 1 row for a single-row standard animation", () => {
      expect(getAnimationDirectionRowCount("hurt")).to.equal(1);
      expect(getAnimationDirectionRowCount("climb")).to.equal(1);
    });

    it("returns 4 rows for a custom animation", () => {
      expect(getAnimationDirectionRowCount("wheelchair")).to.equal(4);
    });

    it("returns 0 rows for an unknown animation", () => {
      expect(getAnimationDirectionRowCount("does-not-exist")).to.equal(0);
    });
  });

  describe("isAnimationDirectionAvailable", () => {
    it("allows all four directions for walk", () => {
      for (const direction of ["up", "left", "down", "right"]) {
        expect(isAnimationDirectionAvailable("walk", direction)).to.equal(true);
      }
    });

    it("only allows the first row for hurt", () => {
      expect(isAnimationDirectionAvailable("hurt", "up")).to.equal(true);
      expect(isAnimationDirectionAvailable("hurt", "down")).to.equal(false);
    });

    it("rejects unknown directions", () => {
      expect(isAnimationDirectionAvailable("walk", "sideways")).to.equal(false);
    });
  });

  describe("getAnimationDirectionOptions", () => {
    it("returns all directions available for walk", () => {
      const options = getAnimationDirectionOptions("walk");
      expect(options.map((o) => o.value)).to.deep.equal([
        "up",
        "left",
        "down",
        "right",
      ]);
      expect(options.every((o) => o.available)).to.equal(true);
    });

    it("disables unavailable directions for single-row animations", () => {
      const options = getAnimationDirectionOptions("hurt");
      expect(
        options.filter((o) => o.available).map((o) => o.value),
      ).to.deep.equal(["up"]);
    });
  });

  describe("extractAnimationDirectionCanvas", () => {
    beforeEach(() => {
      initCanvas();
    });

    it("extracts a standard animation direction row trimmed to non-empty frames", () => {
      const canvas = getRendererCanvas();
      const ctx = canvas.getContext("2d");
      // walk row is 8; "down" is direction index 2 → y = (8 + 2) * 64
      const srcY = 10 * FRAME_SIZE;
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, srcY, FRAME_SIZE * 3, FRAME_SIZE);

      const result = extractAnimationDirectionCanvas("walk", "down");
      expect(result.isOk()).to.equal(true);
      const out = result._unsafeUnwrap();
      expect(out.width).to.equal(FRAME_SIZE * 3);
      expect(out.height).to.equal(FRAME_SIZE);

      const pixel = out.getContext("2d").getImageData(0, 0, 1, 1).data;
      expect([pixel[0], pixel[1], pixel[2], pixel[3]]).to.deep.equal([
        255, 0, 0, 255,
      ]);
    });

    it("keeps leading empty frames and only trims trailing ones", () => {
      const canvas = getRendererCanvas();
      const ctx = canvas.getContext("2d");
      const srcY = 10 * FRAME_SIZE;
      // content only in the third frame column (x = 2 * 64)
      ctx.fillStyle = "#00ff00";
      ctx.fillRect(2 * FRAME_SIZE, srcY, FRAME_SIZE, FRAME_SIZE);

      const result = extractAnimationDirectionCanvas("walk", "down");
      expect(result.isOk()).to.equal(true);
      expect(result._unsafeUnwrap().width).to.equal(FRAME_SIZE * 3);
    });

    it("extracts a custom animation direction row with its exact width", () => {
      setCustomAnimYPositions({ wheelchair: 3456 });
      const canvas = getRendererCanvas();
      canvas.height = 3456 + 256;
      const ctx = canvas.getContext("2d");
      // wheelchair frames: row 2 is "down", 2 frames of 64px
      const srcY = 3456 + 2 * FRAME_SIZE;
      ctx.fillStyle = "#0000ff";
      ctx.fillRect(0, srcY, FRAME_SIZE * 2, FRAME_SIZE);

      const result = extractAnimationDirectionCanvas("wheelchair", "down");
      expect(result.isOk()).to.equal(true);
      const out = result._unsafeUnwrap();
      expect(out.width).to.equal(FRAME_SIZE * 2);
      expect(out.height).to.equal(FRAME_SIZE);
      const pixel = out.getContext("2d").getImageData(0, 0, 1, 1).data;
      expect(pixel[2]).to.equal(255);
    });

    it("errs when the canvas is not initialized", () => {
      resetOffscreenCanvasStateForTests();
      const result = extractAnimationDirectionCanvas("walk", "down");
      expect(result.isErr()).to.equal(true);
      if (result.isErr()) {
        expect(result.error).to.contain("尚未准备好");
      }
    });

    it("errs for an unavailable direction", () => {
      const result = extractAnimationDirectionCanvas("hurt", "down");
      expect(result.isErr()).to.equal(true);
      if (result.isErr()) {
        expect(result.error).to.contain("不提供方向");
      }
    });

    it("errs when the direction row has no rendered content", () => {
      const result = extractAnimationDirectionCanvas("walk", "down");
      expect(result.isErr()).to.equal(true);
      if (result.isErr()) {
        expect(result.error).to.contain("没有已渲染内容");
      }
    });
  });

  describe("downloadAnimationDirectionPNG", () => {
    let createObjectURLStub, revokeObjectURLStub, clickStub;

    beforeEach(() => {
      clickStub = undefined;
      createObjectURLStub = sinon
        .stub(URL, "createObjectURL")
        .returns("blob:url");
      revokeObjectURLStub = sinon.stub(URL, "revokeObjectURL");
      const realCreateElement = document.createElement.bind(document);
      sinon.stub(document, "createElement").callsFake((tag) => {
        if (tag === "a") {
          const anchor = realCreateElement("a");
          anchor.click = sinon.stub();
          clickStub = anchor.click;
          return anchor;
        }
        return realCreateElement(tag);
      });
      initCanvas();
    });

    it("downloads the selected animation direction as a PNG", async () => {
      const canvas = getRendererCanvas();
      const ctx = canvas.getContext("2d");
      const srcY = 10 * FRAME_SIZE;
      ctx.fillStyle = "#123456";
      ctx.fillRect(0, srcY, FRAME_SIZE * 2, FRAME_SIZE);

      const result = await downloadAnimationDirectionPNG("walk", "down");

      expect(result.success).to.equal(true);
      expect(result.message).to.equal("lpc_male_walk_down.png");
      expect(createObjectURLStub.calledOnce).to.equal(true);
      expect(clickStub.calledOnce).to.equal(true);
      expect(revokeObjectURLStub.calledOnceWith("blob:url")).to.equal(true);
    });

    it("reports failure without downloading when the row is empty", async () => {
      const result = await downloadAnimationDirectionPNG("walk", "down");

      expect(result.success).to.equal(false);
      expect(createObjectURLStub.called).to.equal(false);
      expect(clickStub?.called ?? false).to.equal(false);
    });
  });
});

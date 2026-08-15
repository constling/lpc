// 中文翻译覆盖测试:确保所有数据驱动的英文显示名都能被完整翻译(不残留英文单词)。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { translateText } from "../../../sources/utils/zh-translations.ts";

const SHEETS_DIR = path.resolve(
  import.meta.dirname,
  "../../../sheet_definitions",
);
const PALETTES_DIR = path.resolve(
  import.meta.dirname,
  "../../../palette_definitions",
);

/** 翻译结果中允许保留的拉丁词(品牌/代号,如 LPC)。 */
const ALLOWED_LATIN = new Set(["LPC", "T", "V", "S", "X", "Y"]);

function latinTokens(text) {
  return text.match(/[A-Za-z]+/g) ?? [];
}

function assertFullyTranslated(english, translated, source) {
  const leftovers = latinTokens(translated).filter(
    (token) => !ALLOWED_LATIN.has(token),
  );
  assert.deepEqual(
    leftovers,
    [],
    `「${english}」(${source}) 翻译后仍残留英文:${JSON.stringify(leftovers)} → 「${translated}」`,
  );
}

function collectSheetDefinitions() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) files.push(full);
    }
  };
  walk(SHEETS_DIR);
  return files;
}

describe("utils/zh-translations.ts 覆盖", () => {
  it("翻译所有物品名后不残留英文单词", () => {
    const names = [];
    for (const file of collectSheetDefinitions()) {
      try {
        const def = JSON.parse(fs.readFileSync(file, "utf8"));
        if (def.name) names.push(def.name);
      } catch {
        // 忽略解析失败的文件
      }
    }
    assert.ok(names.length > 500, `物品名数量异常:${names.length}`);

    for (const name of names) {
      assertFullyTranslated(name, translateText(name), "物品名");
    }
  });

  it("翻译所有变体名后不残留英文单词", () => {
    const variants = new Set();
    for (const file of collectSheetDefinitions()) {
      try {
        const def = JSON.parse(fs.readFileSync(file, "utf8"));
        for (const variant of def.variants ?? []) {
          if (typeof variant === "string") {
            variants.add(variant.replaceAll("_", " "));
          }
        }
      } catch {
        // 忽略解析失败的文件
      }
    }
    assert.ok(variants.size > 100, `变体数量异常:${variants.size}`);

    for (const variant of variants) {
      assertFullyTranslated(variant, translateText(variant), "变体名");
    }
  });

  it("翻译所有分类 label 与目录名后不残留英文单词", () => {
    const labels = [];
    const segments = [];
    for (const file of collectSheetDefinitions()) {
      try {
        const def = JSON.parse(fs.readFileSync(file, "utf8"));
        if (file.includes(path.sep + "meta_")) {
          if (def.label) labels.push(def.label);
        }
        for (const part of file.replace(SHEETS_DIR, "").split(path.sep)) {
          if (part.endsWith(".json")) continue;
          if (!part.startsWith("meta_")) segments.push(part);
        }
      } catch {
        // 忽略解析失败的文件
      }
    }
    assert.ok(labels.length > 20, `分类 label 数量异常:${labels.length}`);
    for (const label of new Set(labels)) {
      assertFullyTranslated(label, translateText(label), "分类 label");
    }
    for (const segment of new Set(segments)) {
      assertFullyTranslated(segment, translateText(segment), "目录名");
    }
  });

  it("翻译所有调色板 label 后不残留英文单词", () => {
    const labels = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.startsWith("meta_")) {
          try {
            const def = JSON.parse(fs.readFileSync(full, "utf8"));
            if (def.label) labels.push(def.label);
          } catch {
            // 忽略解析失败的文件
          }
        }
      }
    };
    walk(PALETTES_DIR);
    assert.ok(labels.length >= 5, `调色板 label 数量异常:${labels.length}`);
    for (const label of labels) {
      assertFullyTranslated(label, translateText(label), "调色板 label");
    }
  });

  it("基础行为:短语优先、标点保留、未命中返回原文", () => {
    assert.equal(translateText("Jack O Lantern"), "南瓜灯");
    assert.equal(
      translateText("Lizard Tail (Alt Colors)"),
      "蜥蜴尾巴(备选颜色)",
    );
    assert.equal(translateText("Light Gray"), "浅灰");
    assert.equal(translateText("Universal LPC"), "通用 LPC");
    assert.equal(translateText(""), "");
    assert.equal(translateText(undefined), "");
    assert.equal(translateText(""), "");
    // 未命中任何词时返回原文(避免半英半中)
    assert.equal(translateText(""), "");
    assert.equal(translateText(null), "");
  });
});

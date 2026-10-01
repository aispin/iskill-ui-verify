#!/usr/bin/env node
/**
 * ui.mjs —— 无头浏览器「批量截图 + 断言」薄封装
 *
 * 它自己不实现浏览器控制，只做一件 agent 最容易写错、也最费 token 的事：
 * 把「变体矩阵 × 截图」或「一批断言」编译成 agent-browser 的 batch JSON，
 * 跑完一个浏览器会话后自动关闭，并把结果压成一张能一眼判读的表。
 *
 * 依赖：agent-browser（已自带 Chromium，无需 Playwright / npm 依赖）
 *
 *   ui.mjs shots --url <URL> [--out DIR] [--name PREFIX]
 *                [--matrix "theme=light,dark"] [--matrix "lang=zh,en"] ...
 *                [--select <CSS>]... [--full]
 *                [--width 1180] [--height 940] [--scale 2] [--wait 2500]
 *                [--headed] [--json]
 *
 *   ui.mjs check --url <URL> [--case "名称=JS表达式"]... [--json]
 *                [--wait 2500] [--width] [--height] [--scale] [--headed]
 *
 * 退出码：0 全部成功 / 1 有失败 / 2 参数或环境错误
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// ─────────────────────────── agent-browser 定位 ───────────────────────────

function resolveAgentBrowser() {
  if (process.env.AGENT_BROWSER) return process.env.AGENT_BROWSER;

  const probe = spawnSync("agent-browser", ["--version"], { encoding: "utf8" });
  if (!probe.error) return "agent-browser";

  // PATH 里没有（WorkBuddy 沙箱的非交互 shell 常缺 managed node 的 bin）
  const roots = [
    join(homedir(), ".workbuddy", "binaries", "node", "versions"),
    join(homedir(), ".nvm", "versions", "node"),
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const v of readdirSync(root).sort().reverse()) {
      for (const rel of ["bin/agent-browser", "agent-browser"]) {
        const p = join(root, v, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

const AB = resolveAgentBrowser();
if (!AB) {
  console.error("✗ 找不到 agent-browser。安装：npm i -g agent-browser && agent-browser install");
  console.error("  或设 AGENT_BROWSER=/绝对/路径/agent-browser 指定。");
  process.exit(2);
}

/** 跑一批 agent-browser 命令，返回逐条结果。 */
function batch(cmds, { session = "ui-verify" } = {}) {
  const r = spawnSync(AB, ["--session", session, "batch", "--json"], {
    input: JSON.stringify(cmds),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) throw new Error("无法执行 agent-browser：" + r.error.message);
  const out = (r.stdout || "").trim();
  if (!out) {
    throw new Error(
      "agent-browser 无输出（退出码 " + r.status + "）\n" + (r.stderr || "").trim()
    );
  }
  try {
    return JSON.parse(out);
  } catch {
    throw new Error("无法解析 agent-browser 输出：\n" + out.slice(0, 600));
  }
}

// ─────────────────────────────── 参数解析 ───────────────────────────────

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    const val = next !== undefined && !next.startsWith("--") ? argv[++i] : true;
    if (key in out) out[key] = [].concat(out[key], val);
    else out[key] = val;
  }
  return out;
}

const list = (v) => (v === undefined ? [] : [].concat(v));
const num = (v, d) => (v === undefined ? d : Number(v));

function die(msg) {
  console.error("✗ " + msg);
  process.exit(2);
}

function slug(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

function kb(file) {
  try {
    return Math.round(statSync(file).size / 1024) + " KB";
  } catch {
    return "缺失";
  }
}

// ─────────────────────────────── shots ───────────────────────────────

function cmdShots(args) {
  const url = args.url;
  if (typeof url !== "string") die("shots 需要 --url <URL>");

  const outDir = resolve(String(args.out || "/tmp/ui-shots"));
  const prefix = slug(args.name || "shot");
  const width = num(args.width, 1180);
  const height = num(args.height, 940);
  const scale = num(args.scale, 2);
  const waitMs = num(args.wait, 2500);
  const full = !!args.full;
  const headed = !!args.headed;
  const selects = list(args.select).filter((s) => typeof s === "string" && s);

  // --matrix "key=v1,v2" ；其中 key=media 走浏览器媒体模拟，其余走 URL 查询参数
  const dims = list(args.matrix).map((spec) => {
    const i = String(spec).indexOf("=");
    if (i < 0) die(`--matrix 需要 key=v1,v2 形式，收到：${spec}`);
    return { key: String(spec).slice(0, i), values: String(spec).slice(i + 1).split(",") };
  });

  const variants = dims.length
    ? dims.reduce(
        (acc, d) => acc.flatMap((base) => d.values.map((v) => [...base, { key: d.key, value: v }])),
        [[]]
      )
    : [[]];

  mkdirSync(outDir, { recursive: true });

  const cmds = [];
  const plan = []; // 与 cmds 等长，标记哪条是截图、产出到哪

  for (const dimset of variants) {
    const u = new URL(url);
    let media = null;
    for (const d of dimset) {
      if (d.key === "media") media = d.value;
      else u.searchParams.set(d.key, d.value);
    }
    const label = dimset.length ? dimset.map((d) => `${d.key}-${slug(d.value)}`).join("_") : "default";

    cmds.push(headed ? ["open", u.toString(), "--headed"] : ["open", u.toString()]);
    plan.push(null);
    cmds.push(["set", "viewport", String(width), String(height), String(scale)]);
    plan.push(null);
    if (media) {
      cmds.push(["set", "media", media]);
      plan.push(null);
    }
    cmds.push(["wait", String(waitMs)]);
    plan.push(null);

    const shots = selects.length ? selects : [null];
    for (const sel of shots) {
      const file = join(outDir, `${prefix}-${label}${sel ? "-" + slug(sel) : ""}.png`);
      cmds.push(
        sel
          ? full
            ? ["screenshot", sel, "--full", file]
            : ["screenshot", sel, file]
          : full
            ? ["screenshot", "--full", file]
            : ["screenshot", file]
      );
      plan.push({ label, sel, file });
    }
  }
  cmds.push(["close", "--all"]);
  plan.push(null);

  const results = batch(cmds);

  const rows = [];
  let failed = 0;
  cmds.forEach((c, i) => {
    const p = plan[i];
    if (!p) return;
    const r = results[i] || {};
    const ok = !!r.success && existsSync(p.file) && statSync(p.file).size > 0;
    if (!ok) failed++;
    rows.push({ ...p, ok, error: r.error ? JSON.stringify(r.error).slice(0, 160) : null });
  });

  if (args.json) {
    console.log(JSON.stringify({ out: outDir, shots: rows }, null, 2));
  } else {
    const urls = new Set();
    for (const dimset of variants) {
      const u = new URL(url);
      for (const d of dimset) if (d.key !== "media") u.searchParams.set(d.key, d.value);
      urls.add(u.toString());
    }
    console.log(`产出目录 ${outDir}  ·  ${variants.length} 变体 × ${selects.length || 1} 目标  ·  ${width}×${height}@${scale}x${full ? " full" : ""}`);
    for (const r of rows) {
      console.log(
        `${r.ok ? "✓" : "✗"} ${r.label.padEnd(28)} ${r.sel ? "<" + r.sel + "> " : ""}${r.file}` +
          (r.ok ? `  ${kb(r.file)}` : `  ${r.error || "未产出文件"}`)
      );
    }
    if (urls.size) console.log("URL：" + [...urls].join("  "));
  }

  return failed ? 1 : 0;
}

// ─────────────────────────────── check ───────────────────────────────

function cmdCheck(args) {
  const url = args.url;
  if (typeof url !== "string") die("check 需要 --url <URL>");

  const cases = list(args.case).map((spec) => {
    const i = String(spec).indexOf("=");
    if (i < 0) die(`--case 需要 "名称=JS表达式" 形式，收到：${spec}`);
    return { name: String(spec).slice(0, i), js: String(spec).slice(i + 1) };
  });
  if (!cases.length) die(`check 至少需要一个 --case "名称=JS表达式"`);

  const width = num(args.width, 1180);
  const height = num(args.height, 940);
  const scale = num(args.scale, 2);
  const waitMs = num(args.wait, 2500);
  const headed = !!args.headed;

  const cmds = [
    headed ? ["open", url, "--headed"] : ["open", url],
    ["set", "viewport", String(width), String(height), String(scale)],
    ["wait", String(waitMs)],
    ["eval", "document.title || '(无标题)'"],
    ...cases.map((c) => ["eval", c.js]),
    ["close", "--all"],
  ];

  const results = batch(cmds);

  const titleR = results[3] || {};
  if (!titleR.success) {
    console.error(`✗ 页面打不开或 eval 失败：${url}`);
    console.error("  " + JSON.stringify(titleR.error || titleR).slice(0, 300));
    return 2;
  }
  const title = (titleR.result && titleR.result.result) || "(无标题)";

  const rows = cases.map((c, i) => {
    const r = results[4 + i] || {};
    const value = r.success ? (r.result && r.result.result) : undefined;
    const pass = r.success && !!value;
    return {
      name: c.name,
      pass,
      value: pass ? value : value,
      error: r.error ? JSON.stringify(r.error).slice(0, 160) : null,
    };
  });
  const failed = rows.filter((r) => !r.pass).length;

  if (args.json) {
    console.log(JSON.stringify({ url, title, cases: rows, failed }, null, 2));
  } else {
    console.log(`页面：${title}  ·  ${url}`);
    for (const r of rows) {
      const shown = r.value === undefined ? r.error || "(无返回值)" : JSON.stringify(r.value).slice(0, 120);
      console.log(`${r.pass ? "✓" : "✗"} ${r.name.padEnd(30)} ${shown}`);
    }
    console.log(`${rows.length - failed}/${rows.length} 通过`);
  }
  return failed ? 1 : 0;
}

// ──────────────────────────────── main ────────────────────────────────

const argv = process.argv.slice(2);
const sub = argv[0];
if (!sub || sub === "--help" || sub === "-h") {
  console.log(
    "用法：\n" +
      "  ui.mjs shots --url URL [--out DIR] [--matrix \"theme=light,dark\"] [--select CSS] [--full] [--json]\n" +
      "  ui.mjs check --url URL --case \"名称=JS表达式\" [--json]\n"
  );
  process.exit(0);
}

const args = parseArgs(argv.slice(1));
let code;
try {
  if (sub === "shots") code = cmdShots(args);
  else if (sub === "check") code = cmdCheck(args);
  else die(`未知子命令：${sub}（支持 shots / check）`);
} catch (e) {
  console.error("✗ " + e.message);
  code = 2;
}
process.exit(code);

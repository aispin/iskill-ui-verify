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
 *                [--session NAME] [--headed] [--json]
 *
 *   ui.mjs check --url <URL> [--case "名称=JS表达式"]... [--json]
 *                [--wait 2500] [--width] [--height] [--scale]
 *                [--session NAME] [--headed]
 *
 * 退出码：0 全部成功 / 1 有失败 / 2 参数或环境错误
 *
 * 会话名：默认按「子命令 + 端口/主机 + 进程号 + 时间戳」派生，多次/并发运行
 * 互不干扰（早前硬编码 session 会互相抢同一个浏览器会话，实测会把别的页面
 * 的标题读成断言结果）。需要固定会话时用 --session 显式指定。
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
function batch(cmds, session) {
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

/**
 * 派生一个本次运行独占的 agent-browser 会话名。
 *
 * 为什么不能写死（2026-10-02 实锤）：并发/连续跑两个 ui.mjs 会用同一个会话，
 * 浏览器里只留最后一次 open 的页面 —— en 断言读到的是别的技能的标题，
 * 结果「看起来全绿」但完全是错的。带上端口/主机 + 进程号 + 时间戳即可隔离。
 */
function sessionName(args, kind) {
  if (typeof args.session === "string" && args.session && args.session !== true) {
    return slug(args.session);
  }
  let tag = "";
  try {
    const u = new URL(String(args.url));
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
    tag = local ? u.port || (u.protocol === "https:" ? "443" : "80") : u.hostname;
  } catch {
    tag = "";
  }
  return slug(`ui-${kind}-${tag}-${process.pid}-${Date.now().toString(36)}`);
}

function bytes(file) {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}
function kb(n) {
  return Math.round(n / 1024) + " KB";
}

/** 一屏内的最小体积：低于它基本可以断定是空白图（纯背景色压得极小）。 */
const BLANK_BYTES = 1400;

// ─────────────────────────────── shots ───────────────────────────────

/** 量出这些选择器在文档里的最大底边（用于把视口撑到够高）。 */
function measureExpr(selectors) {
  return (
    "(()=>{const sels=" +
    JSON.stringify(selectors) +
    ";let b=0;for(const s of sels){const e=document.querySelector(s);" +
    "if(e){const r=e.getBoundingClientRect();b=Math.max(b,r.bottom)}}return Math.ceil(b)})()"
  );
}

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

  const session = sessionName(args, "shots");
  const rows = [];
  const urls = new Set();

  try {
    for (const dimset of variants) {
      const u = new URL(url);
      let media = null;
      for (const d of dimset) {
        if (d.key === "media") media = d.value;
        else u.searchParams.set(d.key, d.value);
      }
      urls.add(u.toString());
      const label = dimset.length
        ? dimset.map((d) => `${d.key}-${slug(d.value)}`).join("_")
        : "default";

      const setup = [headed ? ["open", u.toString(), "--headed"] : ["open", u.toString()]];
      setup.push(["set", "viewport", String(width), String(height), String(scale)]);
      if (media) setup.push(["set", "media", media]);
      setup.push(["wait", String(waitMs)]);
      // 懒加载图片会让元素盒子在截图那一刻还是「没图时」的高度 —— 先顶成 eager 再等它加载。
      if (full || selects.length) {
        setup.push([
          "eval",
          "(()=>{document.querySelectorAll('img[loading=lazy]').forEach(i=>{i.loading='eager'});return document.images.length})()",
        ]);
        setup.push(["wait", "900"]);
      }
      // 元素截图必须先让目标落进视口 —— 否则 Chrome 会截到一片空白（见文件尾注释）
      if (selects.length) setup.push(["eval", measureExpr(selects)]);

      const sres = batch(setup, session);
      const bad = sres.findIndex((r) => !r.success);
      if (bad >= 0) {
        rows.push({
          label,
          sel: null,
          file: "—",
          ok: false,
          error:
            "第 " + (bad + 1) + " 步失败：" +
            JSON.stringify((sres[bad] || {}).error || {}).slice(0, 140),
        });
        continue;
      }

      // 视口不够高就把高度撑到能容纳目标元素（宽度不动，响应式断点不受影响）
      if (selects.length) {
        const last = sres[sres.length - 1];
        const bottom = Number((last.result && last.result.result) || 0);
        if (bottom > height) {
          const grown = Math.ceil(bottom) + 40;
          batch([["set", "viewport", String(width), String(grown), String(scale)], ["wait", "700"]], session);
        }
      }

      const shots = selects.length ? selects : [null];
      const cmds = [];
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
      }
      const rres = batch(cmds, session);

      cmds.forEach((c, i) => {
        const file = c[c.length - 1];
        const r = rres[i] || {};
        const size = bytes(file);
        const ok = !!r.success && size > 0;
        rows.push({
          label,
          sel: shots[i],
          file,
          size,
          ok,
          blank: ok && size < BLANK_BYTES,
          error: r.error ? JSON.stringify(r.error).slice(0, 160) : ok ? null : "未产出文件",
        });
      });
    }
  } finally {
    try {
      batch([["close", "--all"]], session);
    } catch {
      /* 收尾失败不覆盖真实错误 */
    }
  }

  const failed = rows.filter((r) => !r.ok).length;
  const blanks = rows.filter((r) => r.blank).length;

  if (args.json) {
    console.log(JSON.stringify({ out: outDir, shots: rows }, null, 2));
  } else {
    console.log(
      `产出目录 ${outDir}  ·  ${variants.length} 变体 × ${selects.length || 1} 目标  ·  ${width}×${height}@${scale}x${full ? " full" : ""}`
    );
    for (const r of rows) {
      const flag = !r.ok ? "✗" : r.blank ? "⚠" : "✓";
      console.log(
        `${flag} ${r.label.padEnd(28)} ${r.sel ? "<" + r.sel + "> " : ""}${r.file}` +
          (r.ok ? `  ${kb(r.size)}` : `  ${r.error}`) +
          (r.blank ? "  ← 体积异常小，疑似空白" : "")
      );
    }
    if (urls.size) console.log("URL：" + [...urls].join("  "));
    if (blanks) {
      console.log(
        `⚠ 有 ${blanks} 张疑似空白。常见原因：目标元素在视口外（本脚本已自动撑高视口）、` +
          `页面用了滚动入场动画（加 ?reveal=all 之类的直达参数）、或选择器命中了空容器。`
      );
    }
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
  ];

  const session = sessionName(args, "check");
  let results;
  try {
    results = batch(cmds, session);
  } finally {
    try {
      batch([["close", "--all"]], session);
    } catch {
      /* ignore */
    }
  }

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
    return {
      name: c.name,
      pass: !!(r.success && value),
      value,
      error: r.error ? JSON.stringify(r.error).slice(0, 160) : null,
    };
  });
  const failed = rows.filter((r) => !r.pass).length;

  if (args.json) {
    console.log(JSON.stringify({ url, title, cases: rows, failed }, null, 2));
  } else {
    console.log(`页面：${title}  ·  ${url}`);
    for (const r of rows) {
      const shown =
        r.value === undefined ? r.error || "(无返回值)" : JSON.stringify(r.value).slice(0, 120);
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
      "  ui.mjs shots --url URL [--out DIR] [--matrix \"theme=light,dark\"] [--select CSS] [--full] [--session NAME] [--json]\n" +
      "  ui.mjs check --url URL --case \"名称=JS表达式\" [--session NAME] [--json]\n"
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

/* ─────────────────────────────────────────────────────────────────────────
 * 为什么要「先把视口撑高再截元素」（实测，2026-10-01）
 *
 * agent-browser 的 `screenshot <selector>` 内部把元素的**页面坐标**当作 clip
 * 传给 Chrome，但没有开 captureBeyondViewport。于是：
 *   视口 1180×3200（元素在视口内）→ 正常，109 KB
 *   视口 1180×940 （元素在视口外）→ 一张纯背景图，5 KB，而且**命令返回成功**
 * 先 scrollintoview 再截也没用（仍是 5 KB）。
 *
 * 所以本脚本在带 --select 时会先 eval 量出目标的最大底边，把视口高度撑到
 * 能容纳它（宽度不变，响应式断点不受影响），等 700ms 让滚动入场动画跑完，
 * 再截图；同时对体积异常小的产物打 ⚠ 提示，避免"静默拿到空白图"。
 * ───────────────────────────────────────────────────────────────────────── */

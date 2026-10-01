# 常用配方

所有命令假设：

```bash
AB=/Users/lv/.workbuddy/binaries/node/versions/22.22.2-3/bin/agent-browser
N=/Users/lv/.workbuddy/binaries/node/versions/22.22.2-3/bin/node
S=<SKILL_DIR>/scripts/ui.mjs
```

---

## 1. 标准验收循环（改完前端之后）

这是最常见的一条链，按顺序走，**别跳过断言直接截图**：

```bash
P=8786                      # 你的本地端口

# ① 断言：行为对不对（比截图更能定责）
$N $S check --url "http://127.0.0.1:$P/?theme=dark&lang=zh" --wait 2500 \
  --case "标题已更新=document.title.includes('新标题')" \
  --case "空态已消失=!document.body.innerText.includes('暂无数据')"

# ② 截图：观感对不对（多语言 × 明暗矩阵）
$N $S shots --url "http://127.0.0.1:$P/" --out /tmp/ui-shots --name page \
  --matrix "theme=light,dark" --matrix "lang=zh,en" --wait 2500
```

判读：断言全 ✓ 且四张图观感正确 → 交付。任一步 ✗ → 先修再复跑，**不要带着失败截图交付**。

---

## 2. 交互后再截图（点开菜单 / 切 tab / 填表单）

`shots` 只做「打开即截」。需要先交互就写 batch：

```bash
cat <<'JSON' | $AB batch --bail --json
[
  ["open", "http://127.0.0.1:3000"],
  ["set", "viewport", "1180", "940", "2"],
  ["wait", "1500"],
  ["snapshot", "-i"],
  ["click", "@e7"],
  ["wait", "600"],
  ["screenshot", "/tmp/after-click.png"],
  ["close"]
]
JSON
```

`snapshot -i` 会打印 `@eN` 引用表，**照着表点**，别猜 CSS 选择器——这是省掉最多重试的一步。点完页面变了要重新 `snapshot -i`，旧 ref 会失效。

---

## 3. 剪贴板验证（"复制按钮真的复制到了吗"）

只截图**证明不了**复制成功，必须读回剪贴板比对：

```bash
cat <<'JSON' | $AB batch --bail --json
[
  ["open", "http://127.0.0.1:3000"],
  ["wait", "1500"],
  ["click", "button[aria-label=复制]"],
  ["wait", "500"],
  ["clipboard", "read"],
  ["close"]
]
JSON
```

再加一条 `check` 断言读回值等于期望字符串，才算闭环。（跨源 iframe 里 `navigator.clipboard` 会被权限策略拒，页面侧的降级链见 iskill-headroom-workbuddy 的踩坑笔记。）

---

## 4. 视觉回归（改样式前后对比）

```bash
$AB diff screenshot --baseline /tmp/before.png    # 当前页 vs 基线图
$AB diff url http://a.example / http://b.example  # 两个页面互比
```

适合确认"只改了目标卡片、没波及别处"。基线图就用上一轮 `shots` 的产物。

---

## 5. 报错巡检（别只看截图好看）

```bash
$AB console        # 页面 console 输出
$AB errors         # 未捕获异常
$AB network requests --filter api   # 出问题的请求
```

截图正常但 console 一片红是很常见的，UI 验收应顺带看一眼。

---

## 6. 给多模态模型看的标注图

```bash
$AB screenshot --annotate /tmp/map.png
```

每个可交互元素叠一个 `[N]` 标号，并打印对应 `@eN` 的图例——比让人/模型自己找元素位置省事。

---

## 7. 响应式与设备模拟

```bash
$AB set viewport 390 844 3              # 手机尺寸 + 3x
$AB set device "iPhone 12"              # 直接套设备档
$AB set media light                     # 强制浅色（验证深色模式下没有硬编码色）
```

页面若用 `prefers-color-scheme` 而不是 URL 参数切主题，就用 `ui.mjs shots --matrix "media=light,dark"`。

---

## 8. 需要用户的登录态

本技能默认用**全新独立 profile**（无任何登录）。要复用用户真实登录态：

- 走 `browser-cdp` 技能：它负责以调试端口启动用户的 Chrome、复制 profile，然后 `agent-browser --cdp 9222 ...` 复用。
- ⚠️ 那条路会**杀掉用户正在跑的 Chrome**，必须先征得同意。

---

## 9. 什么时候真的需要手写 CDP

以下场景 agent-browser 覆盖不到，才回到裸 CDP（并且**先看看有没有现成笔记**，别从零写）：

- 抓 **netlog / 请求头凭据**（`--log-net-log`，且抓包开关常驻，必须配还原档位）
- 需要 `Browser.grantPermissions` 这类**浏览器级 target** 操作
- 非 HTTP 协议或需要精确控制帧级时序
- Electron 应用内部（`agent-browser skills get electron` 有专门指引）

裸 CDP 的两个必备知识：Node 20+ 自带全局 `WebSocket`（不必装 `ws`）；`Browser.grantPermissions` 必须发到**浏览器级 target**（不带 `sessionId`），挂 page session 上会静默不生效。

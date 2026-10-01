---
name: iskill-ui-verify
summary: 让 agent 用一行命令完成网页截图与 UI 验证，替掉每次手写的 80~135 行 CDP 样板代码。
description: 当 agent 需要「截图验证」——改完前端/网页后要看效果、要给用户看界面、要断言 DOM/文案/敏感信息、要做多语言×多主题矩阵截图、要复现交互后再截图时使用。触发词：截图验证、看下效果、截个图、UI 验收、可视化验证、headless 截图、screenshot、视觉回归。底层复用已安装的 agent-browser（自带 Chromium），本技能只补「矩阵批量截图」与「断言批」两个高频封装 + 踩坑清单。
---

# iskill-ui-verify 截图与 UI 验证

**这个技能存在的唯一理由：省 token。** agent 做 UI 验证时，最容易的路径是「手写一段 CDP 脚本」——那是 80~135 行、约 4KB 的样板（起 Chrome、轮询端口、建 target、连 WebSocket、attach session、发命令、收 base64、落盘、杀进程），每次重写一遍约 1.2k~1.5k tokens，而且**第一次几乎总会踩坑**（点击坐标落视口外、权限要发到浏览器级 target、后台进程被回收…），重试成本远高于代码本身。

**结论：能用现成 CLI 就不要手写。** 本机已装 `agent-browser`（自带 Chromium 的 CDP CLI，无需 Playwright / npm 依赖），绝大多数需求一行命令即可。

---

## 一、先路由：哪档工具

| 场景 | 用什么 | 成本 |
|---|---|---|
| 只是读一个网页拿信息 | `agent-browser open` + `snapshot -i` | 一行 |
| **本地开发的应用/页面看效果、验收 UI** | 本技能 `ui.mjs shots` | 一行 |
| 断言 DOM / 文案 / 无敏感信息泄漏 | 本技能 `ui.mjs check` | 一行 |
| 需要点几下再截图（表单、切 tab） | `agent-browser batch` 的 stdin JSON | 5~10 行 JSON |
| 需要**复用用户真实登录态**的网站 | `browser-cdp` 技能（`agent-browser --cdp 9222` 连真实 Chrome） | — |
| 需要 netlog / 凭据 / 非 HTTP 协议 | 手写 CDP，别用本技能 | 高 |

> `agent-browser` 默认起**自己的独立 headless Chromium**（独立 profile），**不会碰用户日常 Chrome**。要连用户浏览器才走 `browser-cdp`。

---

## 二、快速参考（够用的子集）

```bash
# 定位可执行文件（沙箱非交互 shell 常缺 managed node 的 bin）
AB=/Users/lv/.workbuddy/binaries/node/versions/22.22.2-3/bin/agent-browser

$AB open <url>                     # 起浏览器并导航（默认 headless，--headed 显示窗口）
$AB set viewport 1180 940 2        # 第三参是 deviceScaleFactor，2 = retina
$AB set media dark                 # 模拟 prefers-color-scheme
$AB wait 2500                      # 也可 wait --load networkidle
$AB eval '<js 表达式>'              # 返回表达式结果（要多语句就包 IIFE）
$AB screenshot [sel] [path]        # sel 可选：裁到该元素；--full 全长；--annotate 标号
$AB get text|box|count|attr <sel>  # 取值
$AB is visible|enabled <sel>       # 状态判断
$AB click|fill|type|press|hover <...>
$AB snapshot -i                    # 可交互元素 + @eN 引用（点选前先看这个）
$AB console / $AB errors           # 页面 console 与错误
$AB clipboard read                 # 读剪贴板
$AB diff screenshot --baseline     # 视觉回归
$AB close --all                    # 收尾必做
```

终端里跑多个步骤时，**用 batch 一次调用跑完**，别开一堆进程：

```bash
cat <<'JSON' | $AB batch --bail --json
[
  ["open", "http://127.0.0.1:3000"],
  ["set", "viewport", "1180", "940", "2"],
  ["wait", "2000"],
  ["screenshot", "section", "/tmp/card.png"],
  ["close"]
]
JSON
```

⚠️ **batch 两种模式别混用**：位置参数是**整条命令字符串**（`$AB batch "open url" "screenshot x.png"`）；想传 JSON **数组套数组必须走 stdin**。把 JSON 数组当位置参数传会报 `Unknown command: [open,...]`。

---

## 三、`ui.mjs` —— 两个高频封装

```bash
S=<SKILL_DIR>/scripts/ui.mjs
N=${NODE:-/Users/lv/.workbuddy/binaries/node/versions/22.22.2-3/bin/node}
```

### `shots`：变体矩阵批量截图

```bash
# 中英 × 明暗 四个变体，一次跑完
$N $S shots --url http://127.0.0.1:8786/ --out /tmp/ui-shots --name console \
  --matrix "theme=light,dark" --matrix "lang=zh,en" --wait 2500

# 裁到某张卡片（A/B 对比各来一张）
$N $S shots --url http://127.0.0.1:3000 --out /tmp/ui-shots --name card \
  --select "section" --matrix "theme=light,dark"

# 移动端 + 全长 + 跟随系统深浅色
$N $S shots --url http://127.0.0.1:3000 --out /tmp/ui-shots --name mobile \
  --matrix "media=light,dark" --width 390 --height 844 --scale 3 --full
```

- `--matrix key=v1,v2` 可以给多个，做**笛卡尔积**；除 `media` 外都拼到 **URL 查询参数**（所以页面要支持 `?theme=`/`?lang=` 这类开关），`media` 走浏览器媒体模拟。
- `--select <CSS>` 可重复；不传就是整屏，配 `--full` 是全长。
- 输出一张表：`✓ 变体名 <选择器> 文件路径 体积`，`✗` 直接给失败原因。有失败退出码 1。
- `--json` 出机器可读结果。产物默认落 `/tmp/ui-shots`。

### `check`：断言批

```bash
$N $S check --url "http://127.0.0.1:8786/?theme=dark&lang=zh" --wait 2500 \
  --case "标题含控制台=document.title.includes('控制台')" \
  --case "无明文泄漏=!/sk-wb-[A-Za-z0-9]{28,}/.test(document.documentElement.outerHTML)"
```

- `--case "名称=JS表达式"` 在**第一个 `=`** 处切分，右侧按 JS 真值判过没过。
- 先跑一次 `document.title` 做冒烟测试，页面打不开会明确报错，而不是让你看着一屏 ✗ 猜。
- 全过退出码 0，有失败退出码 1（可直接串进 CI 或 `&&`）。
- **断言要精确**：曾写过 `!html.includes('sk-wb-')` 判"无明文泄漏"——结果掩码 `sk-wb-9b••••••••12b1` **本身就含这个前缀**，误判为泄漏。判敏感信息要锚定**长度/字符集**，别锚定前缀。

---

## 四、铁律

1. **不要手写 CDP 样板**。先想「现成 CLI 一行能不能干」，再想 `ui.mjs`，最后才手写。
2. **一个会话做多步**。`--session <name>` 的浏览器会话**跨 Bash 调用存活**（实测），所以可以分步调试；但**收尾必须 `close --all`**，否则 Chromium 常驻。
3. **截图是过程产物**，落 `/tmp`；只有**新增的、给用户看的**那张才作为交付呈现，别把中间态全塞进去。
4. **默认 headless，别碰用户日常 Chrome**。
5. **用完即关**，别留后台浏览器进程。

---

## 五、踩坑清单

| 现象 | 原因与解法 |
|---|---|
| `Unknown command: [open,...]` | 把 JSON 数组当 batch 位置参数了 → 改 stdin（见上） |
| `--session` 不生效 | 全局选项要放在**子命令之前**：`$AB --session x open ...` |
| 截图裁到错误的元素 | `screenshot <sel>` 命中多个时取**第一个** → 换更精确的选择器（`:nth-of-type(2)`、`#id`） |
| 点击没反应 | 交互前先 `snapshot -i` 拿 `@eN` 引用，别猜选择器；元素在视口外时先 `scrollintoview` |
| 读剪贴板报 `NotAllowedError` | 权限要授到**浏览器级** target（裸 CDP 场景），用 agent-browser 的 `clipboard read` 可绕开 |
| 页面还没渲染完就截 | 用 `wait --load networkidle` 或 `wait <selector>`，别只 `wait <ms>` |
| 沙箱里找不到 `agent-browser` | 非交互 shell 的 PATH 不含 managed node bin → 用绝对路径或 `AGENT_BROWSER=` 环境变量（`ui.mjs` 已内置自动定位） |
| 首次运行下载 Chromium | `npm i -g agent-browser && agent-browser install`（本机已装好） |

---

## 六、延伸配方

交互后再截图、剪贴板验证、视觉回归 diff、console 报错巡检、给多模态模型看的 `--annotate` 标注图等，见 `references/recipes.md`。

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
- `--select <CSS>` 可重复；不传就是整屏，配 `--full` 是全长。**脚本会自动把视口撑高到能容纳目标元素**（元素截图只在视口内才正确，见踩坑表），并在取图前把懒加载图片顶成 eager。
- 输出一张表：`✓ 变体名 <选择器> 文件路径 体积`，`✗` 给失败原因，`⚠` 表示**体积异常小、疑似空白**（帮你抓"命令成功但图是空的"）。有失败退出码 1。
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
- **并行/连跑不会串台**：`shots` 与 `check` 各自按「子命令 + 端口/主机 + 进程号 + 时间戳」派生**独占**的浏览器会话，两次运行互不影响；要固定会话名时加 `--session NAME`。曾经会话名是写死的常量，两个 agent 并发跑就会抢同一个浏览器会话——**断言居然全绿，但读的是别的页面的标题**（实测：验 en 时读到 `iskill-crop-qrcode` 的标题）。跑验收时若结果「异常顺利」，怀疑一下会话是不是被复用了。
- **断言要精确**：曾写过 `!html.includes('sk-wb-')` 判"无明文泄漏"——结果掩码 `sk-wb-9b••••••••12b1` **本身就含这个前缀**，误判为泄漏。判敏感信息要锚定**长度/字符集**，别锚定前缀。

---

## 四、铁律

1. **不要手写 CDP 样板**。先想「现成 CLI 一行能不能干」，再想 `ui.mjs`，最后才手写。
2. **一个会话做多步**。`--session <name>` 的浏览器会话**跨 Bash 调用存活**（实测），所以可以分步调试；但**收尾必须 `close --all`**，否则 Chromium 常驻。（`ui.mjs` 不用你操心：它自己派生独占会话并在结束时关干净。）
3. **截图是过程产物**，落 `/tmp`；只有**新增的、给用户看的**那张才作为交付呈现，别把中间态全塞进去。
4. **默认 headless，别碰用户日常 Chrome**。
5. **用完即关**，别留后台浏览器进程。
6. **断言挂了先怀疑断言，不是页面。** 写 `--case` 前先用一条探针 `eval` 打印真实取值，再定判据。
   实测两次翻车都是断言写错：① 模板骨架只放 **2 条**步骤示例，我却按文档断言 `===3`；
   ② 判「资源全走 assets/」时忘了 `rel="alternate" hreflang` 的 `?lang=zh` 链接本来就不是 assets 路径。
   断言要**锚长度/字符集**这类稳定特征，别锚示例数量、别锚前缀（掩码 `sk-wb-9b••••` 本身就含 `sk-wb-`）。
7. **「返回成功」不等于「真的做了」。** 已验证两条会**静默返回成功**的路径，共同根因是**目标必须在视口内**：
   - `screenshot <sel>`：元素在视口外 → 截出纯背景，命令成功、文件也生成了；
   - `click <sel>`：元素在视口外 → 什么都没发生，命令返回 `{"clicked":"<sel>"}`。

   所以凡是「命令说成功、结果却不对」，**第一件事是量 `el.getBoundingClientRect()` 在不在视口里**，
   而不是去读源码。这条对 screenshot / click / 任何靠坐标或可见性的操作都适用。

---

## 五、踩坑清单

| 现象 | 原因与解法 |
|---|---|
| `Unknown command: [open,...]` | 把 JSON 数组当 batch 位置参数了 → 改 stdin（见上） |
| `--session` 不生效 | 全局选项要放在**子命令之前**：`$AB --session x open ...` |
| 截图裁到错误的元素 | `screenshot <sel>` 命中多个时取**第一个** → 换更精确的选择器（`:nth-of-type(2)`、`#id`） |
| **元素截图截出一片纯背景（命令却返回成功）** | `screenshot <sel>` 内部按**页面坐标**下 clip 但没开 `captureBeyondViewport` → **目标必须在当前视口内**。实测：视口 1180×3200 正常 109 KB，视口 1180×940（元素在视口外）得到 5 KB 纯背景图，且**先 `scrollintoview` 也救不回来**。`ui.mjs --select` 已自动量高度、撑视口、再截；手写 batch 时要自己先 `set viewport w <够高>` |
| 图里那块区域是空的 | 图片 `loading="lazy"` 在截图那刻还没加载，元素盒子还是「没图时」的高度 → 截图前先 `eval` 把 `img[loading=lazy]` 改成 `eager` 并等 900ms |
| 整页截图下半部分是空白 | 页面有滚动入场动画（`.reveal{opacity:0}`），没滚到的区块透明 → 给页面加个 `?reveal=all` 之类的直达参数，或把视口撑到能覆盖全页 |
| **点折叠线以下的元素没反应（命令却报 `clicked`）** | 与「元素截图」同一个根因家族：`click <sel>` **只对当前视口内可见的元素有效**。实测 1200×900 视口、`#cta-copy` 在 y=4147：`click` 返回 `{"clicked":"#cta-copy"}`、`scrollY` 纹丝不动、**监听器根本没触发、无任何报错**。先滚进视口再点就正常。**两种滚法**：① `eval` 里 `el.scrollIntoView({behavior:"instant",block:"center"})`（⚠ 页面若设了 `scroll-behavior:smooth`，默认是**动画**滚动，紧接着点会落空 —— 必须显式 `behavior:"instant"` 或等 500ms）② 直接把视口调高到覆盖目标。判据：点完读一个**必定会变**的 DOM 特征（本页是按钮文案 →「已复制」），别信 `clicked` 返回值 |
| 点击没反应（其他原因） | 交互前先 `snapshot -i` 拿 `@eN` 引用，别猜选择器 |
| 合成点击（`el.click()`）能触发但走到「失败」分支 | 缺用户激活（user activation），`navigator.clipboard.writeText` 会被拒 → 降级到 `execCommand` 也返回 false。**这是合成点击的产物，不代表页面有 bug** —— 验复制必须用 `click` 真事件 |
| 读剪贴板报 `NotAllowedError` | 权限要授到**浏览器级** target（裸 CDP 场景），用 agent-browser 的 `clipboard read` 可绕开 |
| `clipboard read` / `write` 返回 `null` | 本机 headless 沙箱下这俩子命令**不可用**（先 `clipboard write x` 再 `read` 也是 null）。要验「复制到底写了什么」，改用 `eval` 拦一份 `navigator.clipboard.writeText` 的入参：`window.__copied=null;(()=>{const o=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=t=>{window.__copied=t;return o(t)};return true})()`，点完读 `window.__copied` |
| 页面还没渲染完就截 | 用 `wait --load networkidle` 或 `wait <selector>`，别只 `wait <ms>` |
| 断言失败但页面看着正常 | 先怀疑断言本身：数量类别照抄文档示例（模板骨架 ≠ 填好的真实页面）；「资源全相对」类要放行 `?query` 形式的 `rel="alternate" hreflang` 链接 |
| 沙箱里找不到 `agent-browser` | 非交互 shell 的 PATH 不含 managed node bin → 用绝对路径或 `AGENT_BROWSER=` 环境变量（`ui.mjs` 已内置自动定位） |
| **改完 CSS 重开页面，量到的还是旧规则** | **`file://` 页面也会被 Chromium 缓存**。实测：源文件里明明写着 `flex-basis:150px`，页面里读回来还是 `168px`，于是照着假的数验收了一轮。破法：URL 加 `?v=<时间戳>`（`#` 后面的 hash 参数**不破缓存**，必须是查询串） |
| **`open` 之后页面里靠 `location.hash` 判断的逻辑静默失效** | `agent-browser open <url>#xxx` 是**先导航、再把 fragment 补上**：脚本执行那一刻 `location.hash` 还是空的。实测页面里的 `#pop=1` 直达弹层不生效——`location.hash` 后来明明是 `#pop=1`、正则也 `true`，弹层却没开。页面侧要**同时监听 `hashchange`**；验收侧可改用 `eval` 手动 `click` 触发，别把赌注押在 hash 上 |
| **量 `getBoundingClientRect()` 差个 2px，别急着当 bug** | 点完/截完，合成鼠标常常**停在目标元素上**，`:hover{transform:translateY(-2px)}` 这类效果就生效了。实测 `.qrs` 三张卡 `top` 读到 `374/376/376`，差点判成「折行了」。判「几行」要**排序后数「相邻差 > 4px」的断层**，或量之前先把鼠标挪开 |
| 首次运行下载 Chromium | `npm i -g agent-browser && agent-browser install`（本机已装好） |

> **agent-browser 在受限沙箱里比直接 exec Chromium 更能活**：它把浏览器 daemon 化，
> 而直接 `execFileSync('…/Google Chrome')` 会被沙箱把**整棵进程树**一起回收
> （退出码 137，宿主脚本连 `catch` 都没机会跑）。所以凡是「文档/验收脚本自己起浏览器」，
> 要么直接用它，要么**在起进程之前就判断**该走哪条路，别指望运行时兜底。
>
> **真绕过 agent-browser、自己 exec Chromium 截图时，两个「看着更健壮、实际是负优化」的旗标**（2026-10-02 实测，Chrome 154 for Testing / macOS）：
> ① 别加 `--user-data-dir=<临时目录>` —— 截完**不退出**、进程挂死（同命令单跑 >7min 只能 kill）；
> 不加 profile 的裸 `--headless --disable-gpu` 反而稳（只有无害的 CVDisplayLink 警告）。
> ② 别优先 `--headless=new` —— 这部分 Chrome 上 GPU 进程直接 FATAL
> （`gpu_data_manager_impl_private.cc:417 GPU process isn't usable`，exit 6）。
> 稳的写法：`for flag in (\"--headless\", \"--headless=new\")` 先裸后新、且**永远不带 profile**。
> （注：「受限沙箱里 Chrome 建不了默认 profile 而 SIGTRAP」是**另一种环境**的老坑，那种情况才需要显式 profile —— 两说并存，别一律套用。）

---

## 六、延伸配方

交互后再截图、剪贴板验证、视觉回归 diff、console 报错巡检、给多模态模型看的 `--annotate` 标注图等，见 `references/recipes.md`。

## 七、本技能的落地页

`promo-page/` 是这个技能自己的推广页（用 `iskill-promo-page` 生成，紫青配色，实拍区就是本技能自拍的产物）。
发布方式见 [`iskill-promo-page/references/deploy-modes.md`](../iskill-promo-page/references/deploy-modes.md)，
一条命令配好：`bash <promo-page>/scripts/pages.sh workflow aispin/iskill-ui-verify --apply`。

> ⚠️ 若不想用 GitHub Actions：Pages 分支模式**只能选 `/` 或 `/docs`**，选不了 `promo-page/`；
> 要么继续用仓库里已备好的 `.github/workflows/promo-page.yml`，要么把目录改名成 `docs/`。

## 依赖同步

本仓库 `promo-page/assets/{app.js,style.css,icons.js}` 是 [iskill-promo-page](https://github.com/aispin/iskill-promo-page)
模板引擎的 vendored 副本（锁定版本见 `package.json` 的 `iskillDeps`），**不要手改**——
去真源仓库改并升 `@iskill-version`，再用 iskill-dep-sync 同步回来（本机无该工具时按下面自举）：

```bash
T="$HOME/.workbuddy/skills/iskill-dep-sync/scripts/skill-deps.mjs"
[ -f "$T" ] || { TMP="$(mktemp -d)"; curl -fsSL "https://raw.githubusercontent.com/aispin/iskill-dep-sync/HEAD/scripts/skill-deps.mjs" -o "$TMP/skill-deps.mjs"; T="$TMP/skill-deps.mjs"; }
node "$T" check "$(pwd)"     # 漂移检测；node "$T" sync "$(pwd)" 恢复/升级；node "$T" env "$(pwd)" 冷启动自检
```

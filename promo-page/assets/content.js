/* ============================================================================
 * iskill-ui-verify · 落地页内容
 * 只改这个文件就能换掉整页文案（外加 index.html 顶部 8 行 meta）。
 * ==========================================================================*/
window.PROMO = {
  name: "ISKILL-UI-VERIFY",
  brand: "#7c5cff",
  brand2: "#22d3ee",
  repo: "https://github.com/aispin/iskill-ui-verify",
  repoLabel: "aispin/iskill-ui-verify",

  /* ── 平台兼容性标签（Hero「AI 技能」右边那枚）───────────────────────────
   * 取值 "mac-windows" | "macos" | "windows" | "linux" | "all" | "" | {zh,en}
   * 判据：跑 sips/osascript/open/lsof//opt/homebrew 硬路径 = 仅 macOS；
   *       有 .ps1/taskkill/win32 分支 = 支持 Windows；纯提示词或纯 Node/Python = all。
   * 标错比不写更糟。详见 promo-page/references/design-guide.md §十。
   */
  platform: "all",
  lang: {
    /* ── 中文 ───────────────────────────────────────────────────────── */
    zh: {
      meta: {
        title: "ISKILL-UI-VERIFY · 截图验证，一行命令",
        description: "让 agent 用一行命令完成网页截图与 UI 验证：变体矩阵、元素裁剪、DOM 断言、退出码。底层复用 agent-browser，零 npm 依赖。"
      },
      a11y: { skip: "跳到主要内容" },
      ui: { copy: "复制", copied: "已复制", failed: "复制失败" },
      nav: { features: "能力", shots: "截图", how: "上手", faq: "问答" },

      hero: {
        badge: "AI 技能",
        titlePre: "把「截图验证」",
        titleAccent: "压成一行命令",
        titlePost: "",
        sub: "变体矩阵截图、元素级裁剪、DOM 断言、退出码——底层复用已装好的 agent-browser（自带 Chromium、零 npm 依赖），默认 headless，不碰你日常的 Chrome。",
        ctaPrimary: "复制安装提示词",
        ctaSecondary: "看源码",
        meta1: "零 npm 依赖",
        meta2: "默认 headless",
        meta3: "MIT 许可"
      },
      terminal: {
        title: "zsh — iskill-ui-verify",
        lines: [
          [{ t: "$ ", c: "p" }, { t: "node scripts/ui.mjs shots --url http://127.0.0.1:8786/", c: "k" }],
          [{ t: "    --matrix theme=light,dark --matrix lang=zh,en --select section", c: "k" }],
          [{ t: "产出目录 /tmp/ui-shots · 4 变体 × 1 目标 · 1180×940@2x", c: "c" }],
          [{ t: "✓ theme-light_lang-zh  <section>  43 KB", c: "s" }],
          [{ t: "✓ theme-dark_lang-en   <section>  41 KB", c: "s" }]
        ]
      },

      stats: [
        { value: "135 → 1", label: "行 CDP 样板变成一行命令", note: "手写一次约 1.5k tokens" },
        { value: "4", label: "个变体一次跑完", note: "语言 × 主题做笛卡尔积" },
        { value: "0", label: "个新增依赖", note: "复用 agent-browser 自带 Chromium" }
      ],

      compare: {
        eyebrow: "对比",
        title: "以前 vs 现在",
        sub: "",
        before: {
          title: "每次手写 CDP 脚本",
          items: ["重写约 85 行同构样板：起 Chrome、轮询端口、连 WebSocket…", "点击坐标落视口外、权限挂错 target，静默失败", "报错只能靠猜，重试成本比代码本身还高"]
        },
        after: {
          title: "一行 shots、一行 check",
          items: ["矩阵截图与断言批都收在一个脚本里", "踩过的坑已经写进 SKILL.md 的排错表", "有失败即退非 0，可以直接串进 CI"]
        }
      },

      features: {
        eyebrow: "能力",
        title: "它替你干的活",
        sub: "",
        items: [
          { icon: "camera", title: "变体矩阵截图", desc: "<code>--matrix</code> 可以给多次做笛卡尔积，中英 × 明暗四个变体一次跑完，输出一张判读表。" },
          { icon: "crop", title: "元素级裁剪", desc: "<code>--select &lt;CSS&gt;</code> 直接裁到某张卡片，不用再手算 bounding box 与 clip。" },
          { icon: "check", title: "断言批", desc: "<code>check --case \"名称=JS表达式\"</code> 输出 PASS/FAIL 表，全过退 0、有失败退 1。" },
          { icon: "monitor", title: "Retina / 全长 / 移动端", desc: "viewport 第三参就是 deviceScaleFactor，<code>--full</code> 出整页，390×844@3 出手机档。" },
          { icon: "shield", title: "不碰你的浏览器", desc: "默认起独立 headless 实例与独立 profile，不会杀掉你正在用的 Chrome。" },
          { icon: "bolt", title: "零依赖", desc: "agent-browser 直驱 CDP（无 Playwright / Puppeteer），封装脚本只用 Node 标准库。" }
        ]
      },

      showcase: {
        eyebrow: "实拍",
        title: "本页就是它拍的",
        sub: "下面两张图由它自己的校验流程产出——同一份 URL，只换主题变体。",
        items: [
          { src: "assets/shot-theme-light.png", alt: "本页浅色版整屏截图", caption: "本页 · 浅色（--matrix theme=light）" },
          { src: "assets/shot-theme-dark.png", alt: "本页深色版整屏截图", caption: "本页 · 深色（同一次运行里换一个变体）" }
        ]
      },

      steps: {
        eyebrow: "上手",
        title: "三步跑起来",
        sub: "截图矩阵与断言批都是它封装好的；你只说要看什么。",
        items: [
          { title: "交给 AI 装", desc: "把这句话粘进对话框，agent 会自己拉代码、读文档，再告诉你用法。", codeKey: "install" },
          { title: "说要看什么", desc: "矩阵截图和断言批已经封装好；你只管描述要看的页面和维度。", codeName: "prompt", code: "截几张图看看这个页面改完的效果，中英 × 明暗都来一遍，再断言下有没有横向滚动。" },
          { title: "看截图和断言结果", desc: "截图落在输出目录，断言直接回 PASS/FAIL；哪张不对说一声，它改完重截。" }
        ]
      },


      faq: {
        eyebrow: "问答",
        title: "常见问题",
        items: [
          { q: "能不能不用 AI，手动装？", a: "可以。clone 到你的 agent 技能目录（如 <code>~/.workbuddy/skills/</code>）即可；技能是纯文本加脚本，没有构建步骤。" },
          { q: "和 browser-cdp 技能有什么区别？", a: "browser-cdp 用来复用你真实浏览器的登录态（会杀掉 Chrome、需你同意）；本技能默认起独立 headless 实例，专做本地页面的视觉验收。" },
          { q: "页面还没渲染完就截了怎么办？", a: "用 wait --load networkidle，或直接等某个选择器出现，别只等固定毫秒数。" },
          { q: "要在跨源 iframe 里验证剪贴板？", a: "iframe 里 navigator.clipboard 会被权限策略拒，页面侧要做三层降级；校验侧用 agent-browser 的 clipboard read 读回值再断言。" },
          { q: "需要装 Playwright 吗？", a: "不需要。agent-browser 自驱 CDP，封装脚本只用 Node 标准库。" }
        ]
      },

      cta: {
        title: "下次改完 UI，别再手写 CDP",
        desc: "一行 shots 出图，一行 check 出结论。",
        primary: "去 GitHub 看看",
        secondary: "复制安装提示词"
      },
      footer: { license: "MIT 许可", madeWith: "由 iskill-promo-page 生成" }
    },

    /* ── English ────────────────────────────────────────────────────── */
    en: {
      meta: {
        title: "ISKILL-UI-VERIFY · Screenshot checks in one command",
        description: "Let agents verify web UI in one command: variant matrix shots, element crops, DOM assertions, meaningful exit codes. Built on agent-browser — zero npm dependencies."
      },
      a11y: { skip: "Skip to content" },
      ui: { copy: "Copy", copied: "Copied", failed: "Copy failed" },
      nav: { features: "Features", shots: "Screens", how: "Get started", faq: "FAQ" },

      hero: {
        badge: "AI skill",
        titlePre: "Turn UI verification into ",
        titleAccent: "one command",
        titlePost: "",
        sub: "Variant-matrix screenshots, element crops, DOM assertions and real exit codes — on top of agent-browser (bundled Chromium, zero npm deps). Headless by default, and it never touches the Chrome you are using.",
        ctaPrimary: "Copy install prompt",
        ctaSecondary: "View source",
        meta1: "No npm deps",
        meta2: "Headless by default",
        meta3: "MIT licensed"
      },
      terminal: {
        title: "zsh — iskill-ui-verify",
        lines: [
          [{ t: "$ ", c: "p" }, { t: "node scripts/ui.mjs shots --url http://127.0.0.1:8786/", c: "k" }],
          [{ t: "    --matrix theme=light,dark --matrix lang=zh,en --select section", c: "k" }],
          [{ t: "out /tmp/ui-shots · 4 variants × 1 target · 1180×940@2x", c: "c" }],
          [{ t: "✓ theme-light_lang-zh  <section>  43 KB", c: "s" }],
          [{ t: "✓ theme-dark_lang-en   <section>  41 KB", c: "s" }]
        ]
      },

      stats: [
        { value: "135 → 1", label: "lines of CDP boilerplate, gone", note: "~1.5k tokens written per attempt" },
        { value: "4", label: "variants in a single run", note: "language × theme cartesian product" },
        { value: "0", label: "new dependencies", note: "reuses agent-browser's Chromium" }
      ],

      compare: {
        eyebrow: "Comparison",
        title: "Before vs after",
        sub: "",
        before: {
          title: "Hand-rolled CDP scripts",
          items: ["~85 lines of identical boilerplate, every single time", "Clicks land outside the viewport, permissions attach to the wrong target", "Failures are silent, so you debug by guessing"]
        },
        after: {
          title: "One shots call, one check call",
          items: ["Matrix capture and assertions live in a single script", "Every trap we hit is already in the SKILL.md troubleshooting table", "Non-zero exit on failure, so it drops straight into CI"]
        }
      },

      features: {
        eyebrow: "Features",
        title: "What it takes off your plate",
        sub: "",
        items: [
          { icon: "camera", title: "Variant matrix", desc: "<code>--matrix</code> repeats and expands into a cartesian product — zh/en × light/dark in one run, with a readable result table." },
          { icon: "crop", title: "Element crops", desc: "<code>--select &lt;CSS&gt;</code> crops straight to a card. No more manual bounding boxes and clip maths." },
          { icon: "check", title: "Assertion batches", desc: "<code>check --case \"name=JS expression\"</code> prints a PASS/FAIL table; exit 0 when green, 1 when not." },
          { icon: "monitor", title: "Retina, full page, mobile", desc: "The third viewport argument is the device scale factor. <code>--full</code> for the whole page, 390×844@3 for phones." },
          { icon: "shield", title: "Never touches your browser", desc: "It launches its own headless Chromium with its own profile — your daily Chrome stays open." },
          { icon: "bolt", title: "Zero dependencies", desc: "agent-browser drives CDP directly (no Playwright, no Puppeteer); the wrapper only uses the Node standard library." }
        ]
      },

      showcase: {
        eyebrow: "Screens",
        title: "This page was shot by itself",
        sub: "Both images below came out of its own verification run — same URL, different theme variants.",
        items: [
          { src: "assets/shot-theme-light.png", alt: "This page, light theme", caption: "This page · light (--matrix theme=light)" },
          { src: "assets/shot-theme-dark.png", alt: "This page, dark theme", caption: "This page · dark (another variant of the same run)" }
        ]
      },

      steps: {
        eyebrow: "Get started",
        title: "Up and running in three steps",
        sub: "Shot matrices and assertion batches are already packaged — you just say what to look at.",
        items: [
          { title: "Let your agent install it", desc: "Paste the line into the chat — it clones the repo, reads the docs, and tells you how to use it.", codeKey: "install" },
          { title: "Say what you want to see", desc: "Matrix shots and assertion batches are packaged already — just describe the page and the dimensions.", codeName: "prompt", code: "Screenshot this page after the changes — Chinese and English, light and dark — and assert there's no horizontal scroll." },
          { title: "Check the shots and assertions", desc: "Screenshots land in the output dir; assertions come back PASS/FAIL. Say which one is wrong and it re-shoots after fixing." }
        ]
      },


      faq: {
        eyebrow: "FAQ",
        title: "Frequently asked",
        items: [
          { q: "Can I install it without an agent?", a: "Sure. Clone it into your agent's skills directory (e.g. <code>~/.workbuddy/skills/</code>) — plain text and scripts, no build step." },
          { q: "How is this different from the browser-cdp skill?", a: "browser-cdp reuses the login session of the Chrome you already run (it kills it, with your consent). This skill launches its own headless instance for local visual checks." },
          { q: "The page was still rendering when it shot.", a: "Wait with wait --load networkidle, or wait for a specific selector — not a fixed number of milliseconds." },
          { q: "Verifying the clipboard inside a cross-origin iframe?", a: "navigator.clipboard is blocked by permission policy inside iframes, so the page needs a fallback chain; verify with agent-browser's clipboard read and assert on the value." },
          { q: "Do I need Playwright?", a: "No. agent-browser drives CDP itself and the wrapper only uses the Node standard library." }
        ]
      },

      cta: {
        title: "Next time you touch the UI, skip the CDP script",
        desc: "One shots call for images, one check call for answers.",
        primary: "Open on GitHub",
        secondary: "Copy install prompt"
      },
      footer: { license: "MIT licensed", madeWith: "Built with iskill-promo-page" }
    }
  }
};

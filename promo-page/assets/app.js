/* ============================================================================
 * iskill-promo-page · 运行时
 *
 * 四件事：① 主题（跟随系统 / 手动 / URL 参数）② 语言（中英）
 *        ③ 从 content.js 渲染卡片列表 ④ 滚动入场、复制、顶栏状态
 *
 * 用传统 <script>（非 ES module），这样 file:// 直接双击打开也能跑。
 * ==========================================================================*/
(function () {
  var P = window.PROMO || {};
  var ICONS = window.PROMO_ICONS || {};
  var html = document.documentElement;

  /* ── 工具 ─────────────────────────────────────────────────────────── */
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(name) {
    var s = ICONS[name] || ICONS.check;
    return s || "";
  }
  function param(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
  }
  function store(key, val) {
    try { if (val == null) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) {}
    return null;
  }

  /* ── ① 主题 ───────────────────────────────────────────────────────── */
  var mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function systemTheme() { return mql && mql.matches ? "dark" : "light"; }

  function detectTheme() {
    var q = param("theme");
    if (q === "dark" || q === "light") return { theme: q, persist: false };
    var saved = store("promo-theme");
    if (saved === "dark" || saved === "light") return { theme: saved, persist: true };
    return { theme: systemTheme(), persist: false };
  }
  function applyTheme(theme, persist) {
    html.classList.toggle("dark", theme === "dark");
    html.classList.toggle("light", theme === "light");
    if (persist) store("promo-theme", theme);
    var btn = qs("#theme-toggle");
    if (btn) {
      btn.innerHTML = icon(theme === "dark" ? "sun" : "moon") + '<span class="lbl">theme</span>';
      btn.setAttribute("aria-label", theme === "dark" ? "切换到浅色" : "切换到深色");
      btn.dataset.theme = theme;
    }
  }

  /* ── ② 语言 ───────────────────────────────────────────────────────── */
  function detectLang() {
    var q = param("lang");
    if (q === "zh" || q === "en") return { lang: q, persist: false };
    var saved = store("promo-lang");
    if (saved === "zh" || saved === "en") return { lang: saved, persist: true };
    var nav = (navigator.language || "zh").toLowerCase();
    return { lang: nav.indexOf("zh") === 0 ? "zh" : "en", persist: false };
  }

  /* ── ③ 渲染 ───────────────────────────────────────────────────────── */
  function get(obj, path) {
    return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  }

  function applyText(dict) {
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var v = get(dict, n.getAttribute("data-i18n"));
      if (typeof v === "string") n.textContent = v;
    }
  }

  function termLine(segs) {
    var line = el("div", "term-line");
    (Array.isArray(segs) ? segs : [{ t: String(segs) }]).forEach(function (s) {
      line.appendChild(el("span", s.c || "", s.t));
    });
    return line;
  }

  function renderTerminal(head, lines) {
    var bar = qs("#term-bar");
    var body = qs("#term-body");
    if (!body) return;
    if (bar) { bar.innerHTML = ""; ["", "", ""].forEach(function () { bar.appendChild(el("i")); }); bar.appendChild(el("b", null, head || "")); }
    body.innerHTML = "";
    var rows = lines || [];
    rows.forEach(function (segs, i) {
      var line = termLine(segs);
      body.appendChild(line);
      setTimeout(function () { line.classList.add("in"); }, 220 + i * 170);
    });
    var cursorLine = el("div", "term-line");
    cursorLine.appendChild(el("span", "term-cursor"));
    body.appendChild(cursorLine);
    setTimeout(function () { cursorLine.classList.add("in"); }, 220 + rows.length * 170);
  }

  function renderStats(list) {
    var box = qs("#stats .grid");
    if (!box) return;
    box.innerHTML = "";
    (list || []).forEach(function (s, i) {
      var c = el("div", "card stat reveal d" + Math.min(i, 3));
      c.appendChild(el("div", "v", s.value));
      c.appendChild(el("div", "k", s.label));
      if (s.note) c.appendChild(el("div", "n", s.note));
      box.appendChild(c);
    });
  }

  function renderCompare(data) {
    if (!data) return;
    var box = qs("#compare .grid");
    if (!box) return;
    box.innerHTML = "";
    [["before", data.before], ["after", data.after]].forEach(function (pair) {
      var kind = pair[0], d = pair[1] || {};
      var c = el("div", "card cmp " + kind);
      var h = el("h3");
      h.innerHTML = icon(kind === "before" ? "cross" : "check") + "<span>" + (d.title || "") + "</span>";
      c.appendChild(h);
      var ul = el("ul");
      (d.items || []).forEach(function (t) {
        var li = el("li");
        li.innerHTML = icon(kind === "before" ? "cross" : "check") + "<span>" + t + "</span>";
        ul.appendChild(li);
      });
      c.appendChild(ul);
      box.appendChild(c);
    });
  }

  function renderFeatures(data) {
    if (!data) return;
    var box = qs("#features .grid");
    if (!box) return;
    box.innerHTML = "";
    (data.items || []).forEach(function (f) {
      var c = el("div", "card feat reveal");
      var ic = el("div", "ic");
      ic.innerHTML = icon(f.icon);
      c.appendChild(ic);
      c.appendChild(el("h3", null, f.title));
      var p = el("p");
      p.innerHTML = f.desc || "";
      c.appendChild(p);
      box.appendChild(c);
    });
  }

  function renderSteps(data) {
    if (!data) return;
    var box = qs("#how .list"); /* 注意：section 的 id 是 #how，别写成 #steps */
    if (!box) return;
    box.innerHTML = "";
    (data.items || []).forEach(function (s, i) {
      var wrap = el("div", "step reveal");
      var num = el("div", "num", String(i + 1));
      var body = el("div", "body");
      body.appendChild(el("h3", null, s.title));
      body.appendChild(el("p", null, s.desc));
      if (s.code) {
        var code = el("div", "code");
        var head = el("div", "code-head");
        head.appendChild(el("span", "name", s.codeName || "shell"));
        var btn = el("button", "code-copy");
        btn.type = "button";
        btn.dataset.copy = s.code;
        btn.innerHTML = icon("copy") + "<span>复制</span>";
        head.appendChild(btn);
        code.appendChild(head);
        var pre = el("pre");
        pre.innerHTML = s.code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/(#[^\n]*)/g, '<span class="c">$1</span>');
        code.appendChild(pre);
        body.appendChild(code);
      }
      wrap.appendChild(num);
      wrap.appendChild(body);
      box.appendChild(wrap);
    });
  }

  function renderFaq(data) {
    if (!data) return;
    var box = qs("#faq .list");
    if (!box) return;
    box.innerHTML = "";
    (data.items || []).forEach(function (f) {
      var d = el("details", "card");
      d.appendChild(el("summary", null, f.q));
      d.appendChild(el("div", "a", f.a));
      box.appendChild(d);
    });
  }

  function renderShowcase(data) {
    var sec = qs("#shots");
    if (!sec) return;
    var items = (data && data.items) || [];
    if (!items.length) { sec.style.display = "none"; return; }
    sec.style.display = "";
    var box = qs("#shots .grid");
    box.innerHTML = "";
    items.forEach(function (s) {
      var fig = el("figure", "card shot reveal");
      var img = el("img");
      img.src = s.src;
      img.alt = s.alt || "";
      img.loading = "lazy";
      fig.appendChild(img);
      if (s.caption) fig.appendChild(el("figcaption", null, s.caption));
      box.appendChild(fig);
    });
  }

  function paintLinks() {
    var repo = P.repo || "#";
    var label = P.repoLabel || repo.replace(/^https?:\/\/github\.com\//, "");
    [["#repo-link", repo], ["#hero-repo", repo], ["#cta-repo", repo], ["#footer-repo", repo]]
      .forEach(function (p) { var n = qs(p[0]); if (n) n.href = p[1]; });
    var lb = qs("#repo-label");
    if (lb && P.repoLabel) lb.textContent = P.repoLabel;
    [["#hero-copy", P.install], ["#cta-copy", P.install]].forEach(function (p) {
      var n = qs(p[0]);
      if (n && p[1]) n.setAttribute("data-copy", p[1]);
    });
    if (P.name) {
      var fn = qs("#footer-name");
      if (fn) fn.textContent = P.name;
    }
  }

  function render(lang) {
    var dict = (P.lang && (P.lang[lang] || P.lang.zh)) || {};
    applyText(dict);
    renderTerminal((dict.terminal || {}).title, (dict.terminal || {}).lines);
    renderStats(dict.stats);
    renderCompare(dict.compare);
    renderFeatures(dict.features);
    renderShowcase(dict.showcase);
    renderSteps(dict.steps);
    renderFaq(dict.faq);
    html.setAttribute("lang", lang === "zh" ? "zh-CN" : "en");
    if (dict.meta) {
      document.title = dict.meta.title || document.title;
      var md = qs('meta[name="description"]');
      if (md && dict.meta.description) md.setAttribute("content", dict.meta.description);
    }
    var seg = qs("#lang-seg");
    if (seg) {
      [].forEach.call(seg.querySelectorAll("button"), function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
      });
    }
    observeReveals();
  }

  /* ── ④ 交互 ───────────────────────────────────────────────────────── */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function bindCopy() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-copy]") : null;
      if (!btn) return;
      var text = btn.getAttribute("data-copy");
      var label = btn.querySelector("span");
      copyText(text).then(function (ok) {
        btn.classList.toggle("done", !!ok);
        if (label) label.textContent = ok ? "已复制" : "复制失败";
        setTimeout(function () {
          btn.classList.remove("done");
          if (label) label.textContent = "复制";
        }, 1600);
      });
    });
  }

  var io = null;
  function observeReveals() {
    var nodes = document.querySelectorAll(".reveal:not(.in)");
    /* 整页截图/打印/无 JS 场景：加 ?reveal=all 一次全亮，
       否则滚动入场会让「没滚到」的区块在截图里保持透明。 */
    if (param("reveal") === "all" || !("IntersectionObserver" in window)) {
      [].forEach.call(nodes, function (n) { n.classList.add("in"); });
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    }
    [].forEach.call(nodes, function (n) { io.observe(n); });
  }

  function bindTopbar() {
    var bar = qs(".topbar");
    if (!bar) return;
    var onScroll = function () { bar.classList.toggle("scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function bindGlow() {
    document.addEventListener("pointermove", function (e) {
      var card = e.target.closest ? e.target.closest(".feat") : null;
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
  }

  function paintBrand() {
    if (P.brand) html.style.setProperty("--brand", P.brand);
    if (P.brand2) html.style.setProperty("--brand2", P.brand2);
  }

  /* ── 启动 ─────────────────────────────────────────────────────────── */
  function boot() {
    paintBrand();
    paintLinks();

    /* 首帧的类已由 <head> 里的内联脚本打好，这里只做「确认 + 绑定按钮图标」，
       不再写 localStorage（URL 参数只作用于本次加载）。 */
    applyTheme(detectTheme().theme, false);

    var l = detectLang();
    render(l.lang);

    var tb = qs("#theme-toggle");
    if (tb) {
      tb.addEventListener("click", function () {
        var next = html.classList.contains("dark") ? "light" : "dark";
        applyTheme(next, true);
      });
    }
    var seg = qs("#lang-seg");
    if (seg) {
      seg.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("button") : null;
        if (!b || !b.dataset.lang) return;
        store("promo-lang", b.dataset.lang);
        render(b.dataset.lang);
      });
    }
    /* URL 里带了 lang/theme 只作用于本次加载，不写 localStorage */
    if (mql && mql.addEventListener) {
      mql.addEventListener("change", function () {
        if (!store("promo-theme") && !param("theme")) applyTheme(systemTheme(), false);
      });
    }

    bindCopy();
    bindTopbar();
    bindGlow();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

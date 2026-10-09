# iskill-ui-verify

当 agent 需要「截图验证」——改完前端/网页后要看效果、要给用户看界面、要断言 DOM/文案/敏感信息、要做多语言×多主题矩阵截图、要复现交互后再截图时使用。触发词：截图验证、看下效果、截个图、UI 验收、可视化验证、headless 截图、screenshot、视觉回归。底层复用已安装的 agent-browser（自带 Chromium），本技能只补「矩阵批量截图」与「断言批」两个高频封装 + 踩坑清单。

完整用法见 [SKILL.md](SKILL.md)。

> 依赖同步：本仓库含 iskill 共享真源的 vendored 副本（清单见 `package.json` 的 `iskillDeps`），**不要手改**。使用前请同时安装 iskill-utils：对 agent 说「请帮我安装 Skill：aispin/iskill-utils」；用法见 SKILL.md「依赖同步」节。

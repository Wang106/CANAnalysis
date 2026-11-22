# 发布规范

当前版本是 **1.2.0**。这是项目采用语义化版本后的第一条版本，承接已经公开的站点，不是从零开始的产品。版本号按 `MAJOR.MINOR.PATCH` 递增：

- MAJOR：公开行为不兼容。
- MINOR：向后兼容的功能。
- PATCH：向后兼容的修复。

## 分支与合并

1. 从最新的 `main` 建立功能分支。
2. 提交 Pull Request。
3. GitHub Actions 里的 `verify` 全部通过。
4. 维护者合并到 `main`。

合并之后，在该合并提交上打注解标签 `vX.Y.Z`。1.2.0 的标签由维护者在合并提交上创建。本仓库的验证工作流不推送标签，也不合并 Pull Request。

## 版本清单

`npm run version:generate` 读取三样东西：

- `package.json` 的 `version`
- `git rev-parse HEAD`
- `git log -1 --format=%cI`，也就是该提交的提交者时间

它写入 `public/version.json`：

| 字段 | 含义 |
|---|---|
| `version` | 语义化版本 |
| `commit` | 完整提交号 |
| `shortCommit` | 提交号前八位 |
| `committedAt` | 提交者时间 |
| `generatedAt` | 运行生成器的时刻 |
| `commitSource` | 固定为 `git-committer` |

页面只展示 `shortCommit` 和 `committedAt` 的日期。`generatedAt` 不显示。Git 不可用时生成器直接失败，避免用构建时刻填提交时间。

`wrangler.jsonc` 的 `build.command` 会在 `wrangler dev` 和 `wrangler deploy` 前运行生成器。浅克隆只要包含被部署的那一个提交对象即可，`fetch-depth: 1` 足够取得它的提交者时间。

仓库里提交的清单可能比包含它的那个提交早一个提交，因为提交号不能写进自身的树。部署时的生成结果才是该次发布的清单。

首页在清单的提交号和提交时间都有效时直接使用清单。只有缺项时才请求 `https://api.github.com/repos/Wang106/CANAnalysis/commits/<ref>`。清单缺失时，`<ref>` 才是 `main`。请求失败且清单也没有时间时，页脚日期留空。

## 验证

干净环境：

```bash
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
npx playwright install chromium
npm test
```

`npm test` 依次运行：

- core：Node 测试、语法检查、版本清单和静态响应头。
- python：`tests.test_bridge`，以及 `tests/verify-convert-output.py`。后者需要 `requirements-dev.txt` 里的 python-can 与 asammdf。
- browser：`about-scroll`、`about-ocean-motion`、`offline-home-version`、`tests/regression.html`、安全响应头和版本回退，以及 `tests/browser-convert.cjs`。后者覆盖格式转换下载和关于页切到 English 后的可见文案，包括仍关闭的社区表单。

GitHub Actions 使用同样的三层，权限只有 `contents: read`。工作流不部署，不读取 Secret，因此没有 Cloudflare 凭据也能运行。

## 静态响应头

`public/_headers` 由 `src/lib/static-headers.mjs` 生成。`/*` 提供 CSP、HSTS、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy` 和 `frame-ancestors 'none'`。

在线页另外允许：

- `ws://127.0.0.1:8765`
- `ws://localhost:8765`
- `http://127.0.0.1:8765`
- `http://localhost:8765`

Cloudflare 会把重复的响应头用逗号接在一起，所以 `/online`、`/online/` 和 `/online.html` 先卸掉通用 CSP，再写上含本机桥接的 CSP。其他页面不包含这些地址。策略没有 `upgrade-insecure-requests`，避免把本机 `ws://` 改写成桥接服务没有提供的 `wss://`。

现有页面含有内联脚本和 `style` 属性，离线页也会在本地 ECharts 缺失时回退到 jsDelivr，关于页会加载 Turnstile。因此 CSP 保留 `'unsafe-inline'`，并允许 `https://cdn.jsdelivr.net` 与 `https://challenges.cloudflare.com`。把内联脚本从 `public/offline.html` 中拆出去属于后续整理，不在这个版本里做。

Worker 自己生成的 `/api/*` 响应不吃 `_headers`。它们继续使用 `src/lib/http.js` 里的 `connect-src 'self'`。

本地检查响应头：

```bash
npm run preview:static
```

## 功能边界

- 离线解析和格式转换在浏览器里完成，不因为打开页面而上传日志或 DBC。
- Worker、D1、R2、Queue 和 Cron 是社区后端。`COMMUNITY_ENABLED` 保持 `false`，社区接口返回 503。
- 在线连接是未验证预览。首页卡片不可点击，导航保留入口。PCAN、Vector 和周立功的实物验收另列，不在 1.2.0 的通过条件里。

## 仍需维护者完成的设置

这些动作会改变仓库保护、Cloudflare 或生产凭据，不能由功能分支代做。

1. 给 `main` 打开分支保护：禁止直接推送，合并前必须通过名为 `verify` 的检查。
2. 调整 Cloudflare 生产项目：构建命令改为 `npm ci && node scripts/generate-version.mjs`；只有 `verify` 成功后才运行部署命令。如果控制台仍是“推送到 main 就部署”，验证失败挡不住生产发布。仓库里的 Actions 没有部署步骤。
3. 合并 1.2.0 之后，在该合并提交上创建注解标签 `v1.2.0`。
4. 继续保持 `COMMUNITY_ENABLED=false`。不要为了这次发布填写邮件、Turnstile Secret，也不要打开社区开关。
5. `wrangler.jsonc` 里的 account id、D1、R2、Queue、Access audience 和 Turnstile site key 是现有部署标识。这次不清除、不轮换。以后若要把它们移出仓库，先在 Cloudflare 确认绑定仍然存在，否则会中断现有部署。
6. 合并并部署后人工看一次生产首页：提交号前八位等于所部署提交的前八位，日期等于该提交的提交者日期；静态页面带有上述响应头；`/online` 能打开且 CSP 没有拦截本机 WebSocket；`/api/health` 仍表示社区未启用。

真实 CAN 设备不作为 1.2.0 的验收条件。

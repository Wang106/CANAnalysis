# Cloudflare 社区功能架构

## 状态

后端代码和数据库迁移已进入仓库，但 `COMMUNITY_ENABLED` 必须保持 `false`，直到生产资源、Access、Turnstile、邮件域名和隐私政策中的供应商信息全部确认。

## 服务边界

- Worker：同源 `/api/*`，静态资源通过 `ASSETS` binding 回退。
- D1：账号、会话、评论、举报、申诉、审计、Outbox。
- R2：头像和附件；Bucket 不公开。
- Queues：事务邮件异步发送；失败进入 DLQ。
- Turnstile：注册、登录和高风险匿名入口的机器人防护。
- Cloudflare Access：只保护 `/admin*` 与 `/api/admin/*`，唯一管理员邮箱并强制 MFA。
- Resend：当前代码中的默认事务邮件适配器；启用前必须完成发件域名验证并更新隐私政策。

## 环境

- local：本地 D1/R2 模拟、Turnstile 测试密钥、不发送真实邮件。
- preview：独立 D1、R2、Queue、DLQ、Access audience 与 Secret；邮件只允许管理员收件箱。
- production：独立资源与 Secret；只有 `main` 分支部署。

生产数据不得复制到本地或预览环境。预览环境使用固定合成账号和评论。

## 唯一管理员

后台不提供管理员注册或提权接口。Cloudflare Access 只允许 `ADMIN_EMAIL`，Worker 验证 Access JWT 的签名、audience、过期时间和邮箱。Cloudflare、GitHub、邮箱及身份提供商均应启用 MFA；保留两枚安全密钥和离线恢复码。

## 发布门槛

1. 三套 D1/R2/Queue 资源已创建并绑定。
2. 迁移先 local，再 preview，最后 production。
3. Access 已覆盖后台页面和管理 API，直连 workers.dev 不能绕过 JWT 校验。
4. Turnstile 生产域名和密钥已配置。
5. 邮件发件域名 SPF、DKIM、DMARC 已通过，DLQ 告警已配置。
6. 隐私政策已写明最终邮件供应商、境外接收方和联系方式。
7. 管理员邮箱、Access team domain、audience、Secret 只存在 Cloudflare Secret/vars。
8. 完成注册、验证、登录、评论、附件、举报、申诉、导出、注销及恢复演练。

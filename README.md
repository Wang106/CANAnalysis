# CAN·Scope — CAN 信号波形分析工具

一个纯前端的 CAN 总线信号分析网页工具，基于 DBC 数据库文件与 ASC 日志文件，解析 CAN 信号并可视化为波形曲线，支持多信号同步缩放与自动异常检测。

## 功能特性

- **加载 DBC 文件**：解析 `BO_`/`SG_`/`VAL_`，支持 Intel/Motorola 双字节序、有符号信号、factor/offset 物理量转换、枚举值表及标准 multiplex 信号
- **加载 ASC 文件**：分块异步解析，带进度条，按通道与 Rx/Tx 隔离数据源，支持标准帧与扩展帧
- **信号选择**：树形列表按报文分组，支持搜索筛选、全选/清空，自动标记 ASC 中有数据的信号
- **多曲线展示**：每个信号独占一个显示区域，等宽满屏，从上往下依次排列，互不重叠
- **横轴同步**：鼠标滚轮缩放横轴，所有信号区域同步联动；拖拽平移横轴
- **纵轴独立**：`Shift`+滚轮单独缩放每个区域的纵轴，亦可手动输入 Y 范围或一键自适应
- **自动分析**：汇总报文总数/时间范围/报文率/未知ID，并检测信号超量程、恒定/卡死、报文丢帧等问题

## 在线访问

已部署至 Cloudflare，访问根 URL 即可使用：

```
https://can-analysis.<your-subdomain>.workers.dev
```

## 本地使用方法

1. 克隆或下载本仓库
2. 用浏览器（推荐 Chrome）打开 `public/index.html`
3. 依次点击「加载 DBC 文件」「加载 ASC 文件」
4. 在左侧勾选需要分析的信号
5. 点击「生成曲线」，需要异常汇总时再点击「报文分析」

> 若仅拷贝 `index.html` 单文件，联网时会自动从 CDN 加载图表库，无需额外文件。

## 部署到 Cloudflare

本项目使用 [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) 部署，仓库根目录的 `wrangler.jsonc` 已配置好静态资源目录。

```bash
# 安装 wrangler
npm install -D wrangler

# 部署
npx wrangler deploy
```

在 Cloudflare Dashboard 中连接此 GitHub 仓库后，Build 配置如下：
- **Build command**: 留空（纯静态项目无需构建）
- **Deploy command**: `npx wrangler deploy`

## 鼠标/键盘操作

| 操作 | 效果 |
|------|------|
| 滚轮 | 横轴缩放（所有区域同步） |
| `Shift` + 滚轮 | 当前区域纵轴缩放（独立） |
| 拖拽 | 平移横轴（所有区域同步） |

## 示例文件

仓库附带 `public/sample.dbc` 与 `public/sample.asc` 可直接试用，包含正弦波、恒定值、超量程、丢帧、未知 ID 等多种测试场景。

## 技术栈

- 纯 HTML + JavaScript，无后端依赖
- [ECharts 5.5](https://echarts.apache.org/) 用于波形绘制
- 支持大文件（百万级报文）解析，使用 TypedArray 紧凑存储与 LTTB 降采样渲染

## 数据兼容性说明

- 同一 ASC 文件包含多个通道或同时包含 Rx/Tx 时，页面会显示数据源选择框，避免同 ID 数据相互混合。
- RTR、数据字节不足及同一数据源内 DLC 异常变化的帧会被跳过，并在加载提示中显示数量。
- JavaScript 无法精确表示超过 53 位的整数；54–64 位 DBC 信号会明确标记并停止绘制，避免给出错误波形。
- DBC 与 ASC 文件只在浏览器本地解析，不会上传到服务器。

## 回归测试

从仓库根目录启动静态服务器：

```bash
python3 -m http.server 8000
```

访问 `http://127.0.0.1:8000/tests/regression.html`，页面应显示全部测试通过。

版本变更与回滚基线见 [`CHANGELOG.md`](CHANGELOG.md)。

## 许可

MIT License

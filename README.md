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
- **固定导航**：页面向下滚动时栏目导航保持在屏幕顶部；CAN 解析页生成曲线后自动缩回，释放曲线空间

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
- 支持大文件（百万级报文）解析，采用约 8 ms 自适应时间片保持界面响应，并使用 TypedArray 紧凑存储与 LTTB 降采样渲染

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

版本变更与回滚基线见 [`CHANGELOG.md`](CHANGELOG.md)。部署时由 `public/version.json` 保存页面代码提交号，避免 GitHub 公共 API 限流导致版本信息空白。

## CAN 日志格式转换

访问 `/convert`（导航中的「格式转换」），页面按三行组织：第一行选择源日志，第二行统一转换原始日志格式，第三行通过 DBC 选择信号并导出 CSV。默认原始输出为 Vector ASC；支持 ASC、BusMaster LOG、PCAN TRC、Vector BLF、周立功 TXT、MF4、MDF 七种原始日志格式，以及独立的 DBC 信号 CSV。文件通过浏览器 Worker 本地处理，不上传服务器；需要通过 HTTP/HTTPS 打开，不能直接以 `file://` 运行模块 Worker。

在支持 File System Access API 的桌面浏览器中，通过页面按钮选择源文件后，转换前会打开保存确认框并默认定位到源文件所在目录，输出沿用源文件名主体并替换扩展名；确认后在转换完成时自动写入。浏览器不提供原路径、用户取消授权、目录不可用或写入失败时，页面改为提供同名文件下载。受浏览器安全机制限制，网页不能静默读取或写入完整本地路径；iPhone Safari 使用下载回退。

- 可一次选择多个文件，也可混合选择不同源格式；页面逐个自动识别并统一转换为所选目标格式，源格式与目标格式相同的文件自动忽略。每个输入仍生成一个保留原名称主体的独立结果。
- 经典 CAN 数据帧、标准/扩展 ID、远程帧、收发方向和通道可转换；CAN FD 支持 ASC/TRC/BLF/MF4，其他目标会明确拒绝，避免截断数据。
- BLF 支持普通与 zlib 容器；MF4 支持 4.00–4.11 的原始 `CAN_DataFrame` / `CAN_RemoteFrame` 记录（DT、DL、HL、Deflate/转置 Deflate）；输出 MDF 4.10。MDF3 输出 3.30 原始字段，读取默认小端 IEEE 格式。
- MDF/MF4 仅有解码信号而无原始 CAN 帧时不能转换；暂不支持 MDF 4.20+、加密、可变长/远程主通道布局及 ZSTD/LZ4。
- LOG 读取经典 CAN 的 ABSOLUTE/SYSTEM 时间模式，输出 ABSOLUTE；相对时间模式明确拒绝。TRC 读取 1.0/1.1/1.3/2.0/2.1，输出 2.1；2.x 要求数据列 `D` 在末尾。
- TXT 要求可识别的 CANTest/ZCAN 表头且数据列在末尾，支持 UTF-8、GB18030 和带 BOM 的 UTF-16。提供时间单位选择，非所有周立功软件版本都采用相同表格。
- 保留日志内时间轴，不迁移采集日期、附件、触发元数据；LOG 精度为 0.1 ms，TRC 为 1 µs，舍入会提示。MDF BusChannel 按 python-can 的零起始规则与页面一起始通道互换。
- 文本分片读取，输出分块组装；单压缩块限制 64 MB、单输出累积器限制 1 GB。手机可用内存更少，大于 200 MB 建议在电脑上转换。
- CSV 模式额外加载 DBC，可搜索并勾选信号，支持 100–1000 ms（每 100 ms 一档）采样间隔。列依次为序号、时间（秒）和所选信号；每个时间点使用此前最近的有效报文值，信号尚未出现时留空。支持 Intel/Motorola、带符号、factor/offset、基础复用及 DBC Float32/Float64。

新增测试（先加入独立样本及失败用例，再实现引擎）：

```bash
node tests/convert.test.mjs
node tests/batch.test.mjs
node tests/csv.test.mjs
node tests/nav-state.test.cjs
pip install python-can asammdf
python tests/verify-convert-output.py
npm install --no-save playwright
npx playwright install chromium
node tests/browser-convert.cjs
```

独立样本由 `tests/generate-convert-fixtures.py` 生成，提交的 JSON 样本让 Node 回归测试无需 Python 依赖。Python 交叉验证使用 python-can / asammdf 读取本引擎生成的真实文件，不仅依靠自有读写器互测。浏览器测试检查七种原始日志下载、混合格式多文件队列、同格式跳过、DBC 信号 CSV、移动布局、取消/错误流程及原有解析/导航回归；可通过 `PLAYWRIGHT_MODULE`、`CHROMIUM_PATH` 指定现有安装。

格式参考：[python-can BLF 实现](https://python-can.readthedocs.io/en/stable/_modules/can/io/blf.html)、[PEAK TRC 官方格式](https://www.peak-system.com/produktcd/Pdf/English/PEAK_CAN_TRC_File_Format.pdf)、[asammdf 原始总线日志](https://asammdf.readthedocs.io/en/latest/buslogging.html)。

## 许可

MIT License

# CANAnalysis — CAN 数据分析工作区

一个面向 CAN 测试与工程分析的网页工具集，包含在线设备连接、DBC/ASC 离线解析、日志格式转换、信号 CSV 导出和站点功能说明。

## 功能特性

- **加载 DBC 文件**：解析 `BO_`/`SG_`/`VAL_`，支持 Intel/Motorola 双字节序、有符号信号、factor/offset 物理量转换、枚举值表及标准 multiplex 信号
- **加载 ASC 文件**：分块异步解析，带进度条，按通道与 Rx/Tx 隔离数据源，支持标准帧与扩展帧
- **信号选择**：树形列表按报文分组，支持搜索筛选、全选/清空，自动标记 ASC 中有数据的信号
- **多曲线展示**：每个信号独占一个显示区域，等宽满屏，从上往下依次排列，互不重叠
- **横轴同步**：鼠标滚轮缩放横轴，所有信号区域同步联动；拖拽平移横轴
- **纵轴独立**：`Shift`+滚轮单独缩放每个区域的纵轴，亦可手动输入 Y 范围或一键自适应
- **自动分析**：汇总报文总数/时间范围/报文率/未知ID，并检测信号超量程、恒定/卡死、报文丢帧等问题
- **固定导航**：页面向下滚动时栏目导航保持在屏幕顶部；CAN 解析页生成曲线后自动缩回，释放曲线空间
- **中英双语**：导航栏右侧可在中文与 English 之间切换，选择会跨页面保留，静态内容与运行时状态同步切换
- **在线连接（未验证预览）**：`/online` 通过只监听本机的连接服务接入 PCAN、周立功 USBCAN 与 Vector 设备，固定为只接收。首页卡片保持灰色不可点击，导航保留预览入口；实物验收完成前不是正式功能

## 在线访问

生产站点由维护者在 Cloudflare 上发布。仓库里的 GitHub Actions 只做验证，不会部署生产。

## 本地安装与验证

需要 Node.js 22 或更新版本、Python 3.12 和 Git。

```bash
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
npx playwright install chromium
npm test
```

`npm test` 与 `npm run verify` 是同一个入口，按依赖分成三层：

- `npm run verify:core`：Node 转换器、页面契约、社区安全、版本清单和安全响应头。只需要 `npm ci`。
- `npm run verify:python`：本机桥接单元测试，以及用 python-can / asammdf 交叉读取转换结果。需要上面的 Python 虚拟环境。
- `npm run verify:browser`：Playwright 打开首页、离线解析、格式转换、在线连接和关于页。需要已安装的 Chromium。

静态预览带有与 `public/_headers` 相同的响应头，不连接 Cloudflare 账号：

```bash
npm run version:generate
npm run preview:static
```

然后用浏览器打开终端里的地址。离线解析在 `/offline`，格式转换在 `/convert`，在线预览在 `/online`。加载 DBC 与 ASC 后勾选信号，再点击「生成曲线」。

需要同时看 Worker 路由时，在本机执行 `npx wrangler dev --local`。该命令会先根据当前 Git 提交重新生成 `public/version.json`。

## 版本

从 1.2.0 起使用语义化版本。页面展示提交号的前八位和 Git 提交日期。日期来自提交者时间；`generatedAt` 只记录清单生成时刻，页面不把它当成发布时间。清单里的 `commit` 与 `committedAt` 都有效时，页面直接使用清单。只有清单不完整时才询问 GitHub API。两处都没有有效时间时，发布日期留空，不显示 `2000-01-01`。

`wrangler dev` 和 `wrangler deploy` 会在上传前运行 `node scripts/generate-version.mjs`。仓库里提交的 `public/version.json` 是最近一次生成的快照，部署时会被当前检出的提交覆盖。

发布步骤、验证命令和生产门禁见 [`docs/release.md`](docs/release.md)。变更记录见 [`CHANGELOG.md`](CHANGELOG.md)。

## 部署

静态资源目录由 `wrangler.jsonc` 配置，使用 [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)。

维护者需要在 Cloudflare 控制台手工完成这些设置，仓库里的工作流不能代替它们：

- 构建命令使用 `npm ci && node scripts/generate-version.mjs`。
- 部署命令可以继续使用 `npx wrangler deploy`，并且只在 GitHub Actions 的 `verify` 成功后运行。
- 保持 `COMMUNITY_ENABLED=false`。

不要把生产 Secret 放进 GitHub Actions。当前工作流不读取 Secret。

## 鼠标/键盘操作

| 操作 | 效果 |
|------|------|
| 滚轮 | 横轴缩放（所有区域同步） |
| `Shift` + 滚轮 | 当前区域纵轴缩放（独立） |
| 拖拽 | 平移横轴（所有区域同步） |

## 示例文件

仓库附带 `public/sample.dbc` 与 `public/sample.asc` 可直接试用，包含正弦波、恒定值、超量程、丢帧、未知 ID 等多种测试场景。

## 技术栈

- 离线解析和格式转换在浏览器本地完成。打开页面不会上传 DBC、ASC 或其他日志。
- Cloudflare Worker 提供 `/api/*`。社区、账号、评论和管理接口已经写在仓库里，`COMMUNITY_ENABLED=false` 时这些接口返回 503。
- D1、R2、Queue 和 Cron 属于尚未启用的社区后端。
- 在线连接页面通过本机 `ws://127.0.0.1:8765` 访问 Windows 桥接服务，目前是未验证预览。
- [ECharts 5.5](https://echarts.apache.org/) 用于波形绘制。
- 支持大文件（百万级报文）解析，采用约 8 ms 自适应时间片保持界面响应，并使用 TypedArray 紧凑存储与 LTTB 降采样渲染。

## 数据兼容性说明

- 同一 ASC 文件包含多个通道或同时包含 Rx/Tx 时，页面会显示数据源选择框，避免同 ID 数据相互混合。
- RTR、数据字节不足及同一数据源内 DLC 异常变化的帧会被跳过，并在加载提示中显示数量。
- JavaScript 无法精确表示超过 53 位的整数；54–64 位 DBC 信号会明确标记并停止绘制，避免给出错误波形。
- DBC 与 ASC 文件只在浏览器本地解析，不会上传到服务器。

## 回归测试

完整验证使用 `npm test`。它会运行 Node 套件、Python 套件，以及 Playwright 打开的 `tests/regression.html`。只想在浏览器里看离线解析页的旧测试页时，可以从仓库根目录执行 `python3 -m http.server 8000`，再访问 `http://127.0.0.1:8000/tests/regression.html`。这个临时服务器不会附带生产响应头；检查响应头时用 `npm run preview:static`。

## CAN 日志格式转换

访问 `/convert`（导航中的「格式转换」），先选择一个或多个源日志，下方提供默认折叠的“日志格式转换”和“DBC 信号转换为 CSV”两个横向栏目，点击标题即可展开或再次折叠。原始日志目标格式以七张卡片展示，默认选中 Vector ASC，也可切换 BusMaster LOG、PCAN TRC、Vector BLF、周立功 TXT、MF4 或 MDF。文件通过浏览器 Worker 本地处理，不上传服务器；需要通过 HTTP/HTTPS 打开，不能直接以 `file://` 运行模块 Worker。

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

下面这些转换和页面测试由 `npm test` 按层调用。`tests/browser-convert.cjs` 在 browser 层里，会检查七种格式下载、英文界面和关于页里仍关闭的社区表单。需要单独复现某一项时可以直接运行：

```bash
node tests/convert.test.mjs
node tests/batch.test.mjs
node tests/csv.test.mjs
node tests/nav-state.test.cjs
node tests/about-page.test.cjs
pip install python-can asammdf
python tests/verify-convert-output.py
npm install --no-save playwright
npx playwright install chromium
node tests/about-scroll.test.cjs
node tests/about-ocean-motion.test.cjs
node tests/browser-convert.cjs
```

独立样本由 `tests/generate-convert-fixtures.py` 生成，提交的 JSON 样本让 Node 回归测试无需 Python 依赖。Python 交叉验证使用 python-can / asammdf 读取本引擎生成的真实文件，不仅依靠自有读写器互测。浏览器测试检查七种原始日志下载、混合格式多文件队列、同格式跳过、DBC 信号 CSV、移动布局、取消/错误流程及原有解析/导航回归；可通过 `PLAYWRIGHT_MODULE`、`CHROMIUM_PATH` 指定现有安装。

格式参考：[python-can BLF 实现](https://python-can.readthedocs.io/en/stable/_modules/can/io/blf.html)、[PEAK TRC 官方格式](https://www.peak-system.com/produktcd/Pdf/English/PEAK_CAN_TRC_File_Format.pdf)、[asammdf 原始总线日志](https://asammdf.readthedocs.io/en/latest/buslogging.html)。

## 页面与路由

- `/`：首页，展示全部页面入口；未实现栏目以灰色卡片标记为“开发中”。
- `/online`：在线连接的未验证预览。首页卡片不可点击，导航保留入口。PCAN、周立功 USBCAN 和 Vector 仍等待实物验收。
- `/offline`：DBC 与 ASC 离线报文解析、曲线和统计。
- `/convert`：CAN 日志格式转换与 DBC 信号 CSV。
- `/gbt27930`：GB/T 27930—2015 离线分析。只读取本地经典 ASC，覆盖已核对的单帧报文和 BAM 重组后的 BCP、BCS。首页状态是“2015离线”，不是已完成实物验收。
- `/j1939`：SAE J1939-21 基础离线分析。只读取本地经典 ASC，归一 PDU1/PDU2 的 PGN，并重组 BAM 和日志中已有的 RTS 数据。没有 J1939DA。首页状态是“基础离线”。
- `/aboutus`：本站介绍、数据隐私说明与支持方式。
- 友情链接仍是规划栏目，首页显示但暂不可进入。

## 在线连接 CAN 设备

在线连接目前是未验证预览。首页对应卡片是灰色且不可点击，导航里仍保留 `/online`，方便在没有实物时检查页面。网页不加载厂商 DLL，而是连接当前 Windows 电脑上的 `bridge/cananalysis_bridge.py`。CAN 数据只经过本机回环地址，不上传到 Cloudflare。页面可以配置设备型号、设备序号、通道、Classical CAN/CAN FD、仲裁波特率与数据波特率。页面协议固定带上 `listenOnly: true`。PCAN 与 Vector 会把该要求交给 python-can 已有的只听参数；周立功 USBCANFD 使用 zlgcan 的 `ListenOnly`。USBCAN-I/II 的现有后端没有已确认的只听参数，服务会拒绝打开。单元测试不代替实物验收。

首批设备配置包括：

- PEAK PCAN-USB、PCAN-USB FD；
- 周立功 USBCAN-I、USBCAN-II、USBCANFD；
- Vector VN16xx、VN56xx。

本机服务的驱动准备和启动方法见 [`bridge/README.md`](bridge/README.md)。由于仓库
不能包含厂商驱动和硬件，自动测试使用模拟总线验证连接生命周期；每种型号正式
使用前仍需在对应驱动版本和实物设备上完成回归。

在线连接相关测试：

```bash
node tests/online-page.test.cjs
python -m unittest tests.test_bridge
```

## 许可

MIT License

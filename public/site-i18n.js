/* Shared Chinese/English language switcher and live DOM translator. */
(() => {
  'use strict';
  const STORAGE_KEY = 'cananalysis-language';
  const SKIN_KEY = 'cananalysis-skin';
  const exact = new Map(Object.entries({
    '中文':'Chinese','语言切换':'Language','本站栏目':'Site sections','栏目导航':'Site navigation',
    '首页':'Home','CAN报文解析':'CAN Message Analysis','格式转换':'Format Conversion','27930报文分析':'GB/T 27930 Analysis','J939分析':'J1939 Analysis','友情链接':'Links','关于本站':'About',
    'CAN报文解析 · CANAnalysis':'CAN Message Analysis · CANAnalysis','格式转换 · CANAnalysis':'Format Conversion · CANAnalysis','关于本站 · CANAnalysis':'About · CANAnalysis',
    '未加载':'Not loaded','加载DBC文件':'Load DBC File','加载ASC文件':'Load ASC File','ASC 数据源':'ASC data source','信号选择':'Signal Selection','搜索信号名 / 报文名…':'Search signal / message name…',
    '共':'Total','个，已选':'selected','个，':'items,','=有数据':'=has data','滚轮在':'Wheel over','底部横轴':'bottom X-axis','纵轴':'Y-axis','=缩放横轴 · 滚轮在':'=zoom X · wheel over','=缩放纵轴 · 滚轮在曲线区=上下滚动':'=zoom Y · wheel over charts=scroll vertically',
    '报文分析':'Message Analysis','生成曲线':'Generate Charts','可选信号':'Available Signals','筛除无数据信号':'Hide Signals Without Data','全选':'Select All','已选信号':'Selected Signals','清空无数据信号':'Remove Signals Without Data','清空':'Clear',
    '请先加载 DBC 文件':'Load a DBC file first','请先加载DBC文件':'Load a DBC file first','勾选左侧信号后自动出现在此':'Selected signals appear here automatically','勾选左侧信号后显示在此':'Selected signals appear here','无匹配信号':'No matching signals','没有匹配的信号':'No matching signals',
    '切换为CANalyzer风格':'Switch to CANalyzer Style','切换为默认风格':'Switch to Default Style','切换曲线显示区域与信号名称列表的样式':'Switch chart and signal-list style','加载 DBC 与 ASC 文件后，选择信号并生成曲线':'Load DBC and ASC files, select signals, then generate charts',
    '当前曲线 min':'Current chart min','当前曲线 max':'Current chart max','当前曲线 Y 轴最小值':'Current chart Y-axis minimum','当前曲线 Y 轴最大值':'Current chart Y-axis maximum','X轴自适应':'Fit X-axis','Y轴自适应':'Fit Y-axis','圆点':'Points','全屏显示曲线':'View charts fullscreen','退出全屏':'Exit fullscreen',
    '解析中…':'Parsing…','处理中…':'Processing…','取消':'Cancel','已运行 30 秒，是否继续？':'This task has run for 30 seconds. Continue?','继续':'Continue','已取消当前动作':'Current action cancelled','信号选择已变化，请重新生成曲线':'Signal selection changed. Generate charts again.',
    '报文统计':'Message Statistics','1. 帧间隔（时间差）统计':'1. Frame Interval Statistics','报文名称':'Message Name','总帧数':'Total Frames','平均帧间隔/ms':'Average Interval / ms','最小帧间隔/ms':'Minimum Interval / ms','最大帧间隔/ms':'Maximum Interval / ms','当前数据源没有可统计的报文':'No messages are available for statistics in the current data source.',
    '报文总数':'Total frames','不同ID数':'Unique IDs','平均报文率':'Average rate','数据源':'Data source','时间范围':'Time range','未知ID(DBC未定义)':'Unknown IDs (not in DBC)','✓ 未检测到明显异常':'✓ No obvious issues detected','无数据':'No data','远程帧':'Remote frame','拖动排序':'Drag to reorder',
    '文件本地处理':'Files stay local','换一种格式，':'Change the format,','继续分析。':'keep analyzing.','01 — 源文件 · 02 — 格式转换 · 03 — 信号 CSV':'01 — Source Files · 02 — Format Conversion · 03 — Signal CSV',
    '日志格式转换':'Log Format Conversion','选择源文件':'Select Source Files','选择或拖入一个或多个 CAN 日志':'Select or drop one or more CAN logs','支持 ASC、LOG、TRC、BLF、TXT、MF4、MDF 等七种日志格式 · 可混合选择不同格式':'Supports seven log formats: ASC, LOG, TRC, BLF, TXT, MF4 and MDF · Mixed formats allowed','选择日志文件':'Choose Log Files',
    '文本编码与时间设置':'Text Encoding & Time Settings','文本文件编码':'Text file encoding','UTF-8（默认）':'UTF-8 (default)','GBK / GB18030（中文旧日志）':'GBK / GB18030 (legacy Chinese logs)','周立功 TXT 时间单位':'ZLG TXT time unit','按表头识别':'Detect from header','秒 (s)':'Seconds (s)','毫秒 (ms)':'Milliseconds (ms)','微秒 (µs)':'Microseconds (µs)','0.1 毫秒 / 计数':'0.1 ms / count','UTF-16 文件根据 BOM 自动识别。TXT“时间标识”默认按 0.1 毫秒计数，其余时间列按秒；请核对设备导出设置。':'UTF-16 is detected from the BOM. TXT time markers default to 0.1 ms per count; other time columns use seconds. Verify the export settings of your device.',
    '点击展开':'Expand','点击收起':'Collapse','统一转换为 ASC、LOG、TRC、BLF、TXT、MF4 或 MDF':'Convert all files to ASC, LOG, TRC, BLF, TXT, MF4 or MDF','选择目标转换格式':'Choose target format','目标转换格式':'Target format','推荐':'Recommended','经典 CAN':'Classic CAN','二进制日志':'Binary log','文本表格':'Text table',
    '通用文本日志，保留时间、ID、通道与原始数据，适合导入 CAN 报文解析工具。':'Universal text log preserving time, ID, channel and raw data for CAN analysis tools.','支持经典 CAN、CAN FD 和远程帧':'Supports Classic CAN, CAN FD and remote frames','支持经典 CAN 和远程帧':'Supports Classic CAN and remote frames','转换所选文件':'Convert Selected Files','将首帧时间归零，保留帧间时间差':'Set first frame time to zero while preserving intervals','所有文件统一转换为目标格式；源格式与目标格式一致的文件会自动忽略。':'All files are converted to the target format; files already in that format are skipped.',
    '转换为 CSV 文件':'Convert to CSV','选择信号并按固定时间间隔导出宽表':'Select signals and export a wide table at fixed intervals','选择 DBC 文件':'Choose DBC File','未选择 DBC':'No DBC selected','选择信号值':'Select Signals','搜索信号名 / 报文名…':'Search signal / message name…','全选当前结果':'Select All Results','确定时间间隔':'Set Time Interval','开始转换':'Start Conversion','转换为 CSV':'Convert to CSV','每个所选日志分别生成一个 CSV。列顺序为：序号、时间、所选信号；每个固定时间点使用此前最近一次报文值，尚未出现的信号留空。':'Each selected log produces one CSV. Columns are index, time and selected signals. Each interval uses the most recent value; signals not yet seen remain blank.',
    '文件不会上传到服务器。支持文件访问权限的浏览器会在转换前确认保存位置；其他浏览器转换后逐个提供下载。':'Files are never uploaded. Browsers with file-access support confirm the save location before conversion; other browsers provide downloads afterward.','转换进度':'Conversion progress','转换完成':'Conversion Complete','下载转换文件 ↓':'Download Converted File ↓','前 8 帧预览':'First 8 Frames','首个结果的前 8 帧预览':'First 8 Frames of the First Result','首个结果的前 8 行 CSV 预览':'First 8 CSV Rows of the First Result','时间 / s':'Time / s','通道':'Channel','方向':'Direction','类型':'Type','数据 / hex':'Data / hex',
    '格式与兼容范围说明':'Formats & Compatibility Guide','转换的是原始 CAN 数据帧与远程帧。各工具的专有事件、注释和触发信息不在转换范围内。':'Conversion covers raw CAN data and remote frames. Tool-specific events, comments and trigger metadata are not converted.','格式':'Format','读取':'Input','输出':'Output','经典 CAN / CAN FD 文本日志':'Classic CAN / CAN FD text log','ASC，经典 CAN / CAN FD':'ASC, Classic CAN / CAN FD','经典 CAN，ABSOLUTE / SYSTEM 时间模式':'Classic CAN, ABSOLUTE / SYSTEM time modes','BusMaster 经典 CAN 日志，时间精度 0.1 ms':'BusMaster Classic CAN log, 0.1 ms precision','TRC 2.1，经典 CAN / CAN FD':'TRC 2.1, Classic CAN / CAN FD','未压缩 / zlib 日志容器，经典 CAN / CAN FD':'Uncompressed / zlib log container, Classic CAN / CAN FD','未压缩 BLF，经典 CAN / CAN FD':'Uncompressed BLF, Classic CAN / CAN FD','周立功':'ZLG','含表头的 CANTest / ZCAN 表格；支持选择编码与时间单位':'CANTest / ZCAN table with header; configurable encoding and time unit','UTF-8 经典 CAN 表格，数据列位于末尾':'UTF-8 Classic CAN table with data in the final column','4.00–4.11 原始 CAN 帧；未压缩、Deflate、转置 Deflate':'4.00–4.11 raw CAN frames; uncompressed, Deflate and transposed Deflate','MDF 4.10 原始 CAN 记录，可用 asammdf 打开':'MDF 4.10 raw CAN records, readable by asammdf','3.x 中带 CAN_DataFrame 字段的原始帧':'3.x raw frames with CAN_DataFrame fields','MDF 3.30 经典 CAN 原始字段，可用 asammdf 打开':'MDF 3.30 Classic CAN raw fields, readable by asammdf','DBC 信号':'DBC Signals','DBC + 上述任一 CAN 日志，选择需要的信号':'DBC plus any supported CAN log with selected signals','序号、时间与信号宽表，100–1000 ms 固定间隔':'Index, time and signal wide table at fixed 100–1000 ms intervals',
    '关于 MDF/MF4：':'About MDF/MF4:','只有解码信号（例如电压、温度）而没有原始 CAN ID 和 DataBytes 的文件，无法反向还原 CAN 报文。加密文件、MDF 4.20+ 的新布局及 ZSTD/LZ4 压缩暂不支持。':'Files containing only decoded signals without raw CAN IDs and DataBytes cannot be reconstructed. Encrypted files, MDF 4.20+ layouts and ZSTD/LZ4 compression are not supported.','数据与时间：':'Data & Time:','保留日志内时间轴；LOG 按 0.1 ms、TRC 按 1 µs 四舍五入，发生精度变化时显示提示。绝对采集日期、附件与触发元数据不迁移。MDF 通道按 python-can 的零起始 BusChannel 与页面的一起始通道互换。':'The log timeline is preserved. LOG rounds to 0.1 ms and TRC to 1 µs, with warnings for precision changes. Absolute acquisition dates, attachments and trigger metadata are not migrated. MDF channels map between python-can zero-based BusChannel values and the page’s one-based channels.','不支持的记录：':'Unsupported Records:','错误帧、无效数据或无法无损保存的 CAN FD 会停止转换并提示；不会直接截断为 8 字节。周立功 TXT 不同软件版本的列结构可能不同，表头不匹配时会显示原因。':'Error frames, invalid data or CAN FD that cannot be saved losslessly stop conversion with an explanation; data is never silently truncated to 8 bytes. ZLG TXT column layouts vary by version, and header mismatches are reported.','CANAnalysis · 格式转换':'CANAnalysis · Format Conversion',
    '纯前端 · 本地分析':'Browser-only · Local analysis','让 CAN 报文':'Make CAN data','更容易看懂':'easier to understand','CANAnalysis 是一款面向测试与工程人员的浏览器工具。加载 DBC 与 ASC 文件后，即可完成信号解码、曲线查看和报文统计，不需要安装软件，也不依赖后端服务。':'CANAnalysis is a browser tool for testing and engineering teams. Load DBC and ASC files to decode signals, inspect charts and analyze messages—without installing software or relying on a backend.','支持本站':'Support This Site','CAN 信号曲线示意图':'CAN signal chart illustration',
    '从原始报文到可读结果':'From Raw Frames to Readable Results','工具围绕日常 CAN 测试场景设计，尽量让文件加载、信号筛选、曲线观察和异常定位保持在同一个工作区中。':'Designed for everyday CAN testing, the tool keeps file loading, signal filtering, chart inspection and issue detection in one workspace.','DBC 与大型 ASC 解析':'DBC & Large ASC Parsing','识别报文、信号、单位和数值定义，并以分片方式处理大型 ASC 日志，降低移动设备读取文件时的内存压力。':'Recognizes messages, signals, units and value definitions while processing large ASC logs in chunks to reduce memory pressure on mobile devices.','信号筛选与曲线查看':'Signal Filtering & Charts','按名称或报文搜索信号，生成同步时间轴曲线，支持缩放、自适应范围、实时值观察和多种列表风格。':'Search signals by name or message, generate synchronized timeline charts, zoom and fit ranges, inspect live values and switch list styles.','报文统计与异常提示':'Message Statistics & Issue Hints','按 CAN ID 汇总帧数与帧间隔，结合 DBC 检查未知报文、信号越界、长时间恒定及疑似丢帧等现象。':'Summarizes frame counts and intervals by CAN ID, then uses the DBC to flag unknown messages, out-of-range signals, stuck values and suspected dropped frames.','手机与电脑均可使用':'Works on Phones and Computers','响应式界面适配 iPhone 横竖屏、平板和桌面浏览器，现场测试与办公分析可以使用同一套工具。':'The responsive interface supports iPhone portrait and landscape, tablets and desktop browsers for both field testing and office analysis.',
    '文件留在你的设备中':'Your Files Stay on Your Device','DBC 与 ASC 的读取、解析和绘图均在当前浏览器本地完成，本站不会主动上传你的 CAN 数据文件。':'DBC and ASC reading, parsing and charting happen locally in your browser. This site does not upload your CAN data files.','支持这个小工具':'Support This Tool','如果它帮你节省了排查时间，可以自愿支持后续维护。支持与否不会影响任何功能的使用。':'If this tool saves you troubleshooting time, you may support its continued maintenance. Every feature remains available either way.','微信':'WeChat Pay','微信扫一扫支持':'Scan with WeChat','微信二维码预留位':'WeChat QR Placeholder','支付宝':'Alipay','支付宝扫一扫支持':'Scan with Alipay','支付宝二维码预留位':'Alipay QR Placeholder','建议使用清晰的正方形二维码图片':'Use a clear square QR-code image','请在付款前核对收款方信息。二维码图片将在后续版本中补充。':'Verify the recipient before paying. QR-code images will be added in a future release.','为更高效的 CAN 数据排查而设计':'Designed for more efficient CAN data troubleshooting','返回 CANAnalysis 首页':'Return to CANAnalysis home','微信收款二维码图片预留位置':'Reserved location for WeChat payment QR code','支付宝收款二维码图片预留位置':'Reserved location for Alipay payment QR code',
    '页面还未完成开发，不急不急～':'This page is still under development.','发布':'Released','GitHub 提交号':'GitHub commit','Cloudflare 生产部署完成时间':'Cloudflare production deployment time','代码提交时间（部署记录不可用时的回退值）':'Commit time (fallback when deployment data is unavailable)','（站点版本清单）':'(site version manifest)'
  }));

  const patterns = [
    [/^(\d+) 个文件已选择$/, '$1 files selected'],
    [/^已选 (\d+) 个$/, '$1 selected'],
    [/^(.*) · (\d+) 个信号$/, '$1 · $2 signals'],
    [/^(\d+) 个信号$/, '$1 signals'],
    [/^(\d+) 个文件 · ([\d,]+) 帧 · ([\d,]+) 行 · (\d+) 个信号 · (\d+) ms$/, '$1 files · $2 frames · $3 rows · $4 signals · $5 ms'],
    [/^(\d+) 个文件转换完成 · ([\d,]+) 帧(?: · 忽略 (\d+) 个同格式文件)?$/, (_,files,frames,skipped)=>`${files} files converted · ${frames} frames${skipped?` · ${skipped} same-format files skipped`:''}`],
    [/^正在转换第 (\d+)\/(\d+) 个：(.*) → (.*)…$/, 'Converting $1/$2: $3 → $4…'],
    [/^第 (\d+)\/(\d+) 个文件已转换 ([\d,]+) 帧…$/, 'File $1/$2: $3 frames converted…'],
    [/^下载 (.+)$/, 'Download $1'],
    [/^已按原文件所在位置保存为 (.+)$/, 'Saved beside the source file as $1'],
    [/^DBC 解析失败：(.*)$/, 'DBC parsing failed: $1'],
    [/^(.*)发布$/, 'Released $1'],
    [/^(.*) · 识别中…$/, '$1 · Detecting…'],
    [/^(.*) · 大文件建议在电脑上转换$/, '$1 · Large files are best converted on a computer'],
    [/^(.*) · 可请求保存到原目录$/, '$1 · Can request saving beside the source file'],
    [/^(.*) · 转换后提供下载$/, '$1 · Download available after conversion'],
    [/^(.*) · 超过 53 位整数精度$/, '$1 · Exceeds 53-bit integer precision'],
    [/^第 (\d+) 行：(.*)$/, 'Line $1: $2'],
    [/^检测到 (\d+) 项分析结果：$/, '$1 analysis findings detected:'],
    [/^已选择 (\d+) 个信号，已渲染 (\d+) 条曲线$/, '$1 signals selected, $2 charts rendered'],
    [/^(\d+) 信号$/, '$1 signals'],
    [/^未知报文出现 (.*) 次（DBC 中未定义，无法解析信号）$/, 'Unknown message appeared $1 times (not defined in the DBC)'],
    [/^信号无数据：报文 (.*) 在 ASC 中未出现$/, 'No signal data: message $1 does not appear in the ASC log'],
    [/^信号长度为 (\d+) 位，超过浏览器可精确绘制的 53 位整数范围，已跳过以避免显示错误数值$/, 'Signal length is $1 bits, beyond the browser’s exact 53-bit integer range; skipped to avoid incorrect values'],
    [/^信号位定义超出 ASC 实际帧长度（(\d+) 字节），已跳过以避免用零补齐产生错误波形$/, 'Signal definition exceeds the ASC frame length ($1 bytes); skipped to avoid an incorrect zero-padded chart'],
    [/^当前曲线 (.*)$/, 'Current chart $1']
  ];
  const fragments = new Map(Object.entries({
    '全部转换完成。':'All conversions completed.','已取消，原文件未改动。':'Cancelled; source files were not changed.','已取消':'Cancelled','原目录写入失败，已改为提供下载。':'Writing beside the source failed; download is available instead.','当前浏览器无法访问原文件目录，转换结果可通过下方按钮下载。':'This browser cannot access the source folder; download the result below.','未确认保存位置，转换结果可通过下方按钮下载。':'No save location was confirmed; download the result below.','无法取得原目录写入权限，转换结果可通过下方按钮下载。':'Permission to write beside the source was not granted; download the result below.','所选文件格式与目标格式一致，已忽略，无需转换':'The selected file already uses the target format and was skipped.','所选文件格式均与目标格式一致，已全部忽略，无需转换':'All selected files already use the target format and were skipped.','支持经典 CAN、CAN FD 和远程帧':'Supports Classic CAN, CAN FD and remote frames','支持经典 CAN 和远程帧':'Supports Classic CAN and remote frames','；中文旧日志可尝试 GBK / GB18030 编码。':'; try GBK / GB18030 for legacy Chinese logs.','远程帧':'Remote frame','数据帧':'Data frame','标准帧':'Standard frame','扩展帧':'Extended frame','[无数据]':'[No data]','[数据长度不足]':'[Insufficient data length]','[>53位暂不绘制]':'[>53 bits: not charted]','[缺少复用开关]':'[Missing multiplexor]','DBC未定义':'Not defined in DBC','名称+[无数据]':'Name + [No data]','当前曲线':'Current chart','最小化':'Minimize','风格':'Style','GitHub 提交号':'GitHub commit','（站点版本清单）':' (site version manifest)'
  }));

  function translate(source) {
    if (!source || !/[\u3400-\u9fff]/.test(source)) return source;
    if (exact.has(source)) return exact.get(source);
    for (const [pattern, replacement] of patterns) if (pattern.test(source)) return source.replace(pattern, replacement);
    let result = source;
    for (const [from, to] of [...fragments].sort((a,b)=>b[0].length-a[0].length)) result = result.split(from).join(to);
    return result;
  }

  const textOriginal = new WeakMap(), textApplied = new WeakMap();
  const attrOriginal = new WeakMap(), attrApplied = new WeakMap();
  const watchedAttributes = ['aria-label','placeholder','title','content'];
  let language = localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh';
  let skin = localStorage.getItem(SKIN_KEY) || 'default';
  let titleOriginal = document.title;

  function translatedWhitespace(value) {
    const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);const core=match[2];
    return match[1] + (language === 'en' ? translate(core) : core) + match[3];
  }
  function applyText(node, refreshOriginal=false) {
    if (!node.parentElement || ['SCRIPT','STYLE','TEMPLATE'].includes(node.parentElement.tagName)) return;
    if (node.parentElement.closest('[data-no-i18n]')) return;
    if (!textOriginal.has(node) || refreshOriginal) textOriginal.set(node,node.nodeValue);
    const source=textOriginal.get(node), value=language==='en'?translatedWhitespace(source):source;
    textApplied.set(node,value);if(node.nodeValue!==value)node.nodeValue=value;
  }
  function attributeMaps(node) {
    if(!attrOriginal.has(node))attrOriginal.set(node,new Map());
    if(!attrApplied.has(node))attrApplied.set(node,new Map());
    return [attrOriginal.get(node),attrApplied.get(node)];
  }
  function applyAttribute(node,name,refreshOriginal=false){
    if(!node.hasAttribute?.(name)||node.closest?.('[data-no-i18n]'))return;const [originals,applied]=attributeMaps(node);
    if(!originals.has(name)||refreshOriginal)originals.set(name,node.getAttribute(name));
    const source=originals.get(name),value=language==='en'?translate(source):source;applied.set(name,value);
    if(node.getAttribute(name)!==value)node.setAttribute(name,value);
  }
  function applyTree(root) {
    if(root.nodeType===Node.TEXT_NODE){applyText(root);return;}
    if(root.nodeType!==Node.ELEMENT_NODE&&root!==document)return;
    if(root.nodeType===Node.ELEMENT_NODE)for(const name of watchedAttributes)applyAttribute(root,name);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
    while(walker.nextNode())walker.currentNode.nodeType===Node.TEXT_NODE?applyText(walker.currentNode):watchedAttributes.forEach(name=>applyAttribute(walker.currentNode,name));
  }
  function addSwitcher() {
    const nav=document.getElementById('topNav');if(!nav||document.getElementById('siteLanguage'))return;
    const wrap=document.createElement('div');wrap.className='language-switcher';wrap.dataset.noI18n='true';
    const skinControl=document.createElement('span');skinControl.className='skin-control';
    const skinSelect=document.createElement('select');skinSelect.id='siteSkin';skinSelect.setAttribute('aria-label','皮肤选择');
    skinSelect.append(new Option('默认风格','default'));skinSelect.addEventListener('change',()=>setSkin(skinSelect.value));skinControl.append(skinSelect);
    const toggle=document.createElement('button');toggle.type='button';toggle.className='language-toggle';toggle.textContent='🌐';toggle.setAttribute('aria-label','展开语言选择器');toggle.setAttribute('aria-expanded','true');
    const control=document.createElement('span');control.className='language-control';
    const face=document.createElement('span');face.className='language-face';face.setAttribute('aria-hidden','true');face.textContent='Language';
    const select=document.createElement('select');select.id='siteLanguage';select.setAttribute('aria-label','Language');
    select.append(new Option('中文','zh'),new Option('English','en'));select.value=language;
    const compact=()=>matchMedia('(max-width:760px)').matches;
    const closeLanguage=()=>{wrap.classList.remove('language-open');nav.classList.remove('language-expanded');toggle.setAttribute('aria-expanded',compact()?'false':'true');};
    toggle.addEventListener('click',event=>{if(!compact()){select.focus();return;}event.stopPropagation();const open=!wrap.classList.contains('language-open');wrap.classList.toggle('language-open',open);nav.classList.toggle('language-expanded',open);toggle.setAttribute('aria-expanded',String(open));});
    select.addEventListener('change',()=>{setLanguage(select.value);if(compact())closeLanguage();});
    document.addEventListener('pointerdown',event=>{if(compact()&&!wrap.contains(event.target))closeLanguage();});
    matchMedia('(max-width:760px)').addEventListener('change',closeLanguage);
    control.append(face,select);wrap.append(skinControl,toggle,control);nav.appendChild(wrap);closeLanguage();
  }
  function updateSwitcher() {
    const select=document.getElementById('siteLanguage');if(!select)return;
    select.value=language;
    const skinSelect=document.getElementById('siteSkin');if(skinSelect){skinSelect.value=skin;skinSelect.options[0].textContent=language==='en'?'Default Style':'默认风格';skinSelect.setAttribute('aria-label',language==='en'?'Skin selector':'皮肤选择');}
  }
  function setSkin(next,{persist=true}={}) {
    skin=next==='default'?'default':'default';if(persist)localStorage.setItem(SKIN_KEY,skin);
    document.documentElement.dataset.skin=skin;updateSwitcher();
  }
  function setLanguage(next,{persist=true}={}) {
    language=next==='en'?'en':'zh';if(persist)localStorage.setItem(STORAGE_KEY,language);
    document.documentElement.lang=language==='en'?'en':'zh-CN';
    document.title=language==='en'?translate(titleOriginal):titleOriginal;
    applyTree(document);
    updateSwitcher();
    window.dispatchEvent(new CustomEvent('site-language-change',{detail:{language}}));
  }
  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='childList')for(const node of record.addedNodes)applyTree(node);
      else if(record.type==='characterData'){
        if(record.target.nodeValue===textApplied.get(record.target))continue;applyText(record.target,true);
      }else if(record.type==='attributes'){
        const [,applied]=attributeMaps(record.target);if(record.target.getAttribute(record.attributeName)===applied.get(record.attributeName))continue;applyAttribute(record.target,record.attributeName,true);
      }
    }
  });
  function initialize(){addSwitcher();setSkin(skin,{persist:false});setLanguage(language,{persist:false});observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:watchedAttributes});}
  window.__siteI18n={get language(){return language;},get skin(){return skin;},t:value=>language==='en'?translate(value):value,setLanguage,setSkin};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();

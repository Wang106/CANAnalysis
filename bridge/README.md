# CANAnalysis 本机连接服务

该服务只监听 `127.0.0.1:8765`，把本机 CAN 适配器收到的报文转给
`https://can.whf969.com/online`。页面和协议都固定发送 `listenOnly: true`。
服务没有发送报文的操作；请求里缺少或关闭只听时，会直接拒绝，不会打开总线。

软件检查和实物验收是两件事。下面的参数来自已安装的 python-can 4.6.1，以及已发布的 zlgcan 0.3.0、canalystii 0.1 源码，尚未在 PCAN、Vector 或周立功设备上验证。首页仍把在线连接标为未验证预览。

## Windows 安装

1. 安装 64 位 Python 3.11 或更高版本。
2. 安装设备厂商驱动，并先用厂商工具确认设备能够正常收报文。
3. 双击 `bridge/start.bat`。窗口显示 `ws://127.0.0.1:8765` 后保持运行。
4. 使用 Chrome 或 Edge 打开 `https://can.whf969.com/online`，点击“检测服务”。

也可以在仓库根目录手动启动：

```powershell
python -m pip install -r bridge/requirements.txt
python -m bridge.cananalysis_bridge
```

## 厂商准备

- **PCAN-USB / PCAN-USB FD**：安装 PEAK 驱动与 PCAN-Basic。软件把 `state` 设为 python-can 的 `BusState.PASSIVE`，该实现会打开 `PCAN_LISTEN_ONLY`。
- **Vector VN16xx / VN56xx**：安装 Vector Driver Setup/XL Driver Library，
  并在 Vector Hardware Configuration 中分配应用通道。软件传入 `listen_only=True`，由 VectorBus 调用 `XL_OUTPUT_MODE_SILENT`。
- **周立功 USBCAN-I / USBCAN-II**：python-can 的 canalystii 后端和 canalystii 0.1 只把初始化模式写成固定的 `0`，没有已确认的只听参数。服务会拒绝打开这两类设备，避免以默认可发送方式启动。
- **周立功 USBCANFD**：安装 ZLGCAN 驱动，将官方 `library` 目录路径写入
  `CANANALYSIS_ZLGCAN_LIBRARY` 环境变量；目录应包含匹配 Python 位数的 DLL
  和 `bitrate.cfg.yaml`。软件使用 zlgcan 0.3.0 的 `ZCanChlMode.ListenOnly`，并把数据域波特率同时写入该版本读取的 `dbitrate`。当前设备类型常量仍是 `ZCAN_USBCANFD_200U`，其他 FD 型号不在这次软件检查范围内。

示例：

```powershell
$env:CANANALYSIS_ZLGCAN_LIBRARY="C:\ZLGCAN\library"
python -m bridge.cananalysis_bridge
```

由于硬件、驱动和 SDK 均不包含在本仓库内，单元测试只验证配置和失败路径。
每种型号在对应驱动和实物上完成只听收发验收之前，在线连接都保持未验证预览。
驱动缺失或初始化失败会返回错误，不会报告为已连接。

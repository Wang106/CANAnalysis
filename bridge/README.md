# CANAnalysis 本机连接服务

该服务只监听 `127.0.0.1:8765`，把本机 CAN 适配器收到的报文转给
`https://can.whf969.com/online`。首版固定为只接收模式，不提供发送接口。

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

- **PCAN-USB / PCAN-USB FD**：安装 PEAK 驱动与 PCAN-Basic。
- **Vector VN16xx / VN56xx**：安装 Vector Driver Setup/XL Driver Library，
  并在 Vector Hardware Configuration 中分配应用通道。
- **周立功 USBCAN-I / USBCAN-II**：安装 ControlCAN 驱动及厂商二次开发库。
- **周立功 USBCANFD**：安装 ZLGCAN 驱动，将官方 `library` 目录路径写入
  `CANANALYSIS_ZLGCAN_LIBRARY` 环境变量；目录应包含匹配 Python 位数的 DLL
  和 `bitrate.cfg.yaml`。

示例：

```powershell
$env:CANANALYSIS_ZLGCAN_LIBRARY="C:\ZLGCAN\library"
python -m bridge.cananalysis_bridge
```

由于硬件、驱动和 SDK 均不包含在本仓库内，发布前仍需对每个具体设备做
实物回归。网页和服务会明确显示驱动缺失、通道占用或初始化失败的错误，
不会把失败误报为已连接。

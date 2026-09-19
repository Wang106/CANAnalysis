"""Receive-only loopback WebSocket bridge for supported CAN adapters."""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 8765
ALLOWED_ORIGINS = frozenset({"https://can.whf969.com"})
BITRATES = frozenset({10_000, 20_000, 33_333, 50_000, 83_333, 100_000, 125_000, 250_000, 500_000, 800_000, 1_000_000})
DATA_BITRATES = frozenset({500_000, 1_000_000, 2_000_000, 4_000_000, 5_000_000, 8_000_000})


@dataclass(frozen=True)
class DeviceModel:
    label: str
    interface: str
    channels: int
    fd: bool


DEVICE_MODELS = {
    "pcan_usb": DeviceModel("PEAK PCAN-USB", "pcan", 1, False),
    "pcan_usb_fd": DeviceModel("PEAK PCAN-USB FD", "pcan", 1, True),
    "zlg_usbcan_i": DeviceModel("周立功 USBCAN-I", "canalystii", 1, False),
    "zlg_usbcan_ii": DeviceModel("周立功 USBCAN-II", "canalystii", 2, False),
    "zlg_usbcanfd": DeviceModel("周立功 USBCANFD", "zlgcan", 2, True),
    "vector_vn16xx": DeviceModel("Vector VN16xx", "vector", 4, True),
    "vector_vn56xx": DeviceModel("Vector VN56xx", "vector", 4, True),
}


def origin_allowed(origin: str | None) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    parsed = urlparse(origin)
    return parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}


def _integer(config: dict[str, Any], name: str, default: int) -> int:
    value = config.get(name, default)
    if isinstance(value, bool):
        raise ValueError(f"{name} 参数无效")
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{name} 参数无效") from error


def build_bus_config(config: dict[str, Any]) -> dict[str, Any]:
    model_key = str(config.get("model", ""))
    if model_key not in DEVICE_MODELS:
        raise ValueError("不支持的设备型号")
    profile = DEVICE_MODELS[model_key]
    channel = _integer(config, "channel", 1)
    device_index = _integer(config, "deviceIndex", 0)
    bitrate = _integer(config, "bitrate", 500_000)
    use_fd = bool(config.get("fd", False))
    if channel < 1 or channel > profile.channels:
        raise ValueError(f"{profile.label} 不支持通道 {channel}")
    if device_index < 0:
        raise ValueError("设备序号不能为负数")
    if bitrate not in BITRATES:
        raise ValueError("不支持的仲裁波特率")
    if use_fd and not profile.fd:
        raise ValueError(f"{profile.label} 不支持 CAN FD")

    result: dict[str, Any] = {"interface": profile.interface, "bitrate": bitrate}
    if profile.interface == "pcan":
        result.update(channel=f"PCAN_USBBUS{device_index + 1}", state="PASSIVE")
    elif profile.interface == "vector":
        result.update(channel=(device_index * profile.channels) + channel - 1, state="PASSIVE", app_name="CANAnalysis")
    elif profile.interface == "canalystii":
        result.update(channel=channel - 1, device=device_index)
    else:
        result.update(
            channel=channel - 1,
            device_index=device_index,
            device_type="ZCAN_USBCANFD_200U",
            libpath=os.environ.get("CANANALYSIS_ZLGCAN_LIBRARY", "library"),
        )
    if use_fd:
        data_bitrate = _integer(config, "dataBitrate", 2_000_000)
        if data_bitrate not in DATA_BITRATES:
            raise ValueError("不支持的数据波特率")
        result.update(fd=True, data_bitrate=data_bitrate)
    return result


def _load_zlg_device_type(name: str) -> Any:
    try:
        from zlgcan.zlgcan import ZCANDeviceType  # type: ignore
    except ImportError as error:
        raise RuntimeError("未安装 zlgcan，请运行 bridge/start.bat 并安装周立功官方 SDK") from error
    try:
        return getattr(ZCANDeviceType, name)
    except AttributeError as error:
        raise RuntimeError(f"当前 zlgcan 版本缺少设备类型 {name}") from error


def open_bus(config: dict[str, Any]) -> Any:
    try:
        import can  # type: ignore
    except ImportError as error:
        raise RuntimeError("未安装 python-can，请运行 bridge/start.bat") from error
    kwargs = build_bus_config(config)
    if kwargs.get("state") == "PASSIVE":
        kwargs["state"] = can.BusState.PASSIVE
    if kwargs.get("interface") == "zlgcan":
        kwargs["device_type"] = _load_zlg_device_type(str(kwargs["device_type"]))
        channel_count = DEVICE_MODELS[str(config["model"])].channels
        kwargs["configs"] = [
            {"bitrate": kwargs["bitrate"], "data_bitrate": kwargs.get("data_bitrate"), "resistance": 0}
            for _ in range(channel_count)
        ]
    try:
        return can.Bus(**kwargs)
    except Exception as error:
        raise RuntimeError(f"设备初始化失败：{error}") from error


def list_devices() -> list[dict[str, Any]]:
    """Best-effort discovery. Static profiles remain available when a driver cannot enumerate."""
    detected: list[dict[str, Any]] = []
    try:
        import can  # type: ignore
        for interface in ("pcan", "vector"):
            with contextlib.suppress(Exception):
                for item in can.detect_available_configs(interfaces=[interface]):
                    detected.append({"interface": interface, **item})
    except ImportError:
        pass
    return detected


class BridgeSession:
    def __init__(self, websocket: Any):
        self.websocket = websocket
        self.bus: Any | None = None
        self.receive_task: asyncio.Task[None] | None = None
        self.started_at = 0.0

    async def send(self, payload: dict[str, Any]) -> None:
        await self.websocket.send(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))

    async def handle(self, request: dict[str, Any]) -> None:
        action = request.get("action")
        if action == "hello":
            await self.send({"type": "hello", "version": 1, "receiveOnly": True})
        elif action == "list_devices":
            await self.send({"type": "devices", "models": [key for key in DEVICE_MODELS], "detected": list_devices()})
        elif action == "connect":
            await self.connect(dict(request.get("config") or {}))
        elif action == "disconnect":
            await self.disconnect()
        else:
            raise ValueError("未知操作")

    async def connect(self, config: dict[str, Any]) -> None:
        await self.disconnect(notify=False)
        self.bus = await asyncio.to_thread(open_bus, config)
        self.started_at = time.monotonic()
        self.receive_task = asyncio.create_task(self.receive_loop())
        await self.send({"type": "connected", "model": config.get("model"), "receiveOnly": True})

    async def disconnect(self, notify: bool = True) -> None:
        task, self.receive_task = self.receive_task, None
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        bus, self.bus = self.bus, None
        if bus is not None:
            await asyncio.to_thread(bus.shutdown)
        if notify:
            await self.send({"type": "disconnected"})

    async def receive_loop(self) -> None:
        assert self.bus is not None
        while True:
            message = await asyncio.to_thread(self.bus.recv, 0.1)
            if message is None:
                await asyncio.sleep(0)
                continue
            timestamp = float(getattr(message, "timestamp", 0.0) or 0.0)
            await self.send({
                "type": "frame",
                "frame": {
                    "timestamp": timestamp,
                    "channel": (getattr(message, "channel", 0) or 0) + 1 if isinstance(getattr(message, "channel", 0), int) else getattr(message, "channel", ""),
                    "id": int(message.arbitration_id),
                    "extended": bool(message.is_extended_id),
                    "fd": bool(message.is_fd),
                    "dlc": int(message.dlc),
                    "data": list(message.data),
                    "direction": "Rx",
                },
            })


def _origin(websocket: Any) -> str | None:
    request = getattr(websocket, "request", None)
    headers = getattr(request, "headers", None)
    if headers is not None:
        return headers.get("Origin")
    return getattr(websocket, "request_headers", {}).get("Origin")


async def handler(websocket: Any) -> None:
    if not origin_allowed(_origin(websocket)):
        await websocket.close(code=1008, reason="Origin not allowed")
        return
    session = BridgeSession(websocket)
    try:
        async for raw in websocket:
            try:
                request = json.loads(raw)
                if not isinstance(request, dict):
                    raise ValueError("请求格式错误")
                await session.handle(request)
            except Exception as error:
                await session.send({"type": "error", "message": str(error)})
    finally:
        with contextlib.suppress(Exception):
            await session.disconnect(notify=False)


async def main() -> None:
    try:
        from websockets.asyncio.server import serve  # type: ignore
    except ImportError as error:
        raise SystemExit("缺少 websockets，请先运行 bridge/start.bat") from error
    print(f"CANAnalysis 本机连接服务已启动：ws://{HOST}:{PORT}")
    print("仅监听本机、仅接收 CAN 报文。按 Ctrl+C 停止。")
    async with serve(handler, HOST, PORT, max_size=64 * 1024, ping_interval=20, ping_timeout=20):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

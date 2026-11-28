import asyncio
import json
import unittest
from unittest.mock import MagicMock, patch

from bridge.cananalysis_bridge import (
    ALLOWED_ORIGINS,
    DEVICE_MODELS,
    BridgeSession,
    build_bus_config,
    handler,
    open_bus,
    origin_allowed,
)


class BridgeConfigurationTests(unittest.TestCase):
    def _config(self, **overrides):
        config = {'model': 'pcan_usb', 'channel': 1, 'bitrate': 500000, 'listenOnly': True}
        config.update(overrides)
        return config

    def test_supported_models_cover_requested_hardware(self):
        self.assertEqual(
            set(DEVICE_MODELS),
            {
                'pcan_usb', 'pcan_usb_fd',
                'zlg_usbcan_i', 'zlg_usbcan_ii', 'zlg_usbcanfd',
                'vector_vn16xx', 'vector_vn56xx',
            },
        )

    def test_bridge_only_accepts_site_and_local_development_origins(self):
        self.assertIn('https://can.whf969.com', ALLOWED_ORIGINS)
        self.assertTrue(origin_allowed('https://can.whf969.com'))
        self.assertTrue(origin_allowed('http://127.0.0.1:8000'))
        self.assertFalse(origin_allowed('https://example.com'))
        self.assertFalse(origin_allowed(None))

    def test_pcan_and_vector_configs_are_receive_only(self):
        pcan = build_bus_config(self._config())
        self.assertEqual(pcan['interface'], 'pcan')
        self.assertEqual(pcan['channel'], 'PCAN_USBBUS1')
        self.assertEqual(pcan['state'], 'PASSIVE')
        vector = build_bus_config(self._config(model='vector_vn16xx', channel=2))
        self.assertEqual(vector['interface'], 'vector')
        self.assertEqual(vector['channel'], 1)
        self.assertIs(vector['listen_only'], True)
        self.assertNotIn('state', vector)

    def test_missing_or_disabled_listen_only_is_rejected_for_every_model(self):
        for model in DEVICE_MODELS:
            with self.assertRaises(ValueError):
                build_bus_config(self._config(model=model, listenOnly=False))
            with self.assertRaises(ValueError):
                build_bus_config(self._config(model=model, listenOnly=None))

    def test_zlg_classic_fails_closed_and_fd_requests_vendor_listen_only(self):
        with self.assertRaisesRegex(RuntimeError, '没有已确认的只听参数'):
            build_bus_config(self._config(model='zlg_usbcan_ii', channel=2, bitrate=250000))
        with self.assertRaisesRegex(RuntimeError, '没有已确认的只听参数'):
            build_bus_config(self._config(model='zlg_usbcan_i'))
        fd = build_bus_config(self._config(
            model='zlg_usbcanfd', channel=1, bitrate=500000, dataBitrate=2000000, fd=True,
        ))
        self.assertEqual(fd['interface'], 'zlgcan')
        self.assertTrue(fd['fd'])
        self.assertEqual(fd['data_bitrate'], 2000000)
        self.assertEqual(fd['listen_only_mode'], 'ListenOnly')

    def test_invalid_channel_and_bitrate_are_rejected(self):
        with self.assertRaises(ValueError):
            build_bus_config(self._config(channel=0))
        with self.assertRaises(ValueError):
            build_bus_config(self._config(bitrate=123456))


class FakeSocket:
    def __init__(self):
        self.messages = []

    async def send(self, payload):
        self.messages.append(json.loads(payload))


class MessageSocket(FakeSocket):
    def __init__(self, raw_messages, origin='http://127.0.0.1:8000'):
        super().__init__()
        self._raw = list(raw_messages)
        self.request_headers = {'Origin': origin}

    def __aiter__(self):
        async def iterate():
            for item in self._raw:
                yield item
        return iterate()


class BridgeSessionTests(unittest.IsolatedAsyncioTestCase):
    async def test_connect_and_disconnect_manage_one_bus(self):
        socket=FakeSocket()
        session=BridgeSession(socket)
        bus=MagicMock()
        bus.recv.return_value=None
        with patch('bridge.cananalysis_bridge.open_bus', return_value=bus) as open_bus_mock:
            await session.handle({'action': 'connect', 'config': {'model': 'pcan_usb', 'channel': 1, 'bitrate': 500000, 'listenOnly': True}})
            open_bus_mock.assert_called_once()
            self.assertIs(open_bus_mock.call_args.args[0]['listenOnly'], True)
            self.assertEqual(socket.messages[-1]['type'], 'connected')
            self.assertIs(socket.messages[-1]['receiveOnly'], True)
            self.assertIsNotNone(session.receive_task)
            await session.handle({'action': 'disconnect'})
        self.assertEqual(socket.messages[-1]['type'], 'disconnected')
        bus.shutdown.assert_called_once()

    async def test_send_actions_do_not_open_a_bus(self):
        with patch('bridge.cananalysis_bridge.open_bus') as open_bus_mock:
            for action in ('send', 'transmit'):
                socket = MessageSocket([json.dumps({'action': action, 'frame': {'id': 1}})])
                await handler(socket)
                self.assertEqual(socket.messages[-1]['type'], 'error')
                self.assertIn('不提供发送', socket.messages[-1]['message'])
            open_bus_mock.assert_not_called()

    async def test_failed_open_reports_the_error_and_stays_disconnected(self):
        socket = MessageSocket([json.dumps({'action': 'connect', 'config': {'model': 'pcan_usb', 'listenOnly': True}})])
        with patch('bridge.cananalysis_bridge.open_bus', side_effect=RuntimeError('未安装 python-can，请运行 bridge/start.bat')):
            await handler(socket)
        self.assertEqual(socket.messages[-1]['type'], 'error')
        self.assertIn('未安装 python-can', socket.messages[-1]['message'])


class OpenBusTests(unittest.TestCase):
    def test_pcan_passes_passive_state_and_vector_passes_listen_only(self):
        fake_can = MagicMock()
        fake_can.BusState.PASSIVE = 'PASSIVE_ENUM'
        with patch.dict('sys.modules', {'can': fake_can}):
            open_bus({'model': 'pcan_usb', 'channel': 1, 'bitrate': 500000, 'listenOnly': True})
            open_bus({'model': 'vector_vn56xx', 'channel': 4, 'bitrate': 500000, 'listenOnly': True, 'fd': True, 'dataBitrate': 2000000})
        pcan_kwargs = fake_can.Bus.call_args_list[0].kwargs
        vector_kwargs = fake_can.Bus.call_args_list[1].kwargs
        self.assertEqual(pcan_kwargs['state'], 'PASSIVE_ENUM')
        self.assertEqual(pcan_kwargs['channel'], 'PCAN_USBBUS1')
        self.assertIs(vector_kwargs['listen_only'], True)
        self.assertNotIn('state', vector_kwargs)
        self.assertEqual(vector_kwargs['channel'], 3)

    def test_zlg_fd_open_uses_vendor_listen_only_constant(self):
        fake_can = MagicMock()
        listen_mode = object()
        device_type = object()
        with patch.dict('sys.modules', {'can': fake_can}), \
             patch('bridge.cananalysis_bridge._load_zlg_listen_only_mode', return_value=listen_mode), \
             patch('bridge.cananalysis_bridge._load_zlg_device_type', return_value=device_type):
            open_bus({'model': 'zlg_usbcanfd', 'channel': 2, 'bitrate': 500000, 'dataBitrate': 2000000, 'fd': True, 'listenOnly': True})
        kwargs = fake_can.Bus.call_args.kwargs
        self.assertIs(kwargs['device_type'], device_type)
        self.assertNotIn('listen_only_mode', kwargs)
        self.assertEqual(len(kwargs['configs']), 2)
        self.assertIs(kwargs['configs'][1]['chl_mode'], listen_mode)
        self.assertEqual(kwargs['configs'][1]['dbitrate'], 2000000)
        self.assertEqual(kwargs['configs'][1]['bitrate'], 500000)

    def test_classic_zlg_never_calls_the_bus_constructor(self):
        fake_can = MagicMock()
        with patch.dict('sys.modules', {'can': fake_can}):
            with self.assertRaisesRegex(RuntimeError, '没有已确认的只听参数'):
                open_bus({'model': 'zlg_usbcan_i', 'channel': 1, 'bitrate': 500000, 'listenOnly': True})
        fake_can.Bus.assert_not_called()


if __name__ == '__main__':
    unittest.main()

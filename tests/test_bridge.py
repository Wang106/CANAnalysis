import asyncio
import json
import unittest
from unittest.mock import MagicMock, patch

from bridge.cananalysis_bridge import (
    ALLOWED_ORIGINS,
    DEVICE_MODELS,
    BridgeSession,
    build_bus_config,
    origin_allowed,
)


class BridgeConfigurationTests(unittest.TestCase):
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
        pcan=build_bus_config({'model':'pcan_usb','channel':1,'bitrate':500000,'fd':False})
        self.assertEqual(pcan['interface'],'pcan')
        self.assertEqual(pcan['channel'],'PCAN_USBBUS1')
        self.assertEqual(pcan['state'],'PASSIVE')
        vector=build_bus_config({'model':'vector_vn16xx','channel':2,'bitrate':500000,'fd':False})
        self.assertEqual(vector['interface'],'vector')
        self.assertEqual(vector['channel'],1)
        self.assertEqual(vector['state'],'PASSIVE')

    def test_zlg_classic_and_fd_use_separate_vendor_backends(self):
        classic=build_bus_config({'model':'zlg_usbcan_ii','channel':2,'bitrate':250000,'deviceIndex':0,'fd':False})
        self.assertEqual(classic['interface'],'canalystii')
        self.assertEqual(classic['channel'],1)
        fd=build_bus_config({'model':'zlg_usbcanfd','channel':1,'bitrate':500000,'dataBitrate':2000000,'deviceIndex':0,'fd':True})
        self.assertEqual(fd['interface'],'zlgcan')
        self.assertTrue(fd['fd'])
        self.assertEqual(fd['data_bitrate'],2000000)

    def test_invalid_channel_and_bitrate_are_rejected(self):
        with self.assertRaises(ValueError):
            build_bus_config({'model':'pcan_usb','channel':0,'bitrate':500000})
        with self.assertRaises(ValueError):
            build_bus_config({'model':'pcan_usb','channel':1,'bitrate':123456})


class FakeSocket:
    def __init__(self):
        self.messages=[]

    async def send(self, payload):
        self.messages.append(json.loads(payload))


class BridgeSessionTests(unittest.IsolatedAsyncioTestCase):
    async def test_connect_and_disconnect_manage_one_bus(self):
        socket=FakeSocket()
        session=BridgeSession(socket)
        bus=MagicMock()
        bus.recv.return_value=None
        with patch('bridge.cananalysis_bridge.open_bus',return_value=bus):
            await session.handle({'action':'connect','config':{'model':'pcan_usb','channel':1,'bitrate':500000}})
            self.assertEqual(socket.messages[-1]['type'],'connected')
            self.assertIsNotNone(session.receive_task)
            await session.handle({'action':'disconnect'})
        self.assertEqual(socket.messages[-1]['type'],'disconnected')
        bus.shutdown.assert_called_once()


if __name__ == '__main__':
    unittest.main()

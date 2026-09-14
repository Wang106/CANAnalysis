"""Generate independent CAN fixtures. Requires python-can and asammdf; not used by the website."""
import base64
import io
import json
import tempfile
from pathlib import Path
import can
import numpy as np
from asammdf import MDF, Signal

root = Path(__file__).parent
frames = [
    dict(timestamp=0.125, arbitration_id=0x123, is_extended_id=False, channel=0, data=[0, 1, 0xFE, 0xFF], is_rx=True),
    dict(timestamp=3601.250123, arbitration_id=0x18FF50E5, is_extended_id=True, channel=1, data=list(range(8)), is_rx=False),
    dict(timestamp=3601.3, arbitration_id=0x7FF, is_extended_id=False, channel=0, data=[], is_rx=True),
]
fixtures = {}
with tempfile.TemporaryDirectory() as directory:
    for extension, writer in [('asc', can.ASCWriter), ('blf', can.BLFWriter), ('trc', can.TRCWriter)]:
        path = Path(directory) / ('sample.' + extension)
        out = writer(path)
        for frame in frames:
            out(can.Message(**frame))
        out.stop()
        fixtures[extension] = base64.b64encode(path.read_bytes()).decode()
    for compression in [0, 1, 2]:
        path = Path(directory) / 'sample.mf4'
        out = can.MF4Writer(path, compression_level=compression)
        origin = out._start_time
        for frame in frames:
            out(can.Message(**(frame | {'timestamp': origin + frame['timestamp']})))
        out.stop()
        fixtures['mf4-' + str(compression)] = base64.b64encode(path.read_bytes()).decode()

    mdf = MDF(version='3.30')
    times = np.array([f['timestamp'] for f in frames], dtype='<f8')
    fields = {
        'ID': np.array([f['arbitration_id'] for f in frames], dtype='<u4'),
        'BusChannel': np.array([f['channel'] for f in frames], dtype='u1'),
        'IDE': np.array([f['is_extended_id'] for f in frames], dtype='u1'),
        'Dir': np.array([not f['is_rx'] for f in frames], dtype='u1'),
        'DataLength': np.array([len(f['data']) for f in frames], dtype='u1'),
        'DLC': np.array([len(f['data']) for f in frames], dtype='u1'),
        'DataBytes': np.array([bytes(f['data']).ljust(8, b'\0') for f in frames], dtype='V8'),
    }
    mdf.append([Signal(values, times, name='CAN_DataFrame.' + key) for key, values in fields.items()], common_timebase=True)
    path = Path(directory) / 'sample.mdf'
    mdf.save(path, overwrite=True)
    mdf.close()
    fixtures['mdf'] = base64.b64encode(path.read_bytes()).decode()

(root / 'convert-fixtures.json').write_text(json.dumps(fixtures, indent=2) + '\n')
print('Generated independent ASC, BLF, TRC, MDF 3.30 and compressed/uncompressed MDF 4 fixtures')

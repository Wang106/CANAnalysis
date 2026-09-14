"""Cross-check browser-engine exports with python-can / asammdf, not our own readers."""
import io
import subprocess
import tempfile
from pathlib import Path
import can
from asammdf import MDF

project=Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory() as directory:
    script="""
      import {convert} from './public/converters/core.mjs';
      import {writeFile} from 'node:fs/promises';
      const source=new Blob(['base hex timestamps absolute\\n0.125 1 123 Rx d 4 00 01 FE FF\\n1.25 2 18FF50E5x Tx d 8 00 01 02 03 04 05 06 07\\n1.3 1 321 Rx r 8\\n']);
      for(const format of ['asc','trc','blf','mf4','mdf']){
        const {blob}=await convert(source,'asc',format);
        await writeFile(process.argv[1]+'/sample.'+format,Buffer.from(await blob.arrayBuffer()));
      }
    """
    subprocess.run(['node','--input-type=module','-e',script,directory],cwd=project,check=True)
    for extension,reader in [('asc',can.ASCReader),('trc',can.TRCReader),('blf',can.BLFReader),('mf4',can.MF4Reader)]:
        messages=list(reader(Path(directory)/('sample.'+extension)))
        assert [m.arbitration_id for m in messages]==[0x123,0x18FF50E5,0x321],extension
        assert [bytes(m.data) for m in messages]==[bytes([0,1,254,255]),bytes(range(8)),b''],extension
        assert messages[2].is_remote_frame and messages[2].dlc==8,extension
        assert messages[1].is_extended_id and not messages[1].is_rx,extension
        assert abs((messages[1].timestamp-messages[0].timestamp)-1.125)<1e-6,extension
        print('PASS: independent '+extension+' reader')
    with MDF(Path(directory)/'sample.mdf') as mdf:
        assert mdf.version=='3.30'
        assert list(mdf.get('CAN_DataFrame.ID').samples)==[0x123,0x18FF50E5]
        assert list(mdf.get('CAN_RemoteFrame.ID').samples)==[0x321]
        assert bytes(mdf.get('CAN_DataFrame.DataBytes').samples[0])[:4]==bytes([0,1,254,255])
        print('PASS: independent asammdf MDF 3.30 reader')

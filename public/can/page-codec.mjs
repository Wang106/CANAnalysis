import {applyScale, decodePhysical, signalFitsDlc, unsignedRaw} from './codec.mjs';
import {parseDbcMessageLine, parseDbcSignalLine, parseDbcValueLine} from './dbc-text.mjs';
import {parseClassicAscDataLine} from './asc-text.mjs';

globalThis.__canCodec = {
  applyScale,
  decodePhysical,
  signalFitsDlc,
  unsignedRaw,
  parseDbcMessageLine,
  parseDbcSignalLine,
  parseDbcValueLine,
  parseClassicAscDataLine,
};

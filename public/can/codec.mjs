export function signalFitsDlc(signal, dlc) {
  if (!signal || !Number.isInteger(signal.startBit) || !Number.isInteger(signal.length) || signal.startBit < 0 || signal.length <= 0 || !Number.isInteger(dlc) || dlc < 0) return false;
  let bit = signal.startBit;
  for (let i = 0; i < signal.length; i++) {
    if ((bit >>> 3) >= dlc) return false;
    if (signal.byteOrder === 1) bit++;
    else if ((bit & 7) === 0) bit += 15;
    else bit--;
  }
  return true;
}

export function rawBits(data, signal) {
  let value = 0n, bit = signal.startBit;
  if (signal.byteOrder === 1) {
    for (let i = 0; i < signal.length; i++, bit++) value |= BigInt((data[bit >>> 3] >>> (bit & 7)) & 1) << BigInt(i);
  } else {
    for (let i = 0; i < signal.length; i++) {
      value = (value << 1n) | BigInt((data[bit >>> 3] >>> (bit & 7)) & 1);
      if ((bit & 7) === 0) bit += 15;
      else bit--;
    }
  }
  return value;
}

export function unsignedRaw(data, signal) {
  const raw = rawBits(data, signal);
  return signal.length <= 32 ? Number(raw) >>> 0 : Number(raw);
}

export function applyScale(raw, signal) {
  let value = raw;
  if (signal.isSigned) {
    const sign = 2 ** (signal.length - 1);
    if (value >= sign) value -= 2 ** signal.length;
  }
  return value * signal.factor + signal.offset;
}

export function decodePhysical(data, signal) {
  if (!signalFitsDlc(signal, data.length)) throw Error('信号 ' + signal.name + ' 的位定义超出实际报文长度');
  let raw = rawBits(data, signal);
  if (signal.floatType) {
    const buffer = new ArrayBuffer(signal.floatType === 1 ? 4 : 8), view = new DataView(buffer);
    if (signal.floatType === 1) {
      view.setUint32(0, Number(raw), false);
      raw = view.getFloat32(0, false);
    } else {
      view.setBigUint64(0, raw, false);
      raw = view.getFloat64(0, false);
    }
    return raw * signal.factor + signal.offset;
  }
  if (signal.isSigned && (raw & (1n << BigInt(signal.length - 1)))) raw -= 1n << BigInt(signal.length);
  return Number(raw) * signal.factor + signal.offset;
}

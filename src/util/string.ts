import { Base64 } from './Base64';

export function pad(value: string | number, formatPattern: string = "0000"): string {
  const strValue = String(value);
  if (strValue.length >= formatPattern.length) {
    return strValue;
  }
  return formatPattern.substring(0, formatPattern.length - strValue.length) + strValue;
}

export function equalsIgnoreCase(strA: string, strB: string): boolean {
  if (strA === null || strA === undefined || strB === null || strB === undefined) {
    return strA === strB; // Handle null/undefined cases consistently
  }
  return strA.toLowerCase() === strB.toLowerCase();
}

export function binaryStringToUint8Array(binaryStr: string): Uint8Array {
  const length = binaryStr.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const charCode = binaryStr.charCodeAt(i);
    if (charCode > 255) {
      // This indicates the input string was not a 'binary string'
      // (each char code <= 255). Behavior for this case should be defined.
      // For now, taking the lower byte, similar to some implicit conversions.
      // Or, one might throw an error: throw new Error("Invalid binary string");
      console.warn(`Invalid character in binaryStringToUint8Array at index ${i}: ${binaryStr[i]} (charCode ${charCode})`);
      bytes[i] = charCode & 0xFF;
    } else {
      bytes[i] = charCode;
    }
  }
  return bytes;
}

export function base64StringToUint8Array(base64Str: string): Uint8Array {
  const decodedString = Base64.decode(base64Str);
  return binaryStringToUint8Array(decodedString);
}

export function uint8ArrayToBinaryString(bytes: Uint8Array | ReadonlyArray<number>): string {
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
  // Original: return bytes.reduce((str, byte) => str + String.fromCharCode(byte), "");
  // Loop is generally more performant for large arrays than reduce for string concatenation.
}

export function uint8ArrayToBase64String(bytes: Uint8Array | ReadonlyArray<number>): string {
  const binaryString = uint8ArrayToBinaryString(bytes);
  return Base64.encode(binaryString);
}

export function utf16ToBinaryString(str: string): string {
  const length = str.length;
  let binary = "";
  for (let i = 0; i < length; i++) {
    const charCode = str.charCodeAt(i);
    binary += String.fromCharCode(charCode >> 8); // High byte
    binary += String.fromCharCode(charCode & 0xFF); // Low byte
  }
  return binary;
}

export function binaryStringToUtf16(binaryStr: string): string {
  const length = binaryStr.length;
  let utf16 = "";
  if (length % 2 !== 0) {
    // Original code did not explicitly handle this.
    // Depending on requirements, could throw error, pad, or truncate.
    // For now, log a warning and process as much as possible.
    console.warn("binaryStringToUtf16: Input binary string length is odd. Last byte will be ignored.");
  }
  for (let i = 0; i < Math.floor(length / 2) * 2; i += 2) {
    const highByte = binaryStr.charCodeAt(i);
    const lowByte = binaryStr.charCodeAt(i + 1);
    if (highByte > 255 || lowByte > 255) {
        // Should not happen if input is truly a binary string from utf16ToBinaryString
        console.warn(`Invalid byte sequence in binaryStringToUtf16 at index ${i}`);
    }
    utf16 += String.fromCharCode((highByte << 8) | lowByte);
  }
  return utf16;
}

export function bufferToHexString(buffer: ArrayBuffer): string {
  const hexChars: string[] = [];
  const dataView = new DataView(buffer);
  const bytePattern = "00000000"; // Original pattern for a 32-bit number

  // The original code processed in 4-byte (Uint32) chunks.
  // We'll replicate this behavior.
  const numUint32 = Math.floor(dataView.byteLength / 4);

  for (let i = 0; i < numUint32; i++) {
    // Read as Uint32, assuming Big Endian by default (false for littleEndian in getUint32)
    // The original code didn't specify endianness, but toString(16) on the number
    // makes more sense if it's read in an expected order.
    // Let's assume Big Endian for getUint32 as it's often default for network/file formats.
    const uint32Value = dataView.getUint32(i * 4, false);
    const hexString = uint32Value.toString(16);
    // Pad to 8 hex characters (4 bytes)
    hexChars.push((bytePattern + hexString).slice(-8));
  }

  // Handle remaining bytes if buffer length is not a multiple of 4
  const remainingBytes = dataView.byteLength % 4;
  if (remainingBytes > 0) {
    let lastChunkHex = "";
    for (let i = 0; i < remainingBytes; i++) {
      const byte = dataView.getUint8(numUint32 * 4 + i);
      lastChunkHex += (byte < 16 ? '0' : '') + byte.toString(16);
    }
    // The original code would have ignored these bytes.
    // To be more complete, we append them. For strict original behavior, this block could be removed.
    // Or, pad the lastChunkHex to 8 chars if it should represent a partial Uint32,
    // but that seems less useful than just showing the hex of remaining bytes.
    // For now, just appending the hex of remaining bytes.
     hexChars.push(lastChunkHex);
     console.warn(`bufferToHexString: Buffer length ${dataView.byteLength} is not a multiple of 4. Remaining ${remainingBytes} bytes processed individually.`);
  }

  return hexChars.join("").toUpperCase(); // Original output was not explicitly uppercased, but hex often is.
}

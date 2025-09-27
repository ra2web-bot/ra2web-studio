import { binaryStringToUint8Array } from '../util/string';
import { Crc32 } from './Crc32';

export class MixEntry {
    public static readonly size: number = 12; // hash (u32) + offset (u32) + length (u32)

    public readonly hash: number;    // CRC32 hash of the filename
    public readonly offset: number;  // Offset of the file data within the MIX file's data section
    public readonly length: number;  // Length of the file data in bytes

    constructor(hash: number, offset: number, length: number) {
        this.hash = hash;
        this.offset = offset;
        this.length = length;
    }

    /**
     * Calculates the Westwood-specific filename hash.
     * The filename is first uppercased.
     * Then, it's padded to be a multiple of 4 bytes long.
     * The padding involves appending a character whose code is the original length modulo 4 (1, 2, or 3).
     * Then, further padding with a character from a specific position in the original (or length-appended) string.
     * Finally, CRC32 is calculated on the byte representation of this processed string.
     * @param filename The filename string.
     * @param debugLog Flag to enable internal logging for debugging.
     * @returns The CRC32 hash.
     */
    public static hashFilename(filename: string, debugLog: boolean = false): number {
        let processedName = filename.toUpperCase();
        const originalLength = processedName.length;
        const R = originalLength >> 2; // Math.floor(originalLength / 4)

        if (debugLog) console.log(`[hashFilename] Original: "${filename}", Uppercased: "${processedName}", Length: ${originalLength}`);

        if ((originalLength & 3) !== 0) { // if originalLength % 4 !== 0
            const appendCharCode = originalLength - (R << 2);
            processedName += String.fromCharCode(appendCharCode);
            if (debugLog) console.log(`[hashFilename] Appended char code: ${appendCharCode}, Name after append: "${processedName}"`);

            let numPaddingChars = 3 - (originalLength & 3);
            const paddingCharSourceIndex = R << 2; // Index of char to use for padding

            const charToPadCode = processedName.charCodeAt(paddingCharSourceIndex < processedName.length ? paddingCharSourceIndex : 0 );
            const charToPad = String.fromCharCode(charToPadCode);
            if (debugLog) console.log(`[hashFilename] numPaddingChars: ${numPaddingChars}, paddingCharSourceIndex: ${paddingCharSourceIndex}, charToPad: "${charToPad}" (code ${charToPadCode})`);

            for (let i = 0; i < numPaddingChars; i++) {
                processedName += charToPad;
            }
            if (debugLog) console.log(`[hashFilename] Name after padding: "${processedName}", Final Length: ${processedName.length}`);
        }

        const nameBytes = binaryStringToUint8Array(processedName);
        if (debugLog) console.log(`[hashFilename] nameBytes for CRC:`, nameBytes);

        const crc = Crc32.calculateCrc(nameBytes);
        if (debugLog) console.log(`[hashFilename] Calculated CRC: ${crc} (0x${crc.toString(16).toUpperCase()})`);
        return crc;
    }
}

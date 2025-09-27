// src/util/Base64.ts

// Check if Buffer is available, typically polyfilled by Vite in browser environments
// or natively available in Node.js.
// We declare Buffer here to satisfy TypeScript if no @types/node is present yet,
// or to make it explicit that we expect it to be available.
declare var Buffer: any;

export class Base64 {
  static encode(str: string): string {
    if (typeof globalThis.btoa === 'function') {
      try {
        // Standard browser environment for binary strings
        return globalThis.btoa(str);
      } catch (e) {
        // Fallback for Unicode strings or other issues with btoa
        // This path is more likely if 'str' isn't a 'binary string'
        if (typeof Buffer !== 'undefined') {
          return Buffer.from(str, 'utf-8').toString('base64');
        } else {
          // Very basic fallback if Buffer is also not available (should not happen with Vite)
          console.warn('Base64.encode: Buffer is not defined, encoding may be incorrect for non-ASCII.');
          // For basic ASCII, btoa would have worked. This is a last resort.
          // A proper polyfill for btoa for Unicode would be more complex here without TextEncoder.
          return unescape(encodeURIComponent(str)); // This is not true base64 but a common pattern
        }
      }
    } else if (typeof Buffer !== 'undefined') {
      // Node.js environment or environment where Buffer is available but btoa is not
      return Buffer.from(str, 'utf-8').toString('base64');
    } else {
      // Should not happen in supported environments (modern browser or Node.js)
      throw new Error('Base64 encoding unsupported in this environment.');
    }
  }

  static decode(encodedStr: string): string {
    if (typeof globalThis.atob === 'function') {
      try {
        // Standard browser environment
        return globalThis.atob(encodedStr);
      } catch (e) {
        // Fallback if atob fails (e.g. malformed base64 or other issues)
        if (typeof Buffer !== 'undefined') {
          return Buffer.from(encodedStr, 'base64').toString('utf-8');
        } else {
          console.warn('Base64.decode: Buffer is not defined, decoding may be incorrect for non-ASCII.');
          return decodeURIComponent(escape(encodedStr)); // Companion to the unescape(encodeURIComponent(str)) hack
        }
      }
    } else if (typeof Buffer !== 'undefined') {
      // Node.js environment or environment where Buffer is available but atob is not
      return Buffer.from(encodedStr, 'base64').toString('utf-8');
    } else {
      // Should not happen in supported environments
      throw new Error('Base64 decoding unsupported in this environment.');
    }
  }

  static isBase64(str: string): boolean {
    if (!str || typeof str !== 'string') {
      return false;
    }
    // Original regex used a non-capturing group implicitly, this is fine.
    // Added ^ and $ to ensure the whole string matches the pattern.
    // Allow for optional padding with '='.
    // The regex was: /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/
    // A slightly more robust regex that handles optional padding correctly and checks for valid characters:
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(str)) {
        return false;
    }
    // Additionally, the length of a Base64 string (ignoring padding) must be a multiple of 4.
    // However, the original regex handles blocks of 4, so this check might be redundant
    // with a good regex. Let's stick to a regex test primarily.
    // The original regex is quite good for validation.
    const strictBase64Regex = /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    return strictBase64Regex.test(str);
  }
}

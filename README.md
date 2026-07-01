# bmp-reader

JS decoder for scanner payloads from the German Bundeseinheitlicher Medikationsplan (BMP).

The package does not scan camera input or images. BMP printouts use a DataMatrix 2D barcode whose payload is compact ISO-8859-1 XML; this package starts after a scanner has already returned that payload text or bytes.

## Install

Install [`bmp-reader` from npm](https://www.npmjs.com/package/bmp-reader) with [`npm install`](https://docs.npmjs.com/cli/commands/npm-install):

```sh
npm install bmp-reader
```

Requires Node.js 20 or newer.

## Usage

```js
import { decodeBmp, decodeBmpPages } from "bmp-reader";

const plan = decodeBmp(scannerText);

console.log(plan.patient.firstName);
console.log(plan.medications);

const combined = decodeBmpPages([page1ScannerText, page2ScannerText]);
console.log(combined.sections);
```

`decodeBmp()` accepts a `string`, `Uint8Array`, or `ArrayBuffer`. Byte inputs are decoded with exact Latin-1 byte mapping.

## Scanner Integration

Use a scanner or barcode library that can read DataMatrix codes and preserve the BMP payload as ISO-8859-1/Latin-1 data. BMP payloads are compact XML, but they are not UTF-8; German characters such as `ä`, `ö`, `ü`, `ß`, or `Ü` must survive as Latin-1 bytes.

Recommended scanner handoff:

- Prefer passing raw scanner bytes to `decodeBmp()` as `Uint8Array` or `ArrayBuffer`.
- If your scanner returns text, make sure it maps each byte directly to the same JavaScript character code (`0x00` to `0xff`) instead of transcoding from UTF-8.
- For multi-page BMP printouts, scan each DataMatrix separately and pass the page payloads to `decodeBmpPages()`.
- Keep camera, image, PDF, or hardware scanning code in your application; this package intentionally only decodes the returned BMP XML payload.

Recommended scanner/decoder tools:

- Hardware scanners: use a 2D imager that explicitly supports DataMatrix ECC200. Configure it as USB HID keyboard wedge, USB serial, or native serial depending on your app, and verify that it does not transcode Latin-1 payload bytes as UTF-8.
- Browser or Node image decoding: [`zxing-wasm`](https://zxing-wasm.deno.dev/) is a good JS option because it supports DataMatrix and can read from browser image data or Node buffers.
- CLI or CI checks: [`dmtxread`](https://manpages.debian.org/wheezy/libdmtx-utils/dmtxread.1.en.html) from `libdmtx` is useful for DataMatrix-only fixture validation.
- Native browser scanning: the [`BarcodeDetector`](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API) API can be useful where available, but feature-detect `BarcodeDetector.getSupportedFormats()` and only use it for BMP when `data_matrix` is supported in your target browsers.

## API

### `decodeBmp(input, options?)`

Decodes one BMP carrier XML payload.

Options:

- `allowUnknownVersion`: return data with a warning instead of throwing for unknown BMP versions.
- `supportedVersions`: defaults to `["027", "028"]`.

### `decodeBmpPages(inputs, options?)`

Decodes and assembles all pages of a multi-page BMP. It validates that pages share the same instance ID and version, detects missing or duplicate pages, sorts pages, and merges adjacent sections with the same heading.

### `BmpDecodeError`

Thrown errors expose a stable `code` and a `details` object.

Known error codes include:

- `MALFORMED_XML`
- `WRONG_ROOT`
- `UNSUPPORTED_VERSION`
- `MISSING_REQUIRED_ROOT_FIELD`
- `MISSING_REQUIRED_FIELD`
- `MISSING_PAGE`
- `DUPLICATE_PAGE`
- `INVALID_PAGE_ASSEMBLY`
- `INVALID_INPUT`

## Notes

The decoder preserves raw attributes and unknown attributes. It does not resolve PZN values or access an Arzneimitteldatenbank; PZN-only medication entries are returned with warnings because display data may need an external drug database.

## Development

The library is authored in TypeScript and compiled to `dist/`.

```sh
npm run typecheck
npm run build
npm test
```

The test suite includes official/public fixtures from the v2.8 `BMP_Beispieldateien_V2.8.zip` sample and the v2.7 barcode-content example printed in the BMP specification. It also keeps historical v2.6 and v2.3 specification examples as permissive-version fixtures, plus synthetic fixtures for multi-page and edge-case behavior. Barcode, generated-PDF, downloaded public-PDF, and downloaded public-image scanning tests are test-only and are not exported by the package; one public image fixture covers the older pipe-delimited `MP|020|...` carrier format as an intentionally rejected non-XML payload.

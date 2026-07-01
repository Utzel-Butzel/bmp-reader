import { readFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import bwipjs from "bwip-js/node";
import { PNG } from "pngjs";
import { readBarcodes } from "zxing-wasm/reader";
import { BmpDecodeError, decodeBmp } from "../src/index.ts";
import { KBV_V28_BEISPIEL_1, V27_COMPATIBLE } from "./fixtures.ts";

const KBV_ANLAGE3_V28_PDF = readFileSync(new URL("./fixtures/pdf/kbv-anlage3-v28.pdf", import.meta.url));
const ABDA_ANLAGE3_V26_PDF = readFileSync(new URL("./fixtures/pdf/abda-anlage3-v26.pdf", import.meta.url));
const ABDA_ANLAGE3_V23_PDF = readFileSync(new URL("./fixtures/pdf/abda-anlage3-v23.pdf", import.meta.url));
const AKDAE_AVP_201701_ABB_1 = readFileSync(
  new URL("./fixtures/image/akdae-avp-201701-abb-1.png", import.meta.url)
);
const HL7_PMP_MPPLANBEISPIEL = readFileSync(
  new URL("./fixtures/image/hl7-pmp-mpplanbeispiel.png", import.meta.url)
);
const HOLDERBERG_MEDIKATIONSPLANCUT = readFileSync(
  new URL("./fixtures/image/holderberg-medikationsplancut.jpg", import.meta.url)
);

describe("PDF barcode fixtures", () => {
  it("scans a BMP DataMatrix embedded in a generated PDF fixture", async () => {
    const pdf = await createBarcodePdf(KBV_V28_BEISPIEL_1, "datamatrix");
    const text = await decodeFirstPdfBarcode(pdf, ["DataMatrix"]);
    const decoded = decodeBmp(text);

    expect(decoded.version).toBe("028");
    expect(decoded.instanceId).toBe(decodeBmp(KBV_V28_BEISPIEL_1).instanceId);
  });

  it("scans a non-BMP QR code embedded in a generated PDF fixture", async () => {
    const pdf = await createBarcodePdf(V27_COMPATIBLE, "qrcode");
    const text = await decodeFirstPdfBarcode(pdf, ["QRCode"]);
    const decoded = decodeBmp(text);

    expect(decoded.version).toBe("027");
    expect(decoded.patient.lastName).toBe("Müller");
  });

  it("scans the BMP DataMatrix from the downloaded KBV Anlage 3 v2.8 PDF", async () => {
    const texts = await decodePdfBarcodes(KBV_ANLAGE3_V28_PDF, ["DataMatrix"]);
    const decoded = texts.map((text) => decodeBmp(text));
    const example = decoded.find((plan) => plan.instanceId === "F5FDC0E5E10E44EFBAC1D4A2B540A957");

    expect(texts).toHaveLength(1);
    expect(example).toMatchObject({
      version: "027",
      patient: {
        firstName: "Michaela",
        lastName: "Musterhausen"
      }
    });
    expect(example?.medications).toHaveLength(9);
  });

  it("scans the BMP DataMatrix from the downloaded ABDA Anlage 3 v2.6 PDF", async () => {
    const texts = await decodePdfBarcodes(ABDA_ANLAGE3_V26_PDF, ["DataMatrix"]);
    const decoded = texts.map((text) => decodeBmp(text, { allowUnknownVersion: true }));

    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toMatchObject({
      version: "025",
      instanceId: "B544B6976AB84E3498AA96D8E6FA29C1",
      patient: {
        firstName: "Michaela",
        lastName: "Musterhausen"
      }
    });
    expect(decoded[0].medications).toHaveLength(7);
  });

  it("scans BMP DataMatrix examples from the downloaded ABDA Anlage 3 v2.3 PDF", async () => {
    const texts = await decodePdfBarcodes(ABDA_ANLAGE3_V23_PDF, ["DataMatrix"]);
    const decoded = texts.map((text) => decodeBmp(text, { allowUnknownVersion: true }));

    expect(decoded.map((plan) => plan.instanceId)).toEqual(
      expect.arrayContaining([
        "B544B6976AB84E3498AA96D8E6FA29C1",
        "02BD2867FB024401A590D59D94E1FFAE",
        "EA620D79D334428CBA6203181EAA1379"
      ])
    );
    expect(decoded.map((plan) => plan.version)).toEqual(["023", "023", "023"]);
    expect(decoded.map((plan) => plan.patient.firstName)).toEqual(
      expect.arrayContaining(["Michaela", "Jürgen", "Ivan"])
    );
  });

  it("scans the BMP DataMatrix from the downloaded AKDÄ AVP example image", async () => {
    const imageData = extractPngCropImageData(AKDAE_AVP_201701_ABB_1, {
      x: 1175,
      y: 48,
      width: 198,
      height: 210,
      scale: 2,
      threshold: 128,
      padding: 20
    });
    const results = await readBarcodes(imageData, {
      formats: ["DataMatrix"],
      tryHarder: true,
      maxNumberOfSymbols: 1
    });
    const decoded = decodeBmp(results[0].text, { allowUnknownVersion: true });

    expect(results).toHaveLength(1);
    expect(decoded).toMatchObject({
      version: "023",
      instanceId: "02BD2867FB024401A590D59D94E1FFAE",
      patient: {
        firstName: "Jürgen",
        lastName: "Wernersen"
      }
    });
    expect(decoded.medications).toHaveLength(6);
  });

  it("scans the BMP DataMatrix from the downloaded HL7 wiki example image", async () => {
    const results = await readBarcodes(HL7_PMP_MPPLANBEISPIEL, {
      formats: ["DataMatrix"],
      tryHarder: true,
      maxNumberOfSymbols: 1
    });
    const decoded = decodeBmp(results[0].text, { allowUnknownVersion: true });

    expect(results).toHaveLength(1);
    expect(decoded).toMatchObject({
      version: "022",
      instanceId: "02BD2867FB024401A590D59D94E1FFAE",
      patient: {
        firstName: "Jürgen",
        lastName: "Wernersen"
      },
      issuer: {
        name: "Praxis Dr. Michael Müller"
      }
    });
    expect(decoded.medications).toHaveLength(6);
    expect(decoded.medications[2]).toMatchObject({
      pzn: "558736",
      dosage: { type: "structured", schedule: "20-0-20-0" },
      doseUnit: { code: "p", label: "IE" }
    });
  });

  it("scans the downloaded Holderberg example image and rejects its legacy pipe payload", async () => {
    const results = await readBarcodes(HOLDERBERG_MEDIKATIONSPLANCUT, {
      formats: ["DataMatrix"],
      tryHarder: true,
      maxNumberOfSymbols: 1
    });

    expect(results).toHaveLength(1);
    expect(results[0].text).toMatch(/^MP\|020\|/);
    expect(catchDecodeErrorCode(() => decodeBmp(results[0].text))).toBe(BmpDecodeError.codes.MALFORMED_XML);
  });
});

async function createBarcodePdf(payload: string, bcid: "datamatrix" | "qrcode"): Promise<Buffer> {
  const png = await bwipjs.toBuffer({
    bcid,
    text: payload,
    scale: 4,
    backgroundcolor: "FFFFFF",
    barcolor: "000000",
    paddingwidth: 20,
    paddingheight: 20
  });
  const image = PNG.sync.read(png);
  const rgb = Buffer.alloc(image.width * image.height * 3);
  for (let source = 0, target = 0; source < image.data.length; source += 4, target += 3) {
    rgb[target] = image.data[source];
    rgb[target + 1] = image.data[source + 1];
    rgb[target + 2] = image.data[source + 2];
  }

  return createSingleImagePdf({
    width: image.width,
    height: image.height,
    rgb
  });
}

function createSingleImagePdf(image: { width: number; height: number; rgb: Buffer }): Buffer {
  const compressedImage = deflateSync(image.rgb);
  const pageWidth = image.width + 72;
  const pageHeight = image.height + 72;
  const content = `q\n${image.width} 0 0 ${image.height} 36 36 cm\n/Im0 Do\nQ\n`;
  const compressedContent = deflateSync(Buffer.from(content, "ascii"));
  const chunks: Buffer[] = [];
  const offsets = [0];
  let byteLength = 0;

  const push = (chunk: string | Buffer) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "latin1");
    chunks.push(buffer);
    byteLength += buffer.length;
  };
  const addObject = (id: number, body: string | Buffer) => {
    offsets[id] = byteLength;
    push(`${id} 0 obj\n`);
    push(body);
    push("\nendobj\n");
  };
  const stream = (dictionary: string, body: Buffer) =>
    Buffer.concat([Buffer.from(`${dictionary}\nstream\n`, "latin1"), body, Buffer.from("\nendstream", "latin1")]);

  push("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");
  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
  );
  addObject(
    4,
    stream(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressedImage.length} >>`,
      compressedImage
    )
  );
  addObject(
    5,
    stream(`<< /Filter /FlateDecode /Length ${compressedContent.length} >>`, compressedContent)
  );

  const xrefOffset = byteLength;
  push("xref\n0 6\n");
  push("0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1) {
    push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.concat(chunks);
}

async function decodeFirstPdfBarcode(pdf: Buffer, formats: Array<"DataMatrix" | "QRCode">): Promise<string> {
  const texts = await decodePdfBarcodes(pdf, formats, 1);

  expect(texts).toHaveLength(1);
  return texts[0];
}

async function decodePdfBarcodes(
  pdf: Buffer,
  formats: Array<"DataMatrix" | "QRCode">,
  maxNumberOfSymbols = 5
): Promise<string[]> {
  const texts: string[] = [];
  for (const imageData of extractPdfImageData(pdf)) {
    const results = await readBarcodes(imageData, {
      formats,
      tryHarder: true,
      maxNumberOfSymbols
    });
    texts.push(...results.map((result) => result.text));
  }

  return [...new Set(texts)];
}

function extractPdfImageData(pdf: Buffer): ImageData[] {
  const text = pdf.toString("latin1");
  const imageData: ImageData[] = [];
  const objectStreamPattern = /(\d+)\s+0\s+obj\s*(<<[\s\S]*?>>)\s*stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = objectStreamPattern.exec(text))) {
    const dictionary = match[2];
    if (!/\/Subtype\s*\/Image/.test(dictionary)) {
      continue;
    }

    const length = readPdfInt(dictionary, "Length");
    const width = readPdfInt(dictionary, "Width");
    const height = readPdfInt(dictionary, "Height");
    const bitsPerComponent = readPdfInt(dictionary, "BitsPerComponent");
    const filter = readPdfToken(dictionary, "Filter");
    if (!length || !width || !height || !bitsPerComponent || !filter?.includes("FlateDecode")) {
      continue;
    }

    const streamStart = match.index + match[0].length;
    const compressed = pdf.subarray(streamStart, streamStart + length);
    let raw: Buffer;
    try {
      raw = inflateSync(compressed);
    } catch {
      continue;
    }

    const decoded = pdfImageBytesToImageData(raw, width, height, bitsPerComponent);
    if (decoded) {
      imageData.push(decoded);
    }
  }

  return imageData;
}

function pdfImageBytesToImageData(
  raw: Buffer,
  width: number,
  height: number,
  bitsPerComponent: number
): ImageData | null {
  const rgba = new Uint8ClampedArray(width * height * 4);

  if (bitsPerComponent === 1) {
    const rowBytes = Math.ceil(width / 8);
    if (raw.length < rowBytes * height) {
      return null;
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const byte = raw[y * rowBytes + (x >> 3)];
        const bit = (byte >> (7 - (x & 7))) & 1;
        const channel = bit ? 255 : 0;
        const target = (y * width + x) * 4;
        rgba[target] = channel;
        rgba[target + 1] = channel;
        rgba[target + 2] = channel;
        rgba[target + 3] = 255;
      }
    }

    return toImageData(rgba, width, height);
  }

  if (bitsPerComponent !== 8) {
    return null;
  }

  const pixelCount = width * height;
  if (raw.length >= pixelCount * 3) {
    for (let source = 0, target = 0; source < pixelCount * 3; source += 3, target += 4) {
      rgba[target] = raw[source];
      rgba[target + 1] = raw[source + 1];
      rgba[target + 2] = raw[source + 2];
      rgba[target + 3] = 255;
    }
    return toImageData(rgba, width, height);
  }

  if (raw.length >= pixelCount) {
    for (let source = 0, target = 0; source < pixelCount; source += 1, target += 4) {
      const channel = raw[source];
      rgba[target] = channel;
      rgba[target + 1] = channel;
      rgba[target + 2] = channel;
      rgba[target + 3] = 255;
    }
    return toImageData(rgba, width, height);
  }

  return null;
}

function toImageData(data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): ImageData {
  return {
    data,
    width,
    height,
    colorSpace: "srgb" as PredefinedColorSpace
  };
}

function extractPngCropImageData(
  pngBytes: Buffer,
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    threshold: number;
    padding: number;
  }
): ImageData {
  const png = PNG.sync.read(pngBytes);
  const width = crop.width * crop.scale + crop.padding * 2;
  const height = crop.height * crop.scale + crop.padding * 2;
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  for (let alpha = 3; alpha < data.length; alpha += 4) {
    data[alpha] = 255;
  }

  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      const source = ((crop.y + y) * png.width + crop.x + x) * 4;
      const luminance = (png.data[source] + png.data[source + 1] + png.data[source + 2]) / 3;
      const channel = luminance < crop.threshold ? 0 : 255;

      for (let scaleY = 0; scaleY < crop.scale; scaleY += 1) {
        for (let scaleX = 0; scaleX < crop.scale; scaleX += 1) {
          const targetX = crop.padding + x * crop.scale + scaleX;
          const targetY = crop.padding + y * crop.scale + scaleY;
          const target = (targetY * width + targetX) * 4;
          data[target] = channel;
          data[target + 1] = channel;
          data[target + 2] = channel;
          data[target + 3] = 255;
        }
      }
    }
  }

  return toImageData(data, width, height);
}

function readPdfInt(dictionary: string, name: string): number | null {
  const token = readPdfToken(dictionary, name);
  return token ? Number.parseInt(token, 10) : null;
}

function readPdfToken(dictionary: string, name: string): string | null {
  const match = new RegExp(`/${name}\\s*(\\[[^\\]]+\\]|/[^/\\s<>\\[\\]()]+|\\d+\\s+\\d+\\s+R|\\d+)`).exec(
    dictionary
  );
  return match?.[1] ?? null;
}

function catchDecodeErrorCode(callback: () => unknown): string {
  try {
    callback();
  } catch (error) {
    if (error instanceof BmpDecodeError) {
      return error.code;
    }
    throw error;
  }
  throw new Error("Expected callback to throw.");
}

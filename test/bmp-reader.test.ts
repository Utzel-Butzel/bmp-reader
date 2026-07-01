import { describe, expect, it } from "vitest";
import bwipjs from "bwip-js/node";
import { PNG } from "pngjs";
import { BmpDecodeError, decodeBmp, decodeBmpPages } from "../src/index.ts";
import {
  ABDA_SPEC_V23_ABBILDUNG_3,
  BARCODE_FIXTURES,
  KBV_SPEC_V27_ABBILDUNG_3,
  KBV_SPEC_V26_ABBILDUNG_3,
  KBV_V28_BEISPIEL_1,
  LEGACY_BARCODE_FIXTURES,
  MULTI_PAGE_1,
  MULTI_PAGE_2,
  V27_COMPATIBLE,
  V28_OFFICIAL_STYLE
} from "./fixtures.ts";
import { readBarcodes } from "./zxing.ts";

describe("decodeBmp", () => {
  it("decodes the official KBV v2.8 example XML fixture", () => {
    const decoded = decodeBmp(toLatin1Bytes(KBV_V28_BEISPIEL_1));

    expect(decoded.version).toBe("028");
    expect(decoded.instanceId).toBe("B556E9F99632438786B100B8D96C0122");
    expect(decoded.patient).toMatchObject({
      firstName: "Michaela",
      lastName: "Musterhausen",
      birthDateIso: "1936-12-13"
    });
    expect(decoded.issuer.name).toBe("Praxis 2");
    expect(decoded.parameters).toMatchObject({
      allergies: "Penicillin",
      weightKg: "85"
    });
    expect(decoded.sections.map((section) => section.code)).toEqual([null, "425", "411", "424"]);
    expect(decoded.medications).toHaveLength(7);
    expect(decoded.medications[0]).toMatchObject({
      dosage: { type: "structured", schedule: "1-0-0-0" },
      ingredients: [{ name: "Ramipril", strength: "5 mg" }]
    });
    expect(decoded.medications[2]).toMatchObject({
      pzn: "544786",
      dosage: { type: "structured", schedule: "20-0-10-0" },
      doseUnit: { code: "p", label: "IE" }
    });
    expect(decoded.medications[3]).toMatchObject({
      weekly: { dayCode: "1", dayName: "Montag" },
      dosage: { type: "weekly-structured", schedule: "1-0-0-0" }
    });
    expect(decoded.medications[5]).toMatchObject({
      pzn: "16357856",
      dosage: { type: "text", text: "max. 3" }
    });
  });

  it("decodes the official KBV specification v2.7 barcode-content example", () => {
    const decoded = decodeBmp(toLatin1Bytes(KBV_SPEC_V27_ABBILDUNG_3));

    expect(decoded.version).toBe("027");
    expect(decoded.instanceId).toBe("F5FDC0E5E10E44EFBAC1D4A2B540A957");
    expect(decoded.issuer).toMatchObject({
      name: "Dr. Manfred Überall",
      phone: "04562-12345"
    });
    expect(decoded.sections.map((section) => section.title)).toEqual([
      null,
      "Bedarfsmedikation",
      "zeitlich befristet anzuwendende Medikamente",
      "Wichtige Angaben"
    ]);
    expect(decoded.medications).toHaveLength(9);
    expect(decoded.medications[4]).toMatchObject({
      pzn: "544786",
      dosage: { type: "structured", schedule: "20-0-10-0" },
      doseUnit: { text: "IE" }
    });
    expect(decoded.sections[3].items).toEqual([
      expect.objectContaining({
        type: "freeText",
        text: "Bitte messen Sie Ihren Blutdruck täglich!"
      })
    ]);
  });

  it("keeps historical public specification examples outside default supported versions", () => {
    expect(catchCode(() => decodeBmp(KBV_SPEC_V26_ABBILDUNG_3))).toBe(BmpDecodeError.codes.UNSUPPORTED_VERSION);
    expect(catchCode(() => decodeBmp(ABDA_SPEC_V23_ABBILDUNG_3))).toBe(BmpDecodeError.codes.UNSUPPORTED_VERSION);
  });

  it("decodes the historical KBV specification v2.6 example when unknown versions are allowed", () => {
    const decoded = decodeBmp(toLatin1Bytes(KBV_SPEC_V26_ABBILDUNG_3), { allowUnknownVersion: true });

    expect(decoded.version).toBe("026");
    expect(decoded.warnings[0].code).toBe("UNKNOWN_BMP_VERSION");
    expect(decoded.patient).toMatchObject({
      firstName: "Michaela",
      lastName: "Musterhausen",
      birthDateIso: "1936-12-13"
    });
    expect(decoded.sections.map((section) => section.title)).toEqual([
      null,
      "Anwendung unter die Haut",
      "Bedarfsmedikation",
      "Wichtige Angaben"
    ]);
    expect(decoded.medications).toHaveLength(7);
    expect(decoded.medications[4]).toMatchObject({
      pzn: "544757",
      dosage: { type: "structured", schedule: "20-0-10-0" },
      doseUnit: { code: "p", label: "IE" }
    });
  });

  it("decodes the historical ABDA-hosted v2.3 example when unknown versions are allowed", () => {
    const decoded = decodeBmp(toLatin1Bytes(ABDA_SPEC_V23_ABBILDUNG_3), { allowUnknownVersion: true });

    expect(decoded.version).toBe("023");
    expect(decoded.warnings[0].code).toBe("UNKNOWN_BMP_VERSION");
    expect(decoded.patient).toMatchObject({
      firstName: "Michaela",
      lastName: "Mustermann",
      birthDate: "1936-12-13",
      birthDateIso: null
    });
    expect(decoded.issuer.email).toBe("m.ueberall@mein-netz.de");
    expect(decoded.medications).toHaveLength(7);
    expect(decoded.sections[3].items).toEqual([
      expect.objectContaining({
        type: "freeText",
        text: "Bitte messen Sie Ihren Blutdruck täglich!"
      })
    ]);
  });

  it("decodes a v2.8 official-style payload with Latin-1 text", () => {
    const decoded = decodeBmp(toLatin1Bytes(V28_OFFICIAL_STYLE));

    expect(decoded.version).toBe("028");
    expect(decoded.instanceId).toBe("B556E9F99632438786B100B8D96C0122");
    expect(decoded.rawXml.startsWith("<MP")).toBe(true);
    expect(decoded.patient).toMatchObject({
      firstName: "Michaela",
      lastName: "Musterhausen",
      birthDateIso: "1936-12-13",
      sexLabel: "weiblich"
    });
    expect(decoded.issuer.street).toBe("Hauptstraße 55");
    expect(decoded.parameters).toMatchObject({
      allergies: "Penicillin",
      weightKg: "85",
      heightCm: "172"
    });
    expect(decoded.sections).toHaveLength(3);
    expect(decoded.sections[1].title).toBe("Wöchentliche Anwendung");
    expect(decoded.sections[0].items.map((item) => item.type)).toEqual(["medication", "freeText", "recipe"]);
    expect(decoded.medications).toHaveLength(3);
    expect(decoded.medications[0]).toMatchObject({
      drugName: "Ramipril Hexal",
      dosage: { type: "structured", schedule: "1-0-0-0" },
      doseUnit: { code: "1", label: "Stück" }
    });
    expect(decoded.medications[1]).toMatchObject({
      pzn: "3159468",
      weekly: { dayCode: "1", dayName: "Montag" },
      dosage: { type: "weekly-structured", schedule: "1-0-0-0" }
    });
    expect(decoded.medications[2]).toMatchObject({
      pzn: "16357856",
      dosage: { type: "text", text: "max. 3" },
      doseUnit: { code: "5", label: "Hub" }
    });
    expect(decoded.warnings.some((warning) => warning.code === "UNRESOLVED_PZN_ONLY_MEDICATION")).toBe(true);
  });

  it("decodes a v2.7-compatible payload", () => {
    const decoded = decodeBmp(V27_COMPATIBLE);

    expect(decoded.version).toBe("027");
    expect(decoded.patient.lastName).toBe("Müller");
    expect(decoded.issuer.identifier).toEqual({ type: "idf", value: "1234567" });
    expect(decoded.sections[0].title).toBe("Selbstmedikation");
    expect(decoded.medications[0]).toMatchObject({
      drugName: "Paracetamol",
      dosage: { type: "text", text: "bei Bedarf" },
      doseUnit: { text: "Tabletten" }
    });
  });

  it("accepts an XML prolog but stores rawXml without it", () => {
    const decoded = decodeBmp(`<?xml version="1.0" encoding="ISO-8859-1"?>${V27_COMPATIBLE}`);

    expect(decoded.rawXml).toBe(V27_COMPATIBLE);
  });

  it("emits warnings for recoverable rule issues and preserves unknown attrs", () => {
    const payload =
      '<MP v="028" U="D556E9F99632438786B100B8D96C0122" l="de-DE" vendor="x"><P g="A" f="B" b="20000101" s="Z"/><A lanr="123456789" idf="1234567" n="Praxis" t="2026-01-01T00:00:00"/><S c="999" t="Text"><M a="Test" f="Tabl" fd="Tab" m="1" t="frei" du="?" dud="Dose" wo="9" x="nicht erlaubt"><W w="Wirkstoff"/></M></S></MP>';

    const decoded = decodeBmp(payload);

    expect(decoded.unknownAttributes).toEqual({ vendor: "x" });
    expect(decoded.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "UNKNOWN_SEX_CODE",
        "MUTUALLY_EXCLUSIVE_ATTRIBUTES",
        "UNKNOWN_SECTION_CODE",
        "UNKNOWN_WEEKDAY_CODE",
        "UNKNOWN_DOSE_UNIT_CODE"
      ])
    );
  });

  it("throws for malformed XML", () => {
    expect(() => decodeBmp("<MP")).toThrowError(BmpDecodeError);
    expect(catchCode(() => decodeBmp("<MP"))).toBe(BmpDecodeError.codes.MALFORMED_XML);
  });

  it("throws for a wrong root element", () => {
    expect(catchCode(() => decodeBmp("<NotMP/>"))).toBe(BmpDecodeError.codes.WRONG_ROOT);
  });

  it("throws for unsupported versions unless explicitly allowed", () => {
    const payload =
      '<MP v="999" U="E556E9F99632438786B100B8D96C0122" l="de-DE"><P g="A" f="B" b="20000101"/><A n="Praxis" t="2026-01-01T00:00:00"/></MP>';

    expect(catchCode(() => decodeBmp(payload))).toBe(BmpDecodeError.codes.UNSUPPORTED_VERSION);

    const decoded = decodeBmp(payload, { allowUnknownVersion: true });
    expect(decoded.version).toBe("999");
    expect(decoded.warnings[0].code).toBe("UNKNOWN_BMP_VERSION");
  });

  it("throws for missing required fields", () => {
    expect(catchCode(() => decodeBmp('<MP v="028" l="de-DE"><P g="A" f="B" b="20000101"/><A n="Praxis" t="2026-01-01T00:00:00"/></MP>'))).toBe(
      BmpDecodeError.codes.MISSING_REQUIRED_ROOT_FIELD
    );

    expect(catchCode(() => decodeBmp('<MP v="028" U="F556E9F99632438786B100B8D96C0122" l="de-DE"><P f="B" b="20000101"/><A n="Praxis" t="2026-01-01T00:00:00"/></MP>'))).toBe(
      BmpDecodeError.codes.MISSING_REQUIRED_FIELD
    );
  });
});

describe("decodeBmpPages", () => {
  it("assembles, sorts, and merges a v2.8 two-page payload", () => {
    const decoded = decodeBmpPages([MULTI_PAGE_2, MULTI_PAGE_1]);

    expect(decoded.page).toMatchObject({ number: null, count: 2, combined: true });
    expect(decoded.pages.map((page) => page.number)).toEqual([1, 2]);
    expect(decoded.sections).toHaveLength(2);
    expect(decoded.sections[0]).toMatchObject({
      code: "412",
      title: "Dauermedikation",
      pageNumbers: [1, 2]
    });
    expect(decoded.medications.map((medication) => medication.drugName)).toEqual([
      "Amlodipin",
      "Bisoprolol",
      "Magnesium"
    ]);
  });

  it("detects missing pages", () => {
    expect(catchCode(() => decodeBmpPages([MULTI_PAGE_1]))).toBe(BmpDecodeError.codes.MISSING_PAGE);
  });

  it("detects duplicate pages", () => {
    expect(catchCode(() => decodeBmpPages([MULTI_PAGE_1, MULTI_PAGE_1]))).toBe(BmpDecodeError.codes.DUPLICATE_PAGE);
  });

  it("detects mismatched page identity", () => {
    expect(catchCode(() => decodeBmpPages([MULTI_PAGE_1, V28_OFFICIAL_STYLE]))).toBe(
      BmpDecodeError.codes.INVALID_PAGE_ASSEMBLY
    );
  });
});

describe("barcode image fixtures", () => {
  it.each(BARCODE_FIXTURES)("round-trips a DataMatrix fixture image: %s", async (_name, payload) => {
    const text = await decodeGeneratedBarcode(payload, "datamatrix", ["DataMatrix"]);
    expect(decodeBmp(text).instanceId).toBe(decodeBmp(payload).instanceId);
  });

  it.each(LEGACY_BARCODE_FIXTURES)("round-trips a legacy DataMatrix fixture image: %s", async (_name, payload) => {
    const text = await decodeGeneratedBarcode(payload, "datamatrix", ["DataMatrix"]);
    const decoded = decodeBmp(text, { allowUnknownVersion: true });

    expect(decoded.instanceId).toBe(decodeBmp(payload, { allowUnknownVersion: true }).instanceId);
    expect(decoded.warnings[0].code).toBe("UNKNOWN_BMP_VERSION");
  });

  it("decodes a deliberately non-BMP QR image after image scanning returns text", async () => {
    const text = await decodeGeneratedBarcode(V27_COMPATIBLE, "qrcode", ["QRCode"]);
    const decoded = decodeBmp(text);

    expect(decoded.version).toBe("027");
  });
});

async function decodeGeneratedBarcode(payload, bcid, formats) {
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
  const imageData: ImageData = {
    data: Uint8ClampedArray.from(image.data),
    width: image.width,
    height: image.height,
    colorSpace: "srgb" as PredefinedColorSpace
  };
  const results = await readBarcodes(imageData, {
    formats,
    tryHarder: true,
    maxNumberOfSymbols: 1
  });

  expect(results).toHaveLength(1);
  return results[0].text;
}

function toLatin1Bytes(value) {
  return Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
}

function catchCode(callback) {
  try {
    callback();
  } catch (error) {
    return error.code;
  }
  throw new Error("Expected callback to throw.");
}

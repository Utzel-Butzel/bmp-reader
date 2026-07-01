import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  DEFAULT_SUPPORTED_VERSIONS,
  DOSE_UNITS,
  SECTION_HEADINGS,
  SEX_CODES,
  WEEKDAYS
} from "./codes.js";

export type BmpDecodeErrorCode =
  | "INVALID_INPUT"
  | "MALFORMED_XML"
  | "WRONG_ROOT"
  | "UNSUPPORTED_VERSION"
  | "MISSING_REQUIRED_ROOT_FIELD"
  | "MISSING_REQUIRED_FIELD"
  | "MISSING_PAGE"
  | "DUPLICATE_PAGE"
  | "INVALID_PAGE_ASSEMBLY";

export interface BmpDecodeOptions {
  allowUnknownVersion?: boolean;
  supportedVersions?: string[];
}

export interface BmpWarning {
  code: string;
  message: string;
  path?: string;
  value?: unknown;
  pageNumber?: number;
}

export interface BmpPage {
  number: number | null;
  count: number;
  explicitNumber: boolean;
  explicitCount: boolean;
  isMultiPage: boolean;
  combined: boolean;
}

export interface BmpPatient {
  firstName: string;
  lastName: string;
  insuranceId: string | null;
  birthDate: string;
  birthDateIso: string | null;
  sex: string | null;
  sexLabel: string | null;
  title: string | null;
  prefix: string | null;
  nameSuffix: string | null;
  attributes: Record<string, string>;
  unknownAttributes: Record<string, string>;
}

export interface BmpIssuer {
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  printedAt: string;
  identifier: { type: "lanr" | "idf" | "kik"; value: string } | null;
  identifiers: { lanr: string | null; idf: string | null; kik: string | null };
  attributes: Record<string, string>;
  unknownAttributes: Record<string, string>;
}

export interface BmpParameters {
  allergies: string | null;
  pregnant: boolean | null;
  breastfeeding: boolean | null;
  weightKg: string | null;
  heightCm: string | null;
  creatinineMgDl: string | null;
  text: string | null;
  attributes: Record<string, string>;
  unknownAttributes: Record<string, string>;
}

export type BmpDosage =
  | { type: "text"; text: string }
  | {
      type: "structured" | "weekly-structured";
      morning: string;
      midday: string;
      evening: string;
      night: string;
      schedule: string;
    }
  | { type: "none" };

export interface BmpMedication {
  type: "medication";
  sectionIndex: number;
  itemIndex: number;
  sectionCode?: string | null;
  sectionTitle?: string | null;
  pzn: string | null;
  drugName: string | null;
  dosageForm: { code: string | null; text: string | null };
  ingredients: Array<{
    name: string;
    strength: string | null;
    attributes: Record<string, string>;
    unknownAttributes: Record<string, string>;
  }>;
  dosage: BmpDosage;
  weekly: { dayCode: string; dayName: string | null } | null;
  doseUnit: { code: string | null; label: string | null; text: string | null };
  instructions: string | null;
  reason: string | null;
  note: string | null;
  attributes: Record<string, string>;
  unknownAttributes: Record<string, string>;
}

export interface BmpFreeText {
  type: "freeText";
  sectionIndex: number;
  itemIndex: number;
  text: string;
  attributes: Record<string, string>;
  unknownAttributes: Record<string, string>;
}

export interface BmpRecipe {
  type: "recipe";
  sectionIndex: number;
  itemIndex: number;
  text: string;
  note: string | null;
  attributes: Record<string, string>;
  unknownAttributes: Record<string, string>;
}

export type BmpSectionItem = BmpMedication | BmpFreeText | BmpRecipe;

export interface BmpSection {
  code: string | null;
  title: string | null;
  titleSource: "text" | "code" | null;
  items: BmpSectionItem[];
  pageNumbers: number[];
  attributes: Record<string, string>;
  unknownAttributes: Record<string, string>;
}

export interface BmpDecodedPage extends BmpPage {
  instanceId: string;
  version: string;
  rawXml?: string;
  warnings?: BmpWarning[];
}

export interface BmpDecoded {
  version: string;
  instanceId: string;
  language: string;
  page: BmpPage;
  pages: BmpDecodedPage[];
  patient: BmpPatient;
  issuer: BmpIssuer;
  parameters: BmpParameters | null;
  sections: BmpSection[];
  medications: BmpMedication[];
  rawXml: string;
  rawTree: unknown;
  attributes: Record<string, string>;
  unknownAttributes: Record<string, string>;
  warnings: BmpWarning[];
}

export const BMP_DECODE_ERROR_CODES = Object.freeze({
  INVALID_INPUT: "INVALID_INPUT",
  MALFORMED_XML: "MALFORMED_XML",
  WRONG_ROOT: "WRONG_ROOT",
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
  MISSING_REQUIRED_ROOT_FIELD: "MISSING_REQUIRED_ROOT_FIELD",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  MISSING_PAGE: "MISSING_PAGE",
  DUPLICATE_PAGE: "DUPLICATE_PAGE",
  INVALID_PAGE_ASSEMBLY: "INVALID_PAGE_ASSEMBLY"
}) as Record<BmpDecodeErrorCode, BmpDecodeErrorCode>;

export class BmpDecodeError extends Error {
  static codes = BMP_DECODE_ERROR_CODES;
  code: BmpDecodeErrorCode;
  details: Record<string, unknown>;

  constructor(code: BmpDecodeErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "BmpDecodeError";
    this.code = code;
    this.details = details;
  }
}

const XML_ATTRIBUTES_KEY = ":@";
const ORDERED_XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  parseTagValue: false,
  preserveOrder: true,
  trimValues: true
});

const ROOT_ATTRS = new Set(["v", "U", "a", "z", "l"]);
const PATIENT_ATTRS = new Set(["g", "f", "egk", "b", "s", "t", "v", "z"]);
const ISSUER_ATTRS = new Set(["lanr", "idf", "kik", "n", "s", "z", "c", "p", "e", "t"]);
const PARAMETER_ATTRS = new Set(["ai", "p", "b", "w", "h", "c", "x"]);
const SECTION_ATTRS = new Set(["t", "c"]);
const MEDICATION_ATTRS = new Set([
  "p",
  "a",
  "f",
  "fd",
  "wo",
  "m",
  "d",
  "v",
  "h",
  "t",
  "du",
  "dud",
  "i",
  "r",
  "x"
]);
const INGREDIENT_ATTRS = new Set(["w", "s"]);
const FREE_TEXT_ATTRS = new Set(["t"]);
const RECIPE_ATTRS = new Set(["t", "x"]);

/**
 * Decode one BMP carrier payload returned by a scanner.
 *
 * @param {string | Uint8Array | ArrayBuffer} input
 * @param {{ allowUnknownVersion?: boolean, supportedVersions?: string[] }} [options]
 */
export function decodeBmp(input: string | Uint8Array | ArrayBuffer, options: BmpDecodeOptions = {}): BmpDecoded {
  const rawXml = normalizeInput(input);
  const validation = XMLValidator.validate(rawXml, {
    allowBooleanAttributes: false
  });

  if (validation !== true) {
    throw new BmpDecodeError(
      BMP_DECODE_ERROR_CODES.MALFORMED_XML,
      formatXmlValidationError(validation),
      { validation }
    );
  }

  let parsed;
  try {
    parsed = ORDERED_XML_PARSER.parse(rawXml);
  } catch (error) {
    throw new BmpDecodeError(
      BMP_DECODE_ERROR_CODES.MALFORMED_XML,
      error instanceof Error ? error.message : "Could not parse BMP XML.",
      { cause: error }
    );
  }

  const rootEntry = findRootEntry(parsed);
  if (!rootEntry) {
    throw new BmpDecodeError(
      BMP_DECODE_ERROR_CODES.WRONG_ROOT,
      "Expected BMP XML root element <MP>.",
      { rootElements: findElementNames(parsed) }
    );
  }

  return normalizeBmpRoot(rootEntry, rawXml, options);
}

/**
 * Decode and assemble all pages of a multi-page BMP.
 *
 * @param {Array<string | Uint8Array | ArrayBuffer>} inputs
 * @param {{ allowUnknownVersion?: boolean, supportedVersions?: string[] }} [options]
 */
export function decodeBmpPages(
  inputs: Array<string | Uint8Array | ArrayBuffer>,
  options: BmpDecodeOptions = {}
): BmpDecoded {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new BmpDecodeError(
      BMP_DECODE_ERROR_CODES.INVALID_INPUT,
      "decodeBmpPages() expects a non-empty array of payloads."
    );
  }

  const decodedPages = inputs.map((input) => decodeBmp(input, options));
  const first = decodedPages[0];
  const expectedPageCount = first.page.count;

  for (const decoded of decodedPages) {
    if (decoded.instanceId !== first.instanceId || decoded.version !== first.version) {
      throw new BmpDecodeError(
        BMP_DECODE_ERROR_CODES.INVALID_PAGE_ASSEMBLY,
        "All BMP pages must have the same instance ID and version.",
        {
          expected: { instanceId: first.instanceId, version: first.version },
          actual: { instanceId: decoded.instanceId, version: decoded.version }
        }
      );
    }

    if (decoded.language !== first.language) {
      throw new BmpDecodeError(
        BMP_DECODE_ERROR_CODES.INVALID_PAGE_ASSEMBLY,
        "All BMP pages must have the same language.",
        { expected: first.language, actual: decoded.language }
      );
    }

    if (decoded.page.count !== expectedPageCount) {
      throw new BmpDecodeError(
        BMP_DECODE_ERROR_CODES.INVALID_PAGE_ASSEMBLY,
        "All BMP pages must declare the same total page count.",
        { expected: expectedPageCount, actual: decoded.page.count }
      );
    }

    if (decoded.page.number < 1 || decoded.page.number > expectedPageCount) {
      throw new BmpDecodeError(
        BMP_DECODE_ERROR_CODES.INVALID_PAGE_ASSEMBLY,
        "BMP page number is outside the declared page range.",
        { page: decoded.page.number, pageCount: expectedPageCount }
      );
    }
  }

  const byPageNumber = new Map();
  for (const decoded of decodedPages) {
    const previous = byPageNumber.get(decoded.page.number);
    if (previous) {
      throw new BmpDecodeError(
        BMP_DECODE_ERROR_CODES.DUPLICATE_PAGE,
        `BMP page ${decoded.page.number} was provided more than once.`,
        { page: decoded.page.number }
      );
    }
    byPageNumber.set(decoded.page.number, decoded);
  }

  for (let pageNumber = 1; pageNumber <= expectedPageCount; pageNumber += 1) {
    if (!byPageNumber.has(pageNumber)) {
      throw new BmpDecodeError(
        BMP_DECODE_ERROR_CODES.MISSING_PAGE,
        `BMP page ${pageNumber} is missing.`,
        { page: pageNumber, pageCount: expectedPageCount }
      );
    }
  }

  const sortedPages = [...byPageNumber.values()].sort((left, right) => left.page.number - right.page.number);
  const identity = pageIdentity(first);
  for (const decoded of sortedPages.slice(1)) {
    if (pageIdentity(decoded) !== identity) {
      throw new BmpDecodeError(
        BMP_DECODE_ERROR_CODES.INVALID_PAGE_ASSEMBLY,
        "BMP pages contain conflicting patient, issuer, or parameter data.",
        { page: decoded.page.number }
      );
    }
  }

  const sections = mergePageSections(sortedPages);
  const medications = flattenMedications(sections);
  const warnings = sortedPages.flatMap((page) =>
    page.warnings.map((warning) => ({
      ...warning,
      pageNumber: page.page.number
    }))
  );

  return {
    ...first,
    page: {
      number: null,
      count: expectedPageCount,
      explicitNumber: true,
      explicitCount: expectedPageCount > 1,
      isMultiPage: expectedPageCount > 1,
      combined: true
    },
    pages: sortedPages.map((page) => ({
      ...page.page,
      instanceId: page.instanceId,
      version: page.version,
      rawXml: page.rawXml,
      warnings: page.warnings
    })),
    rawXml: sortedPages.map((page) => page.rawXml).join("\n"),
    rawTree: sortedPages.map((page) => page.rawTree),
    warnings,
    sections,
    medications
  };
}

function normalizeBmpRoot(rootEntry, rawXml, options) {
  const rootAttrs = getAttributes(rootEntry);
  const warnings = [];

  requireField(rootAttrs.v, "MP.v", BMP_DECODE_ERROR_CODES.MISSING_REQUIRED_ROOT_FIELD);
  requireField(rootAttrs.U, "MP.U", BMP_DECODE_ERROR_CODES.MISSING_REQUIRED_ROOT_FIELD);
  requireField(rootAttrs.l, "MP.l", BMP_DECODE_ERROR_CODES.MISSING_REQUIRED_ROOT_FIELD);

  const supportedVersions = new Set(options.supportedVersions ?? DEFAULT_SUPPORTED_VERSIONS);
  if (!supportedVersions.has(rootAttrs.v)) {
    if (!options.allowUnknownVersion) {
      throw new BmpDecodeError(
        BMP_DECODE_ERROR_CODES.UNSUPPORTED_VERSION,
        `Unsupported BMP version "${rootAttrs.v}".`,
        { version: rootAttrs.v, supportedVersions: [...supportedVersions] }
      );
    }
    pushWarning(warnings, "UNKNOWN_BMP_VERSION", `BMP version "${rootAttrs.v}" is not in the supported version list.`, "MP.v", rootAttrs.v);
  }

  const rootChildren = getChildren(rootEntry, "MP");
  warnUnknownChildren(warnings, rootChildren, new Set(["P", "A", "O", "S"]), "MP");

  const patientEntry = requireChild(rootChildren, "P", "MP.P", BMP_DECODE_ERROR_CODES.MISSING_REQUIRED_ROOT_FIELD);
  const issuerEntry = requireChild(rootChildren, "A", "MP.A", BMP_DECODE_ERROR_CODES.MISSING_REQUIRED_ROOT_FIELD);
  const parameterEntry = firstChild(rootChildren, "O");
  const sectionEntries = childrenByName(rootChildren, "S");

  warnDuplicateChildren(warnings, rootChildren, "P", "MP.P");
  warnDuplicateChildren(warnings, rootChildren, "A", "MP.A");
  warnDuplicateChildren(warnings, rootChildren, "O", "MP.O");

  const patient = normalizePatient(patientEntry, warnings);
  const issuer = normalizeIssuer(issuerEntry, warnings);
  const parameters = parameterEntry ? normalizeParameters(parameterEntry) : null;
  const page = normalizePage(rootAttrs, warnings);
  const sections = reindexSections(sectionEntries.map((entry, index) => normalizeSection(entry, index, warnings)));
  for (const section of sections) {
    section.pageNumbers = [page.number];
  }
  const medications = flattenMedications(sections);

  return {
    version: rootAttrs.v,
    instanceId: rootAttrs.U,
    language: rootAttrs.l,
    page,
    pages: [
      {
        ...page,
        instanceId: rootAttrs.U,
        version: rootAttrs.v
      }
    ],
    patient,
    issuer,
    parameters,
    sections,
    medications,
    rawXml,
    rawTree: rootEntry,
    attributes: copyObject(rootAttrs),
    unknownAttributes: unknownAttributes(rootAttrs, ROOT_ATTRS),
    warnings
  };
}

function normalizePatient(entry, warnings) {
  const attrs = getAttributes(entry);
  requireField(attrs.g, "MP.P.g");
  requireField(attrs.f, "MP.P.f");
  requireField(attrs.b, "MP.P.b");

  if (attrs.s && !SEX_CODES[attrs.s]) {
    pushWarning(warnings, "UNKNOWN_SEX_CODE", `Unknown patient sex code "${attrs.s}".`, "MP.P.s", attrs.s);
  }

  return {
    firstName: attrs.g,
    lastName: attrs.f,
    insuranceId: attrs.egk ?? null,
    birthDate: attrs.b,
    birthDateIso: toIsoDate(attrs.b),
    sex: attrs.s ?? null,
    sexLabel: attrs.s ? SEX_CODES[attrs.s] ?? null : null,
    title: attrs.t ?? null,
    prefix: attrs.v ?? null,
    nameSuffix: attrs.z ?? null,
    attributes: copyObject(attrs),
    unknownAttributes: unknownAttributes(attrs, PATIENT_ATTRS)
  };
}

function normalizeIssuer(entry, warnings): BmpIssuer {
  const attrs = getAttributes(entry);
  requireField(attrs.n, "MP.A.n");
  requireField(attrs.t, "MP.A.t");

  const identifiers: BmpIssuer["identifiers"] = {
    lanr: attrs.lanr ?? null,
    idf: attrs.idf ?? null,
    kik: attrs.kik ?? null
  };
  const identifierEntries: Array<["lanr" | "idf" | "kik", string | null]> = [
    ["lanr", identifiers.lanr],
    ["idf", identifiers.idf],
    ["kik", identifiers.kik]
  ];
  const presentIdentifiers = identifierEntries.filter((entry): entry is ["lanr" | "idf" | "kik", string] => entry[1] != null);
  if (presentIdentifiers.length > 1) {
    pushWarning(
      warnings,
      "MUTUALLY_EXCLUSIVE_ATTRIBUTES",
      "Only one of MP.A.lanr, MP.A.idf, or MP.A.kik should be present.",
      "MP.A",
      Object.fromEntries(presentIdentifiers)
    );
  }

  return {
    name: attrs.n,
    street: attrs.s ?? null,
    postalCode: attrs.z ?? null,
    city: attrs.c ?? null,
    phone: attrs.p ?? null,
    email: attrs.e ?? null,
    printedAt: attrs.t,
    identifier: presentIdentifiers[0]
      ? {
          type: presentIdentifiers[0][0],
          value: presentIdentifiers[0][1]
        }
      : null,
    identifiers,
    attributes: copyObject(attrs),
    unknownAttributes: unknownAttributes(attrs, ISSUER_ATTRS)
  };
}

function normalizeParameters(entry) {
  const attrs = getAttributes(entry);
  return {
    allergies: attrs.ai ?? null,
    pregnant: attrs.p === "1" ? true : null,
    breastfeeding: attrs.b === "1" ? true : null,
    weightKg: attrs.w ?? null,
    heightCm: attrs.h ?? null,
    creatinineMgDl: attrs.c ?? null,
    text: attrs.x ?? null,
    attributes: copyObject(attrs),
    unknownAttributes: unknownAttributes(attrs, PARAMETER_ATTRS)
  };
}

function normalizeSection(entry, sectionIndex, warnings) {
  const attrs = getAttributes(entry);
  if (attrs.t && attrs.c) {
    pushWarning(
      warnings,
      "MUTUALLY_EXCLUSIVE_ATTRIBUTES",
      "Section attributes t and c should not be present at the same time.",
      `MP.S[${sectionIndex}]`,
      { t: attrs.t, c: attrs.c }
    );
  }

  if (attrs.c && !SECTION_HEADINGS[attrs.c]) {
    pushWarning(warnings, "UNKNOWN_SECTION_CODE", `Unknown section heading code "${attrs.c}".`, `MP.S[${sectionIndex}].c`, attrs.c);
  }

  const content = getChildren(entry, "S");
  const items = [];
  for (const child of content) {
    if (hasElement(child, "M")) {
      items.push(normalizeMedication(child, sectionIndex, items.length, warnings));
    } else if (hasElement(child, "X")) {
      items.push(normalizeFreeText(child, sectionIndex, items.length));
    } else if (hasElement(child, "R")) {
      items.push(normalizeRecipe(child, sectionIndex, items.length));
    } else if (hasMeaningfulText(child)) {
      pushWarning(warnings, "UNKNOWN_XML_NODE", "Unexpected text node in section.", `MP.S[${sectionIndex}]`, child["#text"]);
    } else {
      const names = findElementNames([child]);
      if (names.length > 0) {
        pushWarning(warnings, "UNKNOWN_XML_NODE", `Unexpected element <${names[0]}> in section.`, `MP.S[${sectionIndex}]`, names[0]);
      }
    }
  }

  return {
    code: attrs.c ?? null,
    title: attrs.t ?? (attrs.c ? SECTION_HEADINGS[attrs.c] ?? null : null),
    titleSource: attrs.t ? "text" : attrs.c ? "code" : null,
    items,
    pageNumbers: [],
    attributes: copyObject(attrs),
    unknownAttributes: unknownAttributes(attrs, SECTION_ATTRS)
  };
}

function normalizeMedication(entry, sectionIndex, itemIndex, warnings) {
  const attrs = getAttributes(entry);
  const path = `MP.S[${sectionIndex}].M[${itemIndex}]`;

  warnExclusiveAttrs(warnings, attrs, ["f", "fd"], path);
  warnExclusiveAttrs(warnings, attrs, ["du", "dud"], path);

  const hasStructuredDose = ["m", "d", "v", "h"].some((name) => attrs[name] != null);
  if (attrs.t != null && hasStructuredDose) {
    pushWarning(
      warnings,
      "MUTUALLY_EXCLUSIVE_ATTRIBUTES",
      "Medication text dosage t should not be combined with m, d, v, or h.",
      path,
      pick(attrs, ["t", "m", "d", "v", "h"])
    );
  }

  if (attrs.wo != null) {
    if (!WEEKDAYS[attrs.wo]) {
      pushWarning(warnings, "UNKNOWN_WEEKDAY_CODE", `Unknown weekday code "${attrs.wo}".`, `${path}.wo`, attrs.wo);
    }
    if (!hasStructuredDose) {
      pushWarning(warnings, "INVALID_WEEKLY_DOSAGE", "Weekly dosage requires at least one structured dosage value.", `${path}.wo`, attrs.wo);
    }
    if (attrs.x != null) {
      pushWarning(
        warnings,
        "MUTUALLY_EXCLUSIVE_ATTRIBUTES",
        "Medication attribute x should not be present when weekly dosage attribute wo is present.",
        path,
        pick(attrs, ["wo", "x"])
      );
    }
  }

  if (attrs.du != null && !DOSE_UNITS[attrs.du]) {
    pushWarning(warnings, "UNKNOWN_DOSE_UNIT_CODE", `Unknown dose-unit code "${attrs.du}".`, `${path}.du`, attrs.du);
  }

  const ingredients = childrenByName(getChildren(entry, "M"), "W").map((ingredientEntry, ingredientIndex) =>
    normalizeIngredient(ingredientEntry, `${path}.W[${ingredientIndex}]`)
  );

  if (attrs.p != null && attrs.a == null && attrs.f == null && attrs.fd == null && ingredients.length === 0) {
    pushWarning(
      warnings,
      "UNRESOLVED_PZN_ONLY_MEDICATION",
      "Medication contains a PZN without display details; an external drug database may be needed.",
      path,
      attrs.p
    );
  }

  return {
    type: "medication",
    sectionIndex,
    itemIndex,
    pzn: attrs.p ?? null,
    drugName: attrs.a ?? null,
    dosageForm: {
      code: attrs.f ?? null,
      text: attrs.fd ?? null
    },
    ingredients,
    dosage: normalizeDosage(attrs),
    weekly: attrs.wo
      ? {
          dayCode: attrs.wo,
          dayName: WEEKDAYS[attrs.wo] ?? null
        }
      : null,
    doseUnit: {
      code: attrs.du ?? null,
      label: attrs.du ? DOSE_UNITS[attrs.du] ?? null : null,
      text: attrs.dud ?? null
    },
    instructions: attrs.i ?? null,
    reason: attrs.r ?? null,
    note: attrs.x ?? null,
    attributes: copyObject(attrs),
    unknownAttributes: unknownAttributes(attrs, MEDICATION_ATTRS)
  };
}

function normalizeIngredient(entry, path) {
  const attrs = getAttributes(entry);
  requireField(attrs.w, `${path}.w`);
  return {
    name: attrs.w,
    strength: attrs.s ?? null,
    attributes: copyObject(attrs),
    unknownAttributes: unknownAttributes(attrs, INGREDIENT_ATTRS)
  };
}

function normalizeFreeText(entry, sectionIndex, itemIndex) {
  const attrs = getAttributes(entry);
  requireField(attrs.t, `MP.S[${sectionIndex}].X[${itemIndex}].t`);
  return {
    type: "freeText",
    sectionIndex,
    itemIndex,
    text: attrs.t,
    attributes: copyObject(attrs),
    unknownAttributes: unknownAttributes(attrs, FREE_TEXT_ATTRS)
  };
}

function normalizeRecipe(entry, sectionIndex, itemIndex) {
  const attrs = getAttributes(entry);
  requireField(attrs.t, `MP.S[${sectionIndex}].R[${itemIndex}].t`);
  return {
    type: "recipe",
    sectionIndex,
    itemIndex,
    text: attrs.t,
    note: attrs.x ?? null,
    attributes: copyObject(attrs),
    unknownAttributes: unknownAttributes(attrs, RECIPE_ATTRS)
  };
}

function normalizeDosage(attrs) {
  if (attrs.t != null) {
    return {
      type: "text",
      text: attrs.t
    };
  }

  if (["m", "d", "v", "h"].some((name) => attrs[name] != null)) {
    const structured = {
      morning: attrs.m ?? "0",
      midday: attrs.d ?? "0",
      evening: attrs.v ?? "0",
      night: attrs.h ?? "0"
    };
    return {
      type: attrs.wo ? "weekly-structured" : "structured",
      ...structured,
      schedule: `${structured.morning}-${structured.midday}-${structured.evening}-${structured.night}`
    };
  }

  return {
    type: "none"
  };
}

function normalizePage(attrs, warnings) {
  const explicitNumber = attrs.a != null;
  const explicitCount = attrs.z != null;
  const pageNumber = explicitNumber ? toPositiveInteger(attrs.a, "MP.a", warnings) : 1;
  const pageCount = explicitCount ? toPositiveInteger(attrs.z, "MP.z", warnings) : 1;

  if (pageCount === 1 && (explicitNumber || explicitCount)) {
    pushWarning(
      warnings,
      "UNEXPECTED_SINGLE_PAGE_NUMBERING",
      "Single-page BMPs should omit page number and total page count attributes.",
      "MP",
      pick(attrs, ["a", "z"])
    );
  }

  if (pageCount > 1 && (!explicitNumber || !explicitCount)) {
    pushWarning(
      warnings,
      "INCOMPLETE_MULTI_PAGE_NUMBERING",
      "Multi-page BMPs should include both page number and total page count attributes.",
      "MP",
      pick(attrs, ["a", "z"])
    );
  }

  return {
    number: pageNumber,
    count: pageCount,
    explicitNumber,
    explicitCount,
    isMultiPage: pageCount > 1,
    combined: false
  };
}

function normalizeInput(input) {
  let text;
  if (typeof input === "string") {
    text = input;
  } else if (input instanceof ArrayBuffer) {
    text = latin1BytesToString(new Uint8Array(input));
  } else if (input instanceof Uint8Array) {
    text = latin1BytesToString(input);
  } else {
    throw new BmpDecodeError(
      BMP_DECODE_ERROR_CODES.INVALID_INPUT,
      "BMP input must be a string, Uint8Array, or ArrayBuffer.",
      { inputType: typeof input }
    );
  }

  const trimmed = text.replace(/^\uFEFF/, "").trim();
  return trimmed.replace(/^<\?xml\b[^?]*\?>\s*/i, "").trim();
}

function latin1BytesToString(bytes) {
  let result = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    result += String.fromCharCode(...chunk);
  }
  return result;
}

function formatXmlValidationError(validation) {
  if (validation && validation.err) {
    const { msg, line, col } = validation.err;
    const location = line != null && col != null ? ` at ${line}:${col}` : "";
    return `Malformed BMP XML${location}: ${msg}`;
  }
  return "Malformed BMP XML.";
}

function findRootEntry(parsed) {
  if (!Array.isArray(parsed)) {
    return null;
  }
  return parsed.find((entry) => hasElement(entry, "MP")) ?? null;
}

function getAttributes(entry) {
  return copyObject(entry?.[XML_ATTRIBUTES_KEY] ?? {});
}

function getChildren(entry, name) {
  const children = entry?.[name];
  return Array.isArray(children) ? children : [];
}

function hasElement(entry, name) {
  return Object.prototype.hasOwnProperty.call(entry ?? {}, name);
}

function firstChild(children, name) {
  return children.find((entry) => hasElement(entry, name)) ?? null;
}

function requireChild(children, name, path, code) {
  const child = firstChild(children, name);
  if (!child) {
    throw new BmpDecodeError(code, `Missing required BMP element ${path}.`, { path });
  }
  return child;
}

function childrenByName(children, name) {
  return children.filter((entry) => hasElement(entry, name));
}

function requireField(value, path, code = BMP_DECODE_ERROR_CODES.MISSING_REQUIRED_FIELD) {
  if (value == null || value === "") {
    throw new BmpDecodeError(code, `Missing required BMP field ${path}.`, { path });
  }
}

function warnDuplicateChildren(warnings, children, name, path) {
  const count = childrenByName(children, name).length;
  if (count > 1) {
    pushWarning(warnings, "DUPLICATE_ELEMENT", `Element ${path} appears ${count} times; using the first one.`, path, count);
  }
}

function warnUnknownChildren(warnings, children, allowed, path) {
  for (const child of children) {
    for (const name of findElementNames([child])) {
      if (!allowed.has(name)) {
        pushWarning(warnings, "UNKNOWN_XML_NODE", `Unexpected element <${name}> in ${path}.`, path, name);
      }
    }
  }
}

function findElementNames(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.flatMap((entry) =>
    Object.keys(entry ?? {}).filter((key) => key !== XML_ATTRIBUTES_KEY && key !== "#text")
  );
}

function hasMeaningfulText(entry) {
  return typeof entry?.["#text"] === "string" && entry["#text"].trim() !== "";
}

function warnExclusiveAttrs(warnings, attrs, names, path) {
  const present = names.filter((name) => attrs[name] != null);
  if (present.length > 1) {
    pushWarning(
      warnings,
      "MUTUALLY_EXCLUSIVE_ATTRIBUTES",
      `Attributes ${present.join(" and ")} should not be present at the same time.`,
      path,
      pick(attrs, present)
    );
  }
}

function pushWarning(warnings, code, message, path, value) {
  warnings.push({
    code,
    message,
    path,
    value
  });
}

function unknownAttributes(attrs: Record<string, string>, known: Set<string>): Record<string, string> {
  return Object.fromEntries(Object.entries(attrs).filter(([name]) => !known.has(name))) as Record<string, string>;
}

function copyObject(value: Record<string, string>): Record<string, string> {
  return { ...value };
}

function pick(attrs, names) {
  return Object.fromEntries(names.filter((name) => attrs[name] != null).map((name) => [name, attrs[name]]));
}

function toIsoDate(value) {
  if (!/^\d{8}$/.test(value ?? "")) {
    return null;
  }
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  if (month === "00" || day === "00") {
    return null;
  }
  return `${year}-${month}-${day}`;
}

function toPositiveInteger(value, path, warnings) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    pushWarning(warnings, "INVALID_PAGE_NUMBER", `Expected a positive integer at ${path}.`, path, value);
    return 1;
  }
  return parsed;
}

function flattenMedications(sections) {
  const medications = [];
  for (const [sectionIndex, section] of sections.entries()) {
    for (const [itemIndex, item] of section.items.entries()) {
      item.sectionIndex = sectionIndex;
      item.itemIndex = itemIndex;
      if (item.type === "medication") {
        medications.push({
          ...item,
          sectionIndex,
          itemIndex,
          sectionCode: section.code,
          sectionTitle: section.title
        });
      }
    }
  }
  return medications;
}

function reindexSections(sections) {
  for (const [sectionIndex, section] of sections.entries()) {
    for (const [itemIndex, item] of section.items.entries()) {
      item.sectionIndex = sectionIndex;
      item.itemIndex = itemIndex;
    }
  }
  return sections;
}

function mergePageSections(pages) {
  const sections = [];
  for (const page of pages) {
    for (const section of page.sections) {
      const copy = clonePlain(section);
      copy.pageNumbers = [page.page.number];

      const previous = sections[sections.length - 1];
      if (previous && sameSectionHeading(previous, copy)) {
        previous.items.push(...copy.items);
        previous.pageNumbers.push(page.page.number);
      } else {
        sections.push(copy);
      }
    }
  }
  return reindexSections(sections);
}

function sameSectionHeading(left, right) {
  return left.code === right.code && left.title === right.title && left.titleSource === right.titleSource;
}

function pageIdentity(page) {
  return JSON.stringify({
    patient: page.patient,
    issuer: page.issuer,
    parameters: page.parameters
  });
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

import { BmpDecodeError, decodeBmp, decodeBmpPages } from "./bmp-reader.browser.js";
import { prepareZXingModule, readBarcodes } from "./zxing-reader.browser.js";

const PAGE_SEPARATOR = "\n\n--- BMP PAGE ---\n\n";
const ZXING_WASM_URL = new URL("./zxing_reader.wasm", import.meta.url).href;
const ZXING_MODULE_OVERRIDES = {
  locateFile: (path, prefix) => (path.endsWith(".wasm") ? ZXING_WASM_URL : `${prefix}${path}`)
};
const BARCODE_READER_OPTIONS = {
  formats: ["DataMatrix"],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 4,
  textMode: "Plain",
  characterSet: "ISO8859_1"
};

const samples = [
  {
    id: "v28",
    label: "v2.8 official-style",
    files: ["./assets/samples/v2.8-official-style.xml"]
  },
  {
    id: "v27",
    label: "v2.7 compatible",
    files: ["./assets/samples/v2.7-compatible.xml"]
  },
  {
    id: "multi",
    label: "v2.8 multi-page",
    files: ["./assets/samples/multi-page-page-1.xml", "./assets/samples/multi-page-page-2.xml"],
    assemble: true
  },
  {
    id: "legacy",
    label: "v2.3 legacy",
    files: ["./assets/samples/abda-spec-v2.3-abbildung-3.xml"],
    allowUnknownVersion: true
  }
];

const state = {
  decoded: null,
  formattedXml: "",
  activeTab: "overview",
  loadingSample: false,
  scanner: {
    readyPromise: null,
    stream: null,
    scanTimer: 0,
    scanInFlight: false
  }
};

const elements = {
  sampleSelect: document.querySelector("#sample-select"),
  xmlInput: document.querySelector("#xml-input"),
  assemblePages: document.querySelector("#assemble-pages"),
  allowUnknown: document.querySelector("#allow-unknown"),
  appendScan: document.querySelector("#append-scan"),
  barcodeFile: document.querySelector("#barcode-file"),
  cameraPreview: document.querySelector("#camera-preview"),
  cameraCanvas: document.querySelector("#camera-canvas"),
  scannerStatus: document.querySelector("#scanner-status"),
  startCameraButton: document.querySelector("#start-camera-button"),
  scanFrameButton: document.querySelector("#scan-frame-button"),
  stopCameraButton: document.querySelector("#stop-camera-button"),
  decodeButton: document.querySelector("#decode-button"),
  formatButton: document.querySelector("#format-button"),
  clearButton: document.querySelector("#clear-button"),
  payloadCount: document.querySelector("#payload-count"),
  status: document.querySelector("#decode-status"),
  tabs: [...document.querySelectorAll(".tab")],
  panels: {
    overview: document.querySelector("#panel-overview"),
    medications: document.querySelector("#panel-medications"),
    sections: document.querySelector("#panel-sections"),
    warnings: document.querySelector("#panel-warnings"),
    json: document.querySelector("#panel-json"),
    xml: document.querySelector("#panel-xml")
  }
};

init();

function init() {
  elements.sampleSelect.innerHTML =
    '<option value="custom">Custom / scanned XML</option>' +
    samples.map((sample) => `<option value="${escapeHtml(sample.id)}">${escapeHtml(sample.label)}</option>`).join("");

  elements.sampleSelect.addEventListener("change", () => {
    if (elements.sampleSelect.value !== "custom") {
      loadSample(elements.sampleSelect.value);
    }
  });
  elements.xmlInput.addEventListener("input", () => {
    markCustomInput();
    updatePayloadCount();
  });
  elements.barcodeFile.addEventListener("change", () => {
    scanSelectedFile();
  });
  elements.startCameraButton.addEventListener("click", () => {
    startCamera();
  });
  elements.scanFrameButton.addEventListener("click", () => {
    scanCameraFrame({ silent: false });
  });
  elements.stopCameraButton.addEventListener("click", () => {
    stopCamera();
  });
  elements.decodeButton.addEventListener("click", () => {
    decodeCurrentInput();
  });
  elements.formatButton.addEventListener("click", () => {
    elements.xmlInput.value = formatPayloads(elements.xmlInput.value);
    markCustomInput();
    updatePayloadCount();
    decodeCurrentInput();
  });
  elements.clearButton.addEventListener("click", () => {
    elements.xmlInput.value = "";
    elements.sampleSelect.value = "custom";
    elements.barcodeFile.value = "";
    state.decoded = null;
    state.formattedXml = "";
    updatePayloadCount();
    setStatus("Waiting for XML");
    renderEmpty();
  });

  for (const tab of elements.tabs) {
    tab.addEventListener("click", () => {
      activateTab(tab.dataset.tab);
    });
  }

  renderEmpty();
  loadSample(samples[0].id);
}

async function loadSample(sampleId) {
  const sample = samples.find((entry) => entry.id === sampleId) ?? samples[0];
  try {
    state.loadingSample = true;
    elements.sampleSelect.value = sample.id;
    setStatus("Loading sample");
    const payloads = await Promise.all(sample.files.map((file) => fetchText(file)));
    elements.xmlInput.value = payloads.join(PAGE_SEPARATOR);
    elements.assemblePages.checked = Boolean(sample.assemble);
    elements.allowUnknown.checked = Boolean(sample.allowUnknownVersion);
    updatePayloadCount();
    decodeCurrentInput();
  } catch (error) {
    renderError(error);
  } finally {
    state.loadingSample = false;
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url} (${response.status}).`);
  }
  return (await response.text()).trim();
}

async function ensureBarcodeReader() {
  if (!state.scanner.readyPromise) {
    setScannerStatus("Loading ZXing");
    state.scanner.readyPromise = prepareZXingModule({
      overrides: ZXING_MODULE_OVERRIDES,
      fireImmediately: true
    });
  }
  await state.scanner.readyPromise;
}

async function scanSelectedFile() {
  const file = elements.barcodeFile.files?.[0];
  if (!file) {
    return;
  }
  if (!isSupportedImageFile(file)) {
    setScannerStatus("Choose an image file", "error");
    return;
  }

  try {
    setScannerStatus(`Scanning ${file.name}`);
    const result = await scanBarcodeSource(file);
    applyScannedBarcode(result, file.name);
  } catch (error) {
    setScannerStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setScannerStatus("Camera unavailable", "error");
    return;
  }

  try {
    setScannerStatus("Starting camera");
    await ensureBarcodeReader();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    state.scanner.stream = stream;
    elements.cameraPreview.srcObject = stream;
    elements.cameraPreview.classList.add("is-active");
    await elements.cameraPreview.play();
    updateCameraControls(true);
    setScannerStatus("Scanning camera");
    scheduleCameraScan();
  } catch (error) {
    stopCamera({ keepStatus: true });
    setScannerStatus(formatCameraError(error), "error");
  }
}

function stopCamera(options = {}) {
  if (state.scanner.scanTimer) {
    window.clearTimeout(state.scanner.scanTimer);
    state.scanner.scanTimer = 0;
  }
  if (state.scanner.stream) {
    for (const track of state.scanner.stream.getTracks()) {
      track.stop();
    }
  }
  state.scanner.stream = null;
  state.scanner.scanInFlight = false;
  elements.cameraPreview.pause();
  elements.cameraPreview.srcObject = null;
  elements.cameraPreview.classList.remove("is-active");
  updateCameraControls(false);
  if (!options.keepStatus) {
    setScannerStatus("Idle");
  }
}

function scheduleCameraScan() {
  if (!state.scanner.stream) {
    return;
  }
  state.scanner.scanTimer = window.setTimeout(async () => {
    await scanCameraFrame({ silent: true });
    scheduleCameraScan();
  }, 750);
}

async function scanCameraFrame(options = {}) {
  if (!state.scanner.stream || state.scanner.scanInFlight) {
    return;
  }

  const imageData = captureCameraImage();
  if (!imageData) {
    if (!options.silent) {
      setScannerStatus("Camera not ready", "error");
    }
    return;
  }

  state.scanner.scanInFlight = true;
  try {
    const result = await scanBarcodeSource(imageData);
    applyScannedBarcode(result, "camera");
    stopCamera({ keepStatus: true });
  } catch (error) {
    if (!options.silent || !isNoBarcodeError(error)) {
      setScannerStatus(error instanceof Error ? error.message : String(error), "error");
    } else {
      setScannerStatus("Scanning camera");
    }
  } finally {
    state.scanner.scanInFlight = false;
  }
}

function captureCameraImage() {
  const video = elements.cameraPreview;
  if (!video.videoWidth || !video.videoHeight) {
    return null;
  }

  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = elements.cameraCanvas;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

async function scanBarcodeSource(input) {
  await ensureBarcodeReader();
  const results = await readBarcodes(input, BARCODE_READER_OPTIONS);
  const result = results.find((entry) => entry.isValid && entry.symbology === "DataMatrix");
  if (!result) {
    throw new Error("No DataMatrix code found");
  }
  return result;
}

function applyScannedBarcode(result, source) {
  const payload = payloadFromBarcode(result).trim();
  if (!payload) {
    throw new Error("Barcode payload is empty");
  }

  const shouldAppend = elements.appendScan.checked && elements.xmlInput.value.trim();
  elements.xmlInput.value = shouldAppend ? `${elements.xmlInput.value.trim()}${PAGE_SEPARATOR}${payload}` : payload;
  if (shouldAppend) {
    elements.assemblePages.checked = true;
  }
  elements.sampleSelect.value = "custom";
  updatePayloadCount();
  decodeCurrentInput();
  setScannerStatus(`${result.format} from ${source}`, "ok");
}

function payloadFromBarcode(result) {
  if (result.bytes?.length) {
    return latin1BytesToString(result.bytes);
  }
  return result.text ?? "";
}

function latin1BytesToString(bytes) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    output += String.fromCharCode(...bytes.slice(index, index + 8192));
  }
  return output;
}

function isSupportedImageFile(file) {
  return file.type.startsWith("image/") || /\.(bmp|gif|jpe?g|png|tiff?|webp)$/i.test(file.name);
}

function isNoBarcodeError(error) {
  return error instanceof Error && error.message === "No DataMatrix code found";
}

function formatCameraError(error) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Camera permission denied";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function updateCameraControls(isRunning) {
  elements.startCameraButton.disabled = isRunning;
  elements.scanFrameButton.disabled = !isRunning;
  elements.stopCameraButton.disabled = !isRunning;
}

function markCustomInput() {
  if (!state.loadingSample) {
    elements.sampleSelect.value = "custom";
  }
}

function decodeCurrentInput() {
  const payloads = getPayloads();
  if (payloads.length === 0) {
    state.decoded = null;
    state.formattedXml = "";
    setStatus("Waiting for XML");
    renderEmpty();
    return;
  }

  try {
    const options = { allowUnknownVersion: elements.allowUnknown.checked };
    state.decoded =
      elements.assemblePages.checked || payloads.length > 1
        ? decodeBmpPages(payloads, options)
        : decodeBmp(payloads[0], options);
    state.formattedXml = formatPayloads(state.decoded.rawXml || payloads.join(PAGE_SEPARATOR));
    setStatus(
      `${state.decoded.medications.length} medication${state.decoded.medications.length === 1 ? "" : "s"}`,
      "ok"
    );
    renderDecoded(state.decoded);
  } catch (error) {
    state.decoded = null;
    state.formattedXml = "";
    renderError(error);
  }
}

function getPayloads() {
  return elements.xmlInput.value
    .split(/\n\s*---+\s*(?:BMP\s*)?PAGE\s*---+\s*\n/i)
    .map((payload) => payload.trim())
    .filter(Boolean);
}

function updatePayloadCount() {
  const chars = elements.xmlInput.value.length;
  const payloads = getPayloads().length;
  elements.payloadCount.textContent = `${chars.toLocaleString()} chars${payloads > 1 ? ` / ${payloads} pages` : ""}`;
}

function activateTab(tabId) {
  state.activeTab = tabId;
  for (const tab of elements.tabs) {
    const isActive = tab.dataset.tab === tabId;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }
  for (const [panelId, panel] of Object.entries(elements.panels)) {
    panel.classList.toggle("is-active", panelId === tabId);
  }
}

function renderEmpty() {
  const empty = '<div class="empty-state">No decoded BMP data.</div>';
  for (const panel of Object.values(elements.panels)) {
    panel.innerHTML = empty;
  }
}

function renderError(error) {
  const code = error instanceof BmpDecodeError ? error.code : "ERROR";
  const details = error instanceof BmpDecodeError ? error.details : null;
  setStatus(code, "error");
  const detailHtml = details ? `<pre>${escapeHtml(JSON.stringify(details, null, 2))}</pre>` : "";
  const html = `
    <div class="error-box">
      <strong>${escapeHtml(code)}</strong>
      <p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>
      ${detailHtml}
    </div>
  `;
  for (const panel of Object.values(elements.panels)) {
    panel.innerHTML = html;
  }
}

function renderDecoded(decoded) {
  renderOverview(decoded);
  renderMedications(decoded);
  renderSections(decoded);
  renderWarnings(decoded);
  renderJson(decoded);
  renderXml();
}

function renderOverview(decoded) {
  elements.panels.overview.innerHTML = `
    <div class="summary-grid">
      ${metric("Version", decoded.version)}
      ${metric("Pages", decoded.page.combined ? `${decoded.page.count} assembled` : String(decoded.page.count))}
      ${metric("Language", decoded.language)}
      ${metric("Sections", decoded.sections.length)}
    </div>
    <div class="info-grid">
      ${infoBlock("Patient", [
        ["Name", compactJoin([decoded.patient.title, decoded.patient.prefix, decoded.patient.firstName, decoded.patient.lastName, decoded.patient.nameSuffix])],
        ["Birth date", decoded.patient.birthDateIso || decoded.patient.birthDate],
        ["Sex", decoded.patient.sexLabel || decoded.patient.sex],
        ["Insurance ID", decoded.patient.insuranceId]
      ])}
      ${infoBlock("Issuer", [
        ["Name", decoded.issuer.name],
        ["Address", compactJoin([decoded.issuer.street, decoded.issuer.postalCode, decoded.issuer.city], ", ")],
        ["Contact", compactJoin([decoded.issuer.phone, decoded.issuer.email], " / ")],
        ["Printed", decoded.issuer.printedAt],
        ["Identifier", decoded.issuer.identifier ? `${decoded.issuer.identifier.type}: ${decoded.issuer.identifier.value}` : null]
      ])}
      ${infoBlock("Parameters", parameterRows(decoded.parameters))}
      ${infoBlock("Plan", [
        ["Instance ID", decoded.instanceId],
        ["Warnings", decoded.warnings.length],
        ["Medications", decoded.medications.length],
        ["Raw XML", `${decoded.rawXml.length.toLocaleString()} chars`]
      ])}
    </div>
  `;
}

function renderMedications(decoded) {
  if (decoded.medications.length === 0) {
    elements.panels.medications.innerHTML = '<div class="empty-state">No medications in this payload.</div>';
    return;
  }

  elements.panels.medications.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Medication</th>
          <th>Section</th>
          <th>Dosage</th>
          <th>Unit</th>
          <th>Use / Reason</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${decoded.medications.map(renderMedicationRow).join("")}
      </tbody>
    </table>
  `;
}

function renderMedicationRow(medication) {
  const ingredients = medication.ingredients
    .map((ingredient) => compactJoin([ingredient.name, ingredient.strength], " "))
    .filter(Boolean);
  const pzn = medication.pzn ? `PZN ${medication.pzn}` : "";
  const displayName = medication.drugName || ingredients[0] || pzn || "Unnamed medication";
  const subtext = compactJoin([displayName === pzn ? null : pzn, ingredients.slice(1).join(", ")]);
  const section = medication.sectionTitle || medication.sectionCode || "Main section";

  return `
    <tr>
      <td>
        <span class="cell-main">
          <strong>${escapeHtml(displayName)}</strong>
          <small>${escapeHtml(subtext)}</small>
        </span>
      </td>
      <td>${escapeHtml(section)}</td>
      <td>${escapeHtml(formatDosage(medication))}</td>
      <td>${escapeHtml(formatUnit(medication.doseUnit))}</td>
      <td>${escapeHtml(compactJoin([medication.instructions, medication.reason], " / "))}</td>
      <td>${escapeHtml(compactJoin([medication.note, formatWeekly(medication.weekly)], " / "))}</td>
    </tr>
  `;
}

function renderSections(decoded) {
  if (decoded.sections.length === 0) {
    elements.panels.sections.innerHTML = '<div class="empty-state">No sections in this payload.</div>';
    return;
  }

  elements.panels.sections.innerHTML = decoded.sections
    .map((section, index) => {
      const title = section.title || section.code || `Section ${index + 1}`;
      const pageTags = section.pageNumbers.length
        ? `<div class="tag-list">${section.pageNumbers.map((page) => `<span class="tag">Page ${escapeHtml(page)}</span>`).join("")}</div>`
        : "";
      return `
        <article class="section-block">
          <h3>${escapeHtml(title)} ${section.code ? `<span class="muted">(${escapeHtml(section.code)})</span>` : ""}</h3>
          <div class="section-items">
            ${pageTags}
            ${
              section.items.length
                ? section.items.map(renderSectionItem).join("")
                : '<div class="empty-state">No items.</div>'
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSectionItem(item) {
  if (item.type === "medication") {
    const name = item.drugName || item.ingredients[0]?.name || (item.pzn ? `PZN ${item.pzn}` : "Medication");
    return `
      <div class="section-item">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(formatDosage(item))}</span>
        <small class="muted">${escapeHtml(compactJoin([item.instructions, item.reason], " / "))}</small>
      </div>
    `;
  }

  if (item.type === "freeText") {
    return `
      <div class="section-item">
        <strong>Free text</strong>
        <span>${escapeHtml(item.text)}</span>
      </div>
    `;
  }

  return `
    <div class="section-item">
      <strong>Recipe</strong>
      <span>${escapeHtml(item.text)}</span>
      <small class="muted">${escapeHtml(item.note)}</small>
    </div>
  `;
}

function renderWarnings(decoded) {
  if (decoded.warnings.length === 0) {
    elements.panels.warnings.innerHTML = '<div class="empty-state">No warnings.</div>';
    return;
  }

  elements.panels.warnings.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Code</th>
          <th>Message</th>
          <th>Path</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        ${decoded.warnings
          .map(
            (warning) => `
              <tr>
                <td><span class="warning-code">${escapeHtml(warning.code)}</span></td>
                <td>${escapeHtml(warning.message)}</td>
                <td>${escapeHtml(compactJoin([warning.pageNumber ? `Page ${warning.pageNumber}` : null, warning.path], " / "))}</td>
                <td>${escapeHtml(formatValue(warning.value))}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderJson(decoded) {
  elements.panels.json.innerHTML = `<pre class="code-box">${escapeHtml(JSON.stringify(withoutRawFields(decoded), null, 2))}</pre>`;
}

function renderXml() {
  elements.panels.xml.innerHTML = `<pre class="code-box">${escapeHtml(state.formattedXml)}</pre>`;
}

function metric(label, value) {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? "-")}</strong>
    </div>
  `;
}

function infoBlock(title, rows) {
  return `
    <section class="info-block">
      <h3>${escapeHtml(title)}</h3>
      <table class="info-table">
        <tbody>
          ${rows
            .map(
              ([label, value]) => `
                <tr>
                  <th>${escapeHtml(label)}</th>
                  <td>${escapeHtml(displayValue(value))}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </section>
  `;
}

function parameterRows(parameters) {
  if (!parameters) {
    return [["Parameters", "-"]];
  }

  return [
    ["Allergies", parameters.allergies],
    ["Pregnant", formatBoolean(parameters.pregnant)],
    ["Breastfeeding", formatBoolean(parameters.breastfeeding)],
    ["Weight", parameters.weightKg ? `${parameters.weightKg} kg` : null],
    ["Height", parameters.heightCm ? `${parameters.heightCm} cm` : null],
    ["Creatinine", parameters.creatinineMgDl ? `${parameters.creatinineMgDl} mg/dl` : null],
    ["Text", parameters.text]
  ];
}

function formatDosage(medication) {
  const dosage = medication.dosage;
  if (!dosage || dosage.type === "none") {
    return "-";
  }
  if (dosage.type === "text") {
    return dosage.text;
  }
  return compactJoin([dosage.schedule, dosage.type === "weekly-structured" ? formatWeekly(medication.weekly) : null], " / ");
}

function formatUnit(unit) {
  if (!unit) {
    return "-";
  }
  return unit.label || unit.text || unit.code || "-";
}

function formatWeekly(weekly) {
  return weekly ? weekly.dayName || `Weekday ${weekly.dayCode}` : null;
}

function formatBoolean(value) {
  if (value === true) {
    return "Yes";
  }
  if (value === false) {
    return "No";
  }
  return null;
}

function formatValue(value) {
  if (value == null) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function displayValue(value) {
  return value == null || String(value).trim() === "" ? "-" : value;
}

function formatPayloads(value) {
  return value
    .split(/\n\s*---+\s*(?:BMP\s*)?PAGE\s*---+\s*\n/i)
    .map((payload) => payload.trim())
    .filter(Boolean)
    .map(formatXml)
    .join(PAGE_SEPARATOR);
}

function formatXml(xml) {
  const tokens = xml
    .replace(/>\s+</g, "><")
    .replace(/></g, ">\n<")
    .split("\n")
    .map((token) => token.trim())
    .filter(Boolean);
  let depth = 0;
  return tokens
    .map((token) => {
      if (/^<\//.test(token)) {
        depth = Math.max(depth - 1, 0);
      }
      const line = `${"  ".repeat(depth)}${token}`;
      if (/^<[^!?/][^>]*[^/]?>$/.test(token)) {
        depth += 1;
      }
      return line;
    })
    .join("\n");
}

function withoutRawFields(value) {
  if (Array.isArray(value)) {
    return value.map(withoutRawFields);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "rawXml" && key !== "rawTree")
        .map(([key, entry]) => [key, withoutRawFields(entry)])
    );
  }
  return value;
}

function compactJoin(values, separator = " ") {
  return values.filter((value) => value != null && String(value).trim() !== "").join(separator);
}

function setStatus(text, kind = "") {
  elements.status.textContent = text;
  elements.status.classList.toggle("is-ok", kind === "ok");
  elements.status.classList.toggle("is-error", kind === "error");
}

function setScannerStatus(text, kind = "") {
  elements.scannerStatus.textContent = text;
  elements.scannerStatus.classList.toggle("is-ok", kind === "ok");
  elements.scannerStatus.classList.toggle("is-error", kind === "error");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

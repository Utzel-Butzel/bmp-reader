import { readFileSync } from "node:fs";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

await prepareZXingModule({
  fireImmediately: true,
  overrides: {
    wasmBinary: readFileSync(new URL("../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", import.meta.url))
  }
});

export { readBarcodes };

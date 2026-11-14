import { App, normalizePath, requestUrl } from "obsidian";
import type { createWorker } from "tesseract.js";
// Bundled as text: Obsidian plugins may not download code, only data.
import workerSource from "tesseract.js/dist/worker.min.js";
import coreSource from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js";

/**
 * Local text recognition, the same Russian + English Tesseract models as the web
 * app. The Russian and English data (~8 MB) is downloaded once from the pinned
 * official tessdata_fast commit and checked against SHA-256; photos stay local.
 */
const DATA_URL = "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd";
const DATA_FILES: Record<string, string> = {
  "eng.traineddata": "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
  "rus.traineddata": "e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225",
};
// A fake host: the worker may only fetch these names, mapped to in-memory blobs.
const LANG_HOST = "https://ocr.jotdrop.invalid";

// The smallest module using a SIMD instruction (the same probe as wasm-feature-detect).
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class LocalOcr {
  private cancelled = false;
  private rejectCancellation: ((error: Error) => void) | undefined;
  constructor(private app: App, private pluginDir: string) {}

  cancel(): void {
    this.cancelled = true;
    this.rejectCancellation?.(new Error("Recognition cancelled"));
  }

  private dataPath(name: string): string {
    return normalizePath(`${this.pluginDir}/ocr-data/${name}`);
  }

  async hasData(): Promise<boolean> {
    for (const name of Object.keys(DATA_FILES)) {
      if (!(await this.app.vault.adapter.exists(this.dataPath(name)))) return false;
    }
    return true;
  }

  async download(): Promise<void> {
    const folder = normalizePath(`${this.pluginDir}/ocr-data`);
    if (!(await this.app.vault.adapter.exists(folder))) await this.app.vault.adapter.mkdir(folder);
    for (const [name, hash] of Object.entries(DATA_FILES)) {
      const response = await requestUrl({ url: `${DATA_URL}/${name}`, throw: false });
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      if ((await sha256(response.arrayBuffer)) !== hash) throw new Error(`${name} does not match its checksum`);
      await this.app.vault.adapter.writeBinary(this.dataPath(name), response.arrayBuffer);
    }
  }

  /** Recognizes Russian and English text. Throws "no-simd" on devices without WebAssembly SIMD. */
  async recognize(image: Blob, onProgress: (progress: number) => void): Promise<string> {
    if (!WebAssembly.validate(SIMD_PROBE)) throw new Error("no-simd");
    const urls: string[] = [];
    const blobUrl = (part: BlobPart, type: string) => {
      const url = URL.createObjectURL(new Blob([part], { type }));
      urls.push(url);
      return url;
    };
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
    try {
      const langs: Record<string, string> = {};
      for (const name of Object.keys(DATA_FILES)) {
        const data = await this.app.vault.adapter.readBinary(this.dataPath(name));
        // A changed or damaged file is treated as missing.
        if ((await sha256(data)) !== DATA_FILES[name]) throw new Error("data-missing");
        langs[`${LANG_HOST}/${name}`] = blobUrl(data, "application/octet-stream");
      }
      // Serve model data from memory and refuse all network requests from the worker.
      const prelude = `const jotdropLangs=${JSON.stringify(langs)};const jotdropFetch=self.fetch.bind(self);` +
        `self.fetch=(url,options)=>jotdropLangs[url]?jotdropFetch(jotdropLangs[url],options):Promise.reject(new Error("JotDrop OCR is offline"));\n`;
      const { createWorker } = await import("tesseract.js");
      if (this.cancelled) throw new Error("Recognition cancelled");
      worker = await createWorker("eng+rus", 1, {
        workerPath: blobUrl(prelude + workerSource, "text/javascript"),
        workerBlobURL: false,
        // The fragment tells Tesseract this is the core file itself, not a folder.
        corePath: `${blobUrl(coreSource, "text/javascript")}#tesseract-core-simd-lstm.wasm.js`,
        langPath: LANG_HOST,
        gzip: false,
        cacheMethod: "none",
        logger: ({ status, progress }) => { if (status === "recognizing text") onProgress(progress); },
      });
      if (this.cancelled) throw new Error("Recognition cancelled");
      const cancellation = new Promise<never>((_, reject) => { this.rejectCancellation = reject; });
      const { data } = await Promise.race([worker.recognize(image), cancellation]);
      return data.text.trim();
    } finally {
      await worker?.terminate();
      this.rejectCancellation = undefined;
      for (const url of urls) URL.revokeObjectURL(url);
    }
  }
}

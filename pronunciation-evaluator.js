
/*
 * PTE Practice — Pronunciation Evaluator
 * Browser-based Hama model integration.
 *
 * Required files:
 * speaking.html
 * pronunciation-evaluator.js
 * pronunciation-assets/
 *   hama-browser.js
 *   hama.wasm
 *   asr_waveform.hama
 *   encoder.hama
 *   decoder_step.hama
 *   g2p_vocab.json
 *
 * Usage:
 * await PTEPronunciation.evaluate(audioBlob, referenceText)
 * await PTEPronunciation.verifyAssets()
 */

(function () {
  "use strict";

  const ASSET_FILES = [
    "hama-browser.js",
    "hama.wasm",
    "asr_waveform.hama",
    "encoder.hama",
    "decoder_step.hama",
    "g2p_vocab.json"
  ];

  let modelPromise = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function assetBase() {
    return new URL(
      "./pronunciation-assets/",
      document.baseURI
    );
  }

  function assetUrl(filename) {
    return new URL(filename, assetBase()).href;
  }

  function describeError(error) {
    return error instanceof Error
      ? error.message
      : String(error);
  }

  function isWasm(bytes) {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x00 &&
      bytes[1] === 0x61 &&
      bytes[2] === 0x73 &&
      bytes[3] === 0x6d &&
      bytes[4] === 0x01 &&
      bytes[5] === 0x00 &&
      bytes[6] === 0x00 &&
      bytes[7] === 0x00
    );
  }

  async function inspectAsset(filename) {
    const url = assetUrl(filename);

    let response;

    try {
      response = await fetch(url, {
        cache: "no-store"
      });
    } catch (error) {
      throw new Error(
        "Unable to fetch " + filename +
        " at " + url +
        ": " + describeError(error)
      );
    }

    if (!response.ok) {
      throw new Error(
        filename +
        " returned HTTP " +
        response.status +
        ". URL: " +
        url
      );
    }

    const contentType =
      response.headers.get("content-type") || "";

    // Verify that the WASM file is binary,
    // not an HTML error page.
    if (filename === "hama.wasm") {
      const bytes = new Uint8Array(
        await response.arrayBuffer()
      );

      if (!isWasm(bytes)) {
        const header = Array.from(
          bytes.slice(0, 8)
        )
          .map(value =>
            value.toString(16).padStart(2, "0")
          )
          .join(" ");

        throw new Error(
          "Invalid hama.wasm file. " +
          "Expected WebAssembly header, got: " +
          header +
          ". URL: " +
          url
        );
      }

      return {
        file: filename,
        url,
        ok: true,
        bytes: bytes.length,
        contentType,
        validWasm: true
      };
    }

    // Detect HTML fallback pages served as model files.
    if (
      filename.endsWith(".hama") ||
      filename.endsWith(".js") ||
      filename.endsWith(".json")
    ) {
      if (
        contentType.toLowerCase().includes("text/html")
      ) {
        throw new Error(
          filename +
          " returned HTML instead of the required file. " +
          "URL: " +
          url
        );
      }
    }

    return {
      file: filename,
      url,
      ok: true,
      contentType
    };
  }

  async function verifyAssets() {
    const results = [];

    for (const filename of ASSET_FILES) {
      const result = await inspectAsset(filename);
      results.push(result);
    }

    console.table(results);

    return results;
  }

  async function loadModels() {
    if (modelPromise) {
      return modelPromise;
    }

    modelPromise = (async function () {
      await verifyAssets();

      const moduleUrl = assetUrl(
        "hama-browser.js"
      );

      let library;

      try {
        library = await import(moduleUrl);
      } catch (error) {
        throw new Error(
          "Failed to import Hama JavaScript module: " +
          describeError(error) +
          ". URL: " +
          moduleUrl
        );
      }

      const ASRBrowserModel =
        library.ASRBrowserModel;

      const G2PBrowserModel =
        library.G2PBrowserModel;

      if (
        !ASRBrowserModel ||
        !G2PBrowserModel
      ) {
        throw new Error(
          "The Hama module does not export " +
          "ASRBrowserModel and G2PBrowserModel. " +
          "Rebuild hama-browser.js using the " +
          "Pronunciation-Model-Build folder."
        );
      }

      let asr;
      let g2p;

      try {
        asr = await ASRBrowserModel.create({
          modelUrl: assetUrl(
            "asr_waveform.hama"
          )
        });

        g2p = await G2PBrowserModel.create({
          encoderUrl: assetUrl(
            "encoder.hama"
          ),
          decoderStepUrl: assetUrl(
            "decoder_step.hama"
          )
        });
      } catch (error) {
        throw new Error(
          "Hama model initialization failed: " +
          describeError(error) +
          ". The WASM asset passed validation at " +
          assetUrl("hama.wasm") +
          ", but the library may be requesting " +
          "a different internal WASM URL. " +
          "Open Chrome DevTools > Network, " +
          "filter for wasm, and inspect the " +
          "failed Request URL."
        );
      }

      return { asr, g2p };
    })();

    try {
      return await modelPromise;
    } catch (error) {
      // Allow another attempt after a failed load.
      modelPromise = null;
      throw error;
    }
  }

  async function decodeAudio(blob) {
    if (!(blob instanceof Blob)) {
      throw new Error(
        "Audio recording is unavailable."
      );
    }

    if (blob.size === 0) {
      throw new Error(
        "Audio recording is empty."
      );
    }

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error(
        "Web Audio API is unsupported."
      );
    }

    const context = new AudioContextClass();

    try {
      const buffer = await context.decodeAudioData(
        await blob.arrayBuffer()
      );

      const channels = buffer.numberOfChannels;
      const pcm = new Float32Array(
        buffer.length
      );

      for (let channel = 0; channel < channels; channel++) {
        const data = buffer.getChannelData(
          channel
        );

        for (let i = 0; i < data.length; i++) {
          pcm[i] += data[i] / channels;
        }
      }

      return {
        pcm,
        sampleRate: buffer.sampleRate,
        duration: buffer.duration
      };
    } finally {
      await context.close();
    }
  }

  function normalizePhonemes(value) {
    if (Array.isArray(value)) {
      return value.map(String).filter(Boolean);
    }

    if (typeof value !== "string") {
      return [];
    }

    return value
      .normalize("NFKC")
      .replace(/[ˈˌː]/g, "")
      .trim()
      .split(/[\s|/]+/u)
      .filter(Boolean);
  }

  function editDistance(a, b) {
    const previous = Array.from(
      { length: b.length + 1 },
      (_, index) => index
    );

    for (let i = 1; i <= a.length; i++) {
      const current = [i];

      for (let j = 1; j <= b.length; j++) {
        const substitution =
          a[i - 1] === b[j - 1]
            ? 0
            : 1;

        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + substitution
        );
      }

      for (let j = 0; j < current.length; j++) {
        previous[j] = current[j];
      }
    }

    return previous[b.length];
  }

  async function evaluate(audioBlob, referenceText) {
    if (!audioBlob) {
      return {
        score: null,
        reason: "No recorded audio available."
      };
    }

    if (
      typeof referenceText !== "string" ||
      !referenceText.trim()
    ) {
      return {
        score: null,
        reason: "Reference text is missing."
      };
    }

    const { asr, g2p } = await loadModels();

    const audio = await decodeAudio(
      audioBlob
    );

    let heard;
    let expected;

    try {
      [heard, expected] = await Promise.all([
        asr.transcribeWaveform(
          audio.pcm,
          audio.sampleRate
        ),
        g2p.predict(referenceText.trim())
      ]);
    } catch (error) {
      throw new Error(
        "Hama inference failed: " +
        describeError(error)
      );
    }

    console.debug(
      "Hama ASR result:",
      heard
    );

    console.debug(
      "Hama G2P result:",
      expected
    );

    const heardPhones = normalizePhonemes(
      heard?.phonemeText ??
      heard?.phonemes
    );

    const expectedPhones = normalizePhonemes(
      expected?.ipa ??
      expected?.phonemes
    );

    if (
      heardPhones.length < 3 ||
      expectedPhones.length < 3
    ) {
      return {
        score: null,
        reason:
          "The model did not return enough " +
          "phoneme data for reliable scoring. " +
          "Check the Hama ASR and G2P outputs " +
          "in Chrome Console."
      };
    }

    const errors = editDistance(
      expectedPhones,
      heardPhones
    );

    const phonemeErrorRate =
      errors / expectedPhones.length;

    const score = Math.round(
      clamp(
        90 * (1 - phonemeErrorRate),
        10,
        90
      )
    );

    return {
      score,
      method:
        "experimental-hama-phoneme-comparison",
      phonemeErrorRate:
        Math.round(phonemeErrorRate * 100),
      expectedCount: expectedPhones.length,
      heardCount: heardPhones.length,
      duration: audio.duration,
      note:
        "Experimental pronunciation estimate, " +
        "not an official Pearson PTE score."
    };
  }

  window.PTEPronunciation = {
    evaluate,
    verifyAssets,
    loadModels,
    assetUrl
  };

  console.info(
    "PTE Pronunciation Evaluator loaded."
  );
})();

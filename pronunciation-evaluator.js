
/*
 * PTE Practice — Hama Pronunciation Evaluator
 * Experimental practice feedback, not Pearson-calibrated.
 * Keep pronunciation-assets/ beside speaking.html.
 */
(function () {
  "use strict";

  const ASSETS = [
    "hama-browser.js",
    "hama.wasm",
    "asr_waveform.hama",
    "encoder.hama",
    "decoder_step.hama",
    "g2p_vocab.json"
  ];

  const base = new URL(
    "./pronunciation-assets/",
    document.baseURI
  );

  let modelsPromise = null;

  function assetURL(name) {
    return new URL(name, base).href;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  async function verifyAssets() {
    for (const name of ASSETS) {
      const url = assetURL(name);
      let response;

      try {
        response = await fetch(url, {
          cache: "no-store"
        });
      } catch (error) {
        throw new Error(
          "Cannot fetch " + url + ": " + error.message
        );
      }

      if (!response.ok) {
        throw new Error(
          name + " returned HTTP " +
          response.status + " at " + url
        );
      }

      if (name === "hama.wasm") {
        const bytes = new Uint8Array(
          await response.arrayBuffer()
        );

        const valid =
          bytes.length >= 8 &&
          bytes[0] === 0 &&
          bytes[1] === 97 &&
          bytes[2] === 115 &&
          bytes[3] === 109;

        if (!valid) {
          throw new Error(
            "Invalid WASM response at " + url +
            ". Expected WebAssembly binary."
          );
        }
      }

      if (name === "hama-browser.js") {
        const type =
          response.headers.get("content-type") || "";

        if (type.includes("text/html")) {
          throw new Error(
            "hama-browser.js returned HTML at " + url
          );
        }
      }
    }

    return {
      ok: true,
      base: base.href
    };
  }

  async function models() {
    if (!modelsPromise) {
      modelsPromise = (async () => {
        await verifyAssets();

        let library;

        try {
          library = await import(
            assetURL("hama-browser.js")
          );
        } catch (error) {
          throw new Error(
            "Unable to import Hama: " + error.message
          );
        }

        if (
          !library.ASRBrowserModel ||
          !library.G2PBrowserModel
        ) {
          throw new Error(
            "Hama browser bundle is missing " +
            "ASRBrowserModel or G2PBrowserModel."
          );
        }

        try {
          const asr =
            await library.ASRBrowserModel.create({
              modelUrl: assetURL(
                "asr_waveform.hama"
              )
            });

          const g2p =
            await library.G2PBrowserModel.create({
              encoderUrl: assetURL(
                "encoder.hama"
              ),
              decoderStepUrl: assetURL(
                "decoder_step.hama"
              )
            });

          return { asr, g2p };
        } catch (error) {
          throw new Error(
            "Hama model initialization failed: " +
            error.message
          );
        }
      })().catch(error => {
        modelsPromise = null;
        throw error;
      });
    }

    return modelsPromise;
  }

  function tokenizePhones(value) {
    // Hama returns individual phoneme tokens.
    const raw = Array.isArray(value)
      ? value
      : String(value || "").split(/\s+/u);

    return raw
      .map(value =>
        String(value || "")
          .normalize("NFC")
          .trim()
      )
      .filter(value =>
        value &&
        ![
          "<pad>",
          "<blank>",
          "<wb>",
          "|"
        ].includes(value)
      );
  }

  function expectedPhonemes(result) {
    // Use actual G2P phoneme alignments,
    // rather than splitting IPA text into words.
    if (
      Array.isArray(result?.alignments) &&
      result.alignments.length
    ) {
      return tokenizePhones(
        result.alignments.map(
          item => item.phoneme
        )
      );
    }

    return [];
  }

  function editDistance(a, b) {
    const previous = Array.from(
      { length: b.length + 1 },
      (_, index) => index
    );

    for (let i = 1; i <= a.length; i++) {
      let diagonal = previous[0];
      previous[0] = i;

      for (let j = 1; j <= b.length; j++) {
        const old = previous[j];

        previous[j] = Math.min(
          previous[j] + 1,
          previous[j - 1] + 1,
          diagonal +
            (a[i - 1] === b[j - 1] ? 0 : 1)
        );

        diagonal = old;
      }
    }

    return previous[b.length];
  }

  async function evaluate(blob, reference) {
    if (!blob || !String(reference || "").trim()) {
      return {
        score: null,
        reason: "Audio or reference text unavailable"
      };
    }

    const { asr, g2p } = await models();

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error(
        "Web Audio API is unavailable."
      );
    }

    const context = new AudioContextClass();
    let decoded;

    try {
      decoded = await context.decodeAudioData(
        await blob.arrayBuffer()
      );
    } finally {
      await context.close();
    }

    const pcm = new Float32Array(
      decoded.length
    );

    for (
      let channel = 0;
      channel < decoded.numberOfChannels;
      channel++
    ) {
      const samples =
        decoded.getChannelData(channel);

      for (let i = 0; i < pcm.length; i++) {
        pcm[i] +=
          samples[i] / decoded.numberOfChannels;
      }
    }

    let heard;
    let expected;

    try {
      [heard, expected] = await Promise.all([
        asr.transcribeWaveform(
          pcm,
          decoded.sampleRate
        ),
        g2p.predict(String(reference))
      ]);
    } catch (error) {
      throw new Error(
        "Hama inference failed: " + error.message
      );
    }

    const heardPhones = tokenizePhones(
      heard &&
      (heard.phonemes || heard.phonemeText)
    );

    const expectedPhones =
      expectedPhonemes(expected);

    if (
      heardPhones.length < 3 ||
      expectedPhones.length < 3
    ) {
      return {
        score: null,
        reason:
          "Insufficient phoneme tokens from " +
          "Hama ASR or G2P alignments.",
        heardCount: heardPhones.length,
        expectedCount: expectedPhones.length
      };
    }

    const errors = editDistance(
      expectedPhones,
      heardPhones
    );

    const rate =
      errors / expectedPhones.length;

    const similarity = clamp(
      (1 - rate) * 100,
      0,
      100
    );

    return {
      score: Math.round(
        similarity * 0.9
      ),
      similarity: Math.round(similarity),
      method:
        "experimental-hama-phoneme-similarity",
      phonemeErrorRate: Math.round(
        rate * 100
      ),
      editErrors: errors,
      expectedCount: expectedPhones.length,
      heardCount: heardPhones.length
    };
  }

  window.PTEPronunciation = {
    evaluate,
    verifyAssets,
    assetURL,
    loadModels: models
  };
})();

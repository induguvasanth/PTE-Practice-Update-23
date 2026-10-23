/* PTE Update 11: selected text Telugu translation and browser speech.
   Uses MyMemory's public translation API. Selected text is sent to that service.
   Audio uses the browser's installed speech-synthesis voices. */
(() => {
  'use strict';
  if (window.PTESelectionHelperInstalled) return;
  window.PTESelectionHelperInstalled = true;

  const MAX_CHARS = 500;
  let popup, meaning, speechButton, translationButton, currentText = '', requestId = 0;
  let controller = null;
  const css = `
  #pte-selection-popup { position:fixed; z-index:2147483646; width:min(340px,calc(100vw - 24px));
    background:#fff; color:#17243a; border:1px solid #d9e2ed; border-radius:14px;
    box-shadow:0 12px 36px rgba(0,0,0,.23); padding:12px; font:14px/1.5 system-ui,Arial,sans-serif;
    text-align:left; }
  #pte-selection-popup[hidden] { display:none!important; }
  #pte-selection-popup .pte-select-head {display:flex;align-items:center;justify-content:space-between;gap:8px}
  #pte-selection-popup .pte-select-heading {font-weight:700;font-size:14px}
  #pte-selection-popup button {cursor:pointer;border:1px solid #d4dce6;background:#f5f8fc;
    color:#17243a;border-radius:8px;padding:6px 10px;font:inherit}
  #pte-selection-popup button:hover {background:#e9f0f9}
  #pte-selection-popup .pte-select-text {font-size:12px;color:#4a5568;max-height:54px;
    overflow:auto;overflow-wrap:anywhere;margin:8px 0}
  #pte-selection-popup .pte-select-meaning {font-family:system-ui,'Noto Sans Telugu',sans-serif;
    font-size:16px;min-height:28px;max-height:130px;overflow:auto;overflow-wrap:anywhere;margin:8px 0}
  #pte-selection-popup .pte-select-actions {display:flex;gap:8px;flex-wrap:wrap}
  #pte-selection-popup .pte-select-note {font-size:11px;color:#667085;margin-top:7px}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  popup = document.createElement('div');
  popup.id = 'pte-selection-popup';
  popup.hidden = true;
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-label', 'Selected text translation and speech');
  popup.innerHTML = `
    <div class="pte-select-head"><span class="pte-select-heading">తెలుగు అర్థం · Telugu Meaning</span>
      <button type="button" data-action="close" aria-label="Close popup">✕</button></div>
    <div class="pte-select-text" data-role="selected"></div>
    <div class="pte-select-meaning" data-role="meaning" aria-live="polite"></div>
    <div class="pte-select-actions">
      <button type="button" data-action="speak">🔊 Listen</button>
      <button type="button" data-action="stop">■ Stop</button>
      <button type="button" data-action="retry">↻ Translate</button>
    </div>
    <div class="pte-select-note">Uses online translation; audio voice depends on your device.</div>`;
  document.body.appendChild(popup);
  meaning = popup.querySelector('[data-role="meaning"]');
  speechButton = popup.querySelector('[data-action="speak"]');
  translationButton = popup.querySelector('[data-action="retry"]');

  function stopSpeech() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
  function closePopup() {
    popup.hidden = true;
    currentText = '';
    requestId++;
    if (controller) { controller.abort(); controller = null; }
    stopSpeech();
  }
  function placePopup(rect) {
    const w = Math.min(340, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, rect.left));
    const estimatedHeight = 220;
    const top = rect.bottom + estimatedHeight + 10 <= window.innerHeight
      ? rect.bottom + 8 : Math.max(8, rect.top - estimatedHeight - 8);
    popup.style.left = left + 'px';
    popup.style.top = Math.max(8, Math.min(window.innerHeight - 40, top)) + 'px';
  }
  function readSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const raw = selection.toString().replace(/\s+/g, ' ').trim();
    if (!raw || raw.length > MAX_CHARS) return null;
    const ancestor = selection.anchorNode && (selection.anchorNode.nodeType === 1
      ? selection.anchorNode : selection.anchorNode.parentElement);
    if (!ancestor || ancestor.closest('#pte-selection-popup, input, textarea, [contenteditable="true"], [contenteditable=""]')) return null;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;
    return {text:raw, rect};
  }
  async function translate(text) {
    const id = ++requestId;
    if (controller) controller.abort();
    controller = new AbortController();
    meaning.textContent = 'తెలుగు అనువాదం లోడ్ అవుతోంది…';
    translationButton.disabled = true;
    try {
      const url = 'https://api.mymemory.translated.net/get?langpair=en%7Cte&q=' + encodeURIComponent(text);
      const response = await fetch(url, {signal:controller.signal});
      if (!response.ok) throw new Error('Translation service unavailable');
      const data = await response.json();
      if (id !== requestId || popup.hidden) return;
      const translated = data && data.responseData && data.responseData.translatedText;
      const status = Number(data && data.responseStatus);
      if (!translated || (status && status !== 200)) throw new Error('No translation available');
      // textContent avoids executing untrusted translation output as HTML.
      meaning.textContent = translated;
    } catch (error) {
      if (id !== requestId || popup.hidden) return;
      if (error.name !== 'AbortError') meaning.textContent = 'Translation unavailable. Please check your internet connection and try again.';
    } finally {
      if (id === requestId) translationButton.disabled = false;
    }
  }
  function openSelection() {
    const selected = readSelection();
    if (!selected) return;
    if (selected.text === currentText && !popup.hidden) return;
    currentText = selected.text;
    popup.querySelector('[data-role="selected"]').textContent = currentText;
    popup.hidden = false;
    placePopup(selected.rect);
    translate(currentText);
  }
  function speak() {
    if (!currentText || !('speechSynthesis' in window)) {
      meaning.textContent = 'Speech is not supported in this browser.';
      return;
    }
    stopSpeech();
    const utterance = new SpeechSynthesisUtterance(currentText);
    utterance.lang = 'en-IN';
    utterance.rate = 0.88;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const english = voices.filter(v => /^en[-_]/i.test(v.lang));
    const preferred = english.find(v => /natural|neural|premium|google/i.test(v.name) && /en[-_]IN/i.test(v.lang))
      || english.find(v => /natural|neural|premium/i.test(v.name))
      || english.find(v => /en[-_]IN/i.test(v.lang))
      || english[0];
    if (preferred) { utterance.voice = preferred; utterance.lang = preferred.lang; }
    window.speechSynthesis.speak(utterance);
  }
  popup.addEventListener('pointerdown', e => e.stopPropagation());
  popup.addEventListener('click', e => {
    const action = e.target.closest('button')?.dataset.action;
    if (action === 'close') closePopup();
    if (action === 'speak') speak();
    if (action === 'stop') stopSpeech();
    if (action === 'retry' && currentText) translate(currentText);
  });
  // Opening after pointerup lets native selection finish.
  document.addEventListener('pointerup', e => {
    if (popup.contains(e.target)) return;
    const selected = readSelection();
    if (selected) openSelection();
    else if (!popup.hidden) closePopup();
  });
  document.addEventListener('keyup', e => {
    if (e.key === 'Escape') { closePopup(); return; }
    if (e.key === 'Shift' || e.key.startsWith('Arrow') || e.key === 'End' || e.key === 'Home') {
      if (readSelection()) openSelection();
    }
  });
  document.addEventListener('pointerdown', e => {
    if (!popup.hidden && !popup.contains(e.target)) closePopup();
  }, true);
  window.addEventListener('scroll', () => { if (!popup.hidden) closePopup(); }, {passive:true});
  window.addEventListener('resize', () => { if (!popup.hidden) closePopup(); });
})();

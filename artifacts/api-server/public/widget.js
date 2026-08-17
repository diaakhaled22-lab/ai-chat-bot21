(function () {
  "use strict";

  var currentScript = document.currentScript;
  var widgetKey = currentScript ? currentScript.getAttribute("data-key") : null;

  if (!widgetKey) {
    console.warn("[ChatWidget] No data-key attribute found on script tag.");
    return;
  }

  var scriptSrc = currentScript ? currentScript.src : "";
  var apiBase = scriptSrc.replace(/\/widget\.js.*$/, "");

  var SESSION_KEY = "chatwidget_session_" + widgetKey;
  var sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = "ws_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  var messages = [];
  var isOpen = false;
  var isLoading = false;
  var companyName = "Chat Support";

  var SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  var speechSynth = window.speechSynthesis;
  var recognizer = null;
  var isRecording = false;
  var VOICE_LANG_KEY = "chatwidget_voice_lang_" + widgetKey;
  var voiceLang = localStorage.getItem(VOICE_LANG_KEY) || "en"; // "en" or "ar"
  var SPEAK_KEY = "chatwidget_autospeak_" + widgetKey;
  var autoSpeak = localStorage.getItem(SPEAK_KEY) === "1";
  var FAB_POSITION_KEY = "chatwidget_fab_position_" + widgetKey;
  var DEFAULT_FAB_POSITION = { x: 96, y: 92 };
  var fabPositionX = DEFAULT_FAB_POSITION.x;
  var fabPositionY = DEFAULT_FAB_POSITION.y;
  var hasStoredFabPosition = false;
  var isDraggingFab = false;
  var fabWasMoved = false;
  var fabPointerStartX = 0;
  var fabPointerStartY = 0;

  try {
    var storedFabPosition = JSON.parse(localStorage.getItem(FAB_POSITION_KEY) || "null");
    if (
      storedFabPosition &&
      Number.isFinite(storedFabPosition.x) &&
      Number.isFinite(storedFabPosition.y)
    ) {
      fabPositionX = Math.min(96, Math.max(4, storedFabPosition.x));
      fabPositionY = Math.min(96, Math.max(4, storedFabPosition.y));
      hasStoredFabPosition = true;
    }
  } catch (e) {}

  function isArabicText(text) {
    return /[\u0600-\u06FF]/.test(text);
  }

  function speak(text) {
    if (!speechSynth || !text) return;
    try {
      speechSynth.cancel();
      var utter = new SpeechSynthesisUtterance(text);
      var arabic = isArabicText(text);
      utter.lang = arabic ? "ar-SA" : "en-US";
      var voices = speechSynth.getVoices();
      var match = voices.find(function (v) { return v.lang && v.lang.toLowerCase().indexOf(arabic ? "ar" : "en") === 0; });
      if (match) utter.voice = match;
      speechSynth.speak(utter);
    } catch (e) {}
  }

  function createStyles() {
    var style = document.createElement("style");
    style.textContent = [
      "#cw-container{position:fixed;left:96%;top:92%;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;transform:translate(-50%,-50%);width:56px;height:56px}",
      "#cw-btn{width:56px;height:56px;border-radius:50%;background:#7c3aed;border:none;cursor:grab;touch-action:none;box-shadow:0 4px 20px rgba(124,58,237,.45);display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s;outline:none}",
      "#cw-btn.cw-dragging{cursor:grabbing;box-shadow:0 8px 28px rgba(124,58,237,.6)}",
      "#cw-btn:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(124,58,237,.6)}",
      "#cw-btn svg{width:26px;height:26px;fill:white}",
      "#cw-badge{position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid white;display:none}",
      "#cw-panel{position:absolute;bottom:68px;right:0;width:min(360px,calc(100vw - 32px));max-height:520px;background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.18);display:none;flex-direction:column;overflow:hidden;border:1px solid rgba(0,0,0,.08)}",
      "#cw-container.cw-panel-left #cw-panel{left:0;right:auto}",
      "#cw-container.cw-panel-center #cw-panel{left:50%;right:auto;transform:translateX(-50%)}",
      "#cw-container.cw-panel-right #cw-panel{left:auto;right:0}",
      "#cw-container.cw-panel-top #cw-panel{top:68px;bottom:auto}",
      "#cw-panel.open{display:flex}",
      "#cw-header{background:#7c3aed;padding:16px 18px;color:white;display:flex;align-items:center;justify-content:space-between}",
      "#cw-header-info{display:flex;align-items:center;gap:10px}",
      "#cw-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:18px}",
      "#cw-title{font-weight:600;font-size:14px}",
      "#cw-subtitle{font-size:11px;opacity:.85;margin-top:1px}",
      "#cw-close{background:rgba(255,255,255,.15);border:none;cursor:pointer;color:white;border-radius:8px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;transition:background .15s}",
      "#cw-close:hover{background:rgba(255,255,255,.28)}",
      "#cw-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f8f9fb;min-height:200px}",
      "#cw-messages::-webkit-scrollbar{width:4px}#cw-messages::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:2px}",
      ".cw-msg{max-width:80%;padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.45;word-break:break-word;animation:cwfadein .2s ease}",
      ".cw-msg.bot{background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px;color:#1f2937;align-self:flex-start}",
      ".cw-msg.user{background:#7c3aed;color:white;border-bottom-right-radius:4px;align-self:flex-end}",
      ".cw-typing{display:flex;align-items:center;gap:4px;padding:10px 14px}",
      ".cw-dot{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:cwbounce 1.2s infinite}",
      ".cw-dot:nth-child(2){animation-delay:.2s}.cw-dot:nth-child(3){animation-delay:.4s}",
      "#cw-footer{padding:10px 12px;background:#fff;border-top:1px solid #f0f0f0;display:flex;align-items:center;gap:8px}",
      "#cw-input{flex:1;border:1.5px solid #e5e7eb;border-radius:10px;padding:9px 12px;font-size:13.5px;outline:none;resize:none;font-family:inherit;line-height:1.4;max-height:80px;overflow-y:auto;transition:border-color .15s}",
      "#cw-input:focus{border-color:#7c3aed}",
      "#cw-send{width:36px;height:36px;border-radius:9px;background:#7c3aed;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity .15s;flex-shrink:0}",
      "#cw-send:disabled{opacity:.4;cursor:not-allowed}",
      "#cw-send svg{width:17px;height:17px;fill:white}",
      "#cw-mic{width:36px;height:36px;border-radius:9px;background:#f3f4f6;border:1.5px solid #e5e7eb;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,border-color .15s;flex-shrink:0}",
      "#cw-mic:hover{border-color:#7c3aed}",
      "#cw-mic.recording{background:#ef4444;border-color:#ef4444;animation:cwpulse 1s infinite}",
      "#cw-mic svg{width:16px;height:16px;fill:#4b5563}",
      "#cw-mic.recording svg{fill:white}",
      "#cw-mic.unsupported{display:none}",
      "@keyframes cwpulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}",
      "#cw-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:6px 12px 0;background:#fff}",
      "#cw-lang-toggle{display:flex;border:1px solid #e5e7eb;border-radius:7px;overflow:hidden;font-size:10.5px}",
      "#cw-lang-toggle button{border:none;background:#fff;color:#6b7280;padding:3px 8px;cursor:pointer;font-family:inherit}",
      "#cw-lang-toggle button.active{background:#7c3aed;color:#fff}",
      "#cw-speak-toggle{border:1px solid #e5e7eb;border-radius:7px;background:#fff;cursor:pointer;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#6b7280}",
      "#cw-speak-toggle.active{background:#f5f3ff;border-color:#7c3aed;color:#7c3aed}",
      ".cw-msg-row{display:flex;align-items:flex-end;gap:6px;max-width:80%}",
      ".cw-msg-row.user{align-self:flex-end;flex-direction:row-reverse}",
      ".cw-msg-row.bot{align-self:flex-start}",
      ".cw-speak-btn{flex-shrink:0;width:22px;height:22px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;color:#6b7280;opacity:.7}",
      ".cw-speak-btn:hover{opacity:1}",
      "#cw-powered{text-align:center;padding:5px 0 8px;font-size:10px;color:#9ca3af}",
      "@keyframes cwfadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
      "@keyframes cwbounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}",
    ].join("");
    document.head.appendChild(style);
  }

  function applyFabPosition() {
    var container = document.getElementById("cw-container");
    if (!container) return;

    container.style.left = fabPositionX + "%";
    container.style.top = fabPositionY + "%";
    container.classList.remove(
      "cw-panel-left",
      "cw-panel-center",
      "cw-panel-right",
      "cw-panel-top",
    );
    container.classList.add(
      fabPositionX < 34
        ? "cw-panel-left"
        : fabPositionX > 66
          ? "cw-panel-right"
          : "cw-panel-center",
    );
    container.classList.add(fabPositionY < 50 ? "cw-panel-top" : "cw-panel-bottom");
  }

  function saveFabPosition() {
    try {
      localStorage.setItem(
        FAB_POSITION_KEY,
        JSON.stringify({ x: fabPositionX, y: fabPositionY }),
      );
    } catch (e) {}
  }

  function updateFabPosition(clientX, clientY) {
    var viewportWidth = Math.max(window.innerWidth, 1);
    var viewportHeight = Math.max(window.innerHeight, 1);
    fabPositionX = Math.min(96, Math.max(4, Math.round((clientX / viewportWidth) * 100)));
    fabPositionY = Math.min(96, Math.max(4, Math.round((clientY / viewportHeight) * 100)));
    applyFabPosition();
  }

  function startFabDrag(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    var btn = event.currentTarget;
    event.preventDefault();
    fabPointerStartX = event.clientX;
    fabPointerStartY = event.clientY;
    fabWasMoved = false;
    isDraggingFab = true;
    btn.classList.add("cw-dragging");
    try {
      btn.setPointerCapture(event.pointerId);
    } catch (e) {}
  }

  function moveFabDrag(event) {
    if (!isDraggingFab) return;
    if (
      Math.abs(event.clientX - fabPointerStartX) > 4 ||
      Math.abs(event.clientY - fabPointerStartY) > 4
    ) {
      fabWasMoved = true;
    }
    if (fabWasMoved) {
      event.preventDefault();
      updateFabPosition(event.clientX, event.clientY);
    }
  }

  function finishFabDrag(event) {
    if (!isDraggingFab) return;
    var btn = event.currentTarget;
    isDraggingFab = false;
    btn.classList.remove("cw-dragging");
    try {
      if (btn.hasPointerCapture(event.pointerId)) btn.releasePointerCapture(event.pointerId);
    } catch (e) {}
    if (fabWasMoved) saveFabPosition();
  }

  function createHTML() {
    var container = document.createElement("div");
    container.id = "cw-container";
    container.innerHTML = [
      '<div id="cw-panel">',
        '<div id="cw-header">',
          '<div id="cw-header-info">',
            '<div id="cw-avatar">🤖</div>',
            '<div><div id="cw-title">' + escHtml(companyName) + '</div><div id="cw-subtitle">Online · Typically replies instantly</div></div>',
          '</div>',
          '<button id="cw-close" aria-label="Close chat">×</button>',
        '</div>',
        '<div id="cw-toolbar">',
          '<button id="cw-speak-toggle" aria-label="Toggle voice replies" title="Read replies aloud">🔊</button>',
          '<div id="cw-lang-toggle" role="group" aria-label="Voice language">',
            '<button id="cw-lang-en" type="button">EN</button>',
            '<button id="cw-lang-ar" type="button">AR</button>',
          '</div>',
        '</div>',
        '<div id="cw-messages"></div>',
        '<div id="cw-footer">',
          '<button id="cw-mic" aria-label="Record voice message" title="Speak your message">',
            '<svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>',
          '</button>',
          '<textarea id="cw-input" rows="1" placeholder="Type a message..." aria-label="Chat message"></textarea>',
          '<button id="cw-send" aria-label="Send">',
            '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
          '</button>',
        '</div>',
        '<div id="cw-powered">Powered by ChatBot Platform</div>',
      '</div>',
      '<button id="cw-btn" aria-label="Open chat. Drag to move the chat button." title="Drag to move chat button">',
        '<div id="cw-badge"></div>',
        '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>',
      '</button>',
    ].join("");
    document.body.appendChild(container);
  }

  function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function scrollBottom() {
    var el = document.getElementById("cw-messages");
    if (el) el.scrollTop = el.scrollHeight;
  }

  function addMessage(role, text) {
    messages.push({ role: role, text: text });
    renderMessages();
  }

  function showTyping() {
    var el = document.getElementById("cw-messages");
    var existing = document.getElementById("cw-typing-indicator");
    if (existing || !el) return;
    var div = document.createElement("div");
    div.id = "cw-typing-indicator";
    div.className = "cw-msg bot cw-typing";
    div.innerHTML = '<span class="cw-dot"></span><span class="cw-dot"></span><span class="cw-dot"></span>';
    el.appendChild(div);
    scrollBottom();
  }

  function hideTyping() {
    var el = document.getElementById("cw-typing-indicator");
    if (el) el.remove();
  }

  function renderMessages() {
    var el = document.getElementById("cw-messages");
    if (!el) return;
    el.innerHTML = "";
    messages.forEach(function (m) {
      var row = document.createElement("div");
      row.className = "cw-msg-row " + m.role;

      var bubble = document.createElement("div");
      bubble.className = "cw-msg " + m.role;
      bubble.textContent = m.text;
      if (isArabicText(m.text)) bubble.setAttribute("dir", "rtl");
      row.appendChild(bubble);

      if (m.role === "bot" && speechSynth) {
        var speakBtn = document.createElement("button");
        speakBtn.className = "cw-speak-btn";
        speakBtn.setAttribute("aria-label", "Play voice reply");
        speakBtn.textContent = "🔊";
        speakBtn.addEventListener("click", function () { speak(m.text); });
        row.appendChild(speakBtn);
      }

      el.appendChild(row);
    });
    scrollBottom();
  }

  function renderOpenState() {
    var panel = document.getElementById("cw-panel");
    var badge = document.getElementById("cw-badge");
    if (!panel) return;
    if (isOpen) {
      panel.classList.add("open");
      badge.style.display = "none";
      if (messages.length === 0) {
        addMessage("bot", "👋 Hi! How can I help you today?");
      }
      setTimeout(function () {
        var inp = document.getElementById("cw-input");
        if (inp) inp.focus();
      }, 100);
    } else {
      panel.classList.remove("open");
    }
  }

  function toggleOpen() {
    isOpen = !isOpen;
    renderOpenState();
  }

  // Force the widget open — used by the global API below so external
  // elements (e.g. a "chat with us" icon placed elsewhere on the page)
  // can open the chat without needing to know its current state.
  function openPanel() {
    isOpen = true;
    renderOpenState();
  }

  function sendMessage() {
    if (isLoading) return;
    var inp = document.getElementById("cw-input");
    if (!inp) return;
    var text = inp.value.trim();
    if (!text) return;
    inp.value = "";
    inp.style.height = "auto";
    addMessage("user", text);
    isLoading = true;
    var sendBtn = document.getElementById("cw-send");
    if (sendBtn) sendBtn.disabled = true;
    showTyping();

    fetch(apiBase + "/widget/" + encodeURIComponent(widgetKey) + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId: sessionId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        hideTyping();
        isLoading = false;
        if (sendBtn) sendBtn.disabled = false;
        if (data.response) {
          addMessage("bot", data.response);
          if (autoSpeak) speak(data.response);
        } else if (data.error) {
          addMessage("bot", "⚠️ " + data.error);
        }
      })
      .catch(function () {
        hideTyping();
        isLoading = false;
        if (sendBtn) sendBtn.disabled = false;
        addMessage("bot", "⚠️ Connection error. Please try again.");
      });
  }

  function setActiveLangButtons() {
    var enBtn = document.getElementById("cw-lang-en");
    var arBtn = document.getElementById("cw-lang-ar");
    if (enBtn) enBtn.classList.toggle("active", voiceLang === "en");
    if (arBtn) arBtn.classList.toggle("active", voiceLang === "ar");
  }

  function stopRecording() {
    isRecording = false;
    var mic = document.getElementById("cw-mic");
    if (mic) mic.classList.remove("recording");
    if (recognizer) {
      try { recognizer.stop(); } catch (e) {}
    }
  }

  function startRecording() {
    if (!SpeechRecognitionCtor || isLoading) return;
    if (isRecording) {
      stopRecording();
      return;
    }
    recognizer = new SpeechRecognitionCtor();
    recognizer.lang = voiceLang === "ar" ? "ar-SA" : "en-US";
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;

    isRecording = true;
    var mic = document.getElementById("cw-mic");
    if (mic) mic.classList.add("recording");

    recognizer.onresult = function (event) {
      var transcript = event.results && event.results[0] && event.results[0][0] && event.results[0][0].transcript;
      if (transcript && transcript.trim()) {
        var inp = document.getElementById("cw-input");
        if (inp) inp.value = transcript.trim();
        sendMessage();
      }
    };
    recognizer.onerror = function () {
      stopRecording();
    };
    recognizer.onend = function () {
      stopRecording();
    };

    try {
      recognizer.start();
    } catch (e) {
      stopRecording();
    }
  }

  function bindEvents() {
    var btn = document.getElementById("cw-btn");
    var close = document.getElementById("cw-close");
    var send = document.getElementById("cw-send");
    var inp = document.getElementById("cw-input");
    var mic = document.getElementById("cw-mic");
    var speakToggle = document.getElementById("cw-speak-toggle");
    var langEn = document.getElementById("cw-lang-en");
    var langAr = document.getElementById("cw-lang-ar");

    if (btn) {
      btn.addEventListener("pointerdown", startFabDrag);
      btn.addEventListener("pointermove", moveFabDrag);
      btn.addEventListener("pointerup", finishFabDrag);
      btn.addEventListener("pointercancel", finishFabDrag);
      btn.addEventListener("click", function () {
        if (fabWasMoved) {
          fabWasMoved = false;
          return;
        }
        toggleOpen();
      });
    }
    if (close) close.addEventListener("click", toggleOpen);
    if (send) send.addEventListener("click", sendMessage);
    if (inp) {
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      inp.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 80) + "px";
      });
    }

    if (mic) {
      if (!SpeechRecognitionCtor) {
        mic.classList.add("unsupported");
      } else {
        mic.addEventListener("click", startRecording);
      }
    }

    if (speakToggle) {
      speakToggle.classList.toggle("active", autoSpeak);
      if (!speechSynth) {
        speakToggle.style.display = "none";
      } else {
        speakToggle.addEventListener("click", function () {
          autoSpeak = !autoSpeak;
          localStorage.setItem(SPEAK_KEY, autoSpeak ? "1" : "0");
          speakToggle.classList.toggle("active", autoSpeak);
        });
      }
    }

    if (langEn && langAr) {
      if (!SpeechRecognitionCtor && !speechSynth) {
        document.getElementById("cw-toolbar").querySelector("#cw-lang-toggle").style.display = "none";
      }
      setActiveLangButtons();
      langEn.addEventListener("click", function () {
        voiceLang = "en";
        localStorage.setItem(VOICE_LANG_KEY, voiceLang);
        setActiveLangButtons();
      });
      langAr.addEventListener("click", function () {
        voiceLang = "ar";
        localStorage.setItem(VOICE_LANG_KEY, voiceLang);
        setActiveLangButtons();
      });
    }
  }

  function fetchConfig() {
    fetch(apiBase + "/widget/" + encodeURIComponent(widgetKey) + "/config")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.name) {
          companyName = data.name;
          var titleEl = document.getElementById("cw-title");
          if (titleEl) titleEl.textContent = data.name;
        }
        if (!hasStoredFabPosition) {
          if (Number.isFinite(data.fabPositionX)) fabPositionX = Math.min(96, Math.max(4, data.fabPositionX));
          if (Number.isFinite(data.fabPositionY)) fabPositionY = Math.min(96, Math.max(4, data.fabPositionY));
          applyFabPosition();
        }
        var badge = document.getElementById("cw-badge");
        if (badge && data.isActive) badge.style.display = "block";
      })
      .catch(function () {});
  }

  function init() {
    createStyles();
    createHTML();
    applyFabPosition();
    bindEvents();
    fetchConfig();

    // Expose a small global API so other elements on the page (e.g. a
    // "chat with us" icon) can open this widget programmatically:
    //   window.ChatWidget.open()                 — opens the (only) widget
    //   window.ChatWidget.open("<widgetKey>")     — opens a specific widget
    //                                                when multiple are embedded
    window.ChatWidget = window.ChatWidget || {};
    var previousOpen = window.ChatWidget.open;
    window.ChatWidget.open = function (key) {
      if (!key || key === widgetKey) {
        openPanel();
      } else if (typeof previousOpen === "function") {
        previousOpen(key);
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* ഉള്ളിലെ ശത്രു — Escape Puzzle UI (No Chat Box) */
(function () {
  "use strict";

  var P = window.MindPuzzles;
  var L = window.MindLogic;
  var app = document.getElementById("app");

  var game = null;
  var tickHandle = null;
  var soundOn = true;
  var audioCtx = null;

  // UI transient state
  var keypadVal = "";
  var showTeamPicker = false;
  var feedback = null; // { ok, text }
  var vaultShake = false;
  var modal = null; // null | { kind: "rules" } | { kind: "accuse", botId }
  var memState = {}; // slotId -> { shown: bool, timer: id }
  var savedName = "";

  try {
    savedName = localStorage.getItem("mind-among-us-name") || "";
    if (localStorage.getItem("mind-among-us-sound") === "0") soundOn = false;
  } catch (e) {}

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtTime(sec) {
    var s = Math.max(0, Math.ceil(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
    return audioCtx;
  }

  function tone(freq, dur, type, vol, delay) {
    if (!soundOn) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    var t0 = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.04, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sfx(kind) {
    if (kind === "tap") tone(620, 0.045, "triangle", 0.025);
    else if (kind === "pin") {
      tone(520, 0.08, "triangle", 0.045);
      tone(780, 0.14, "sine", 0.04, 0.06);
    } else if (kind === "unlock") {
      tone(392, 0.14, "sine", 0.05);
      tone(523, 0.16, "sine", 0.05, 0.1);
      tone(659, 0.25, "sine", 0.05, 0.2);
    } else if (kind === "bad") {
      tone(155, 0.26, "sawtooth", 0.035);
      tone(120, 0.3, "square", 0.02, 0.08);
    } else if (kind === "help") {
      tone(440, 0.12, "sine", 0.035);
      tone(554, 0.15, "sine", 0.03, 0.08);
    }
  }

  function avatarSVG(p, size) {
    size = size || 36;
    var bg = (p.color && p.color.bg) || "#3a2a2e";
    var ac = (p.color && p.color.accent) || "#e8c49a";
    var k = p.avatarKind || 0;
    var hair =
      k % 4 === 0
        ? '<path d="M10 26c3-15 31-15 34 0v2H10z" fill="' + ac + '" opacity=".85"/>'
        : k % 4 === 1
        ? '<path d="M12 22h30c2 8 1 14-2 16H14c-3-2-4-8-2-16z" fill="' + ac + '" opacity=".55"/>'
        : k % 4 === 2
        ? '<rect x="13" y="13" width="28" height="8" rx="4" fill="' + ac + '" opacity=".75"/>'
        : '<circle cx="17" cy="17" r="5" fill="' + ac + '" opacity=".8"/><circle cx="37" cy="17" r="5" fill="' + ac + '" opacity=".8"/>';
    return (
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 54 54" aria-hidden="true">' +
      '<circle cx="27" cy="27" r="27" fill="' + bg + '"/>' +
      hair +
      '<circle cx="21" cy="31" r="2.1" fill="' + ac + '"/>' +
      '<circle cx="33" cy="31" r="2.1" fill="' + ac + '"/>' +
      '<path d="M22 39c3 2 7 2 10 0" fill="none" stroke="' + ac + '" stroke-width="1.5" stroke-linecap="round"/></svg>'
    );
  }

  function stopTicker() {
    if (tickHandle) {
      clearInterval(tickHandle);
      tickHandle = null;
    }
  }

  function startTicker() {
    stopTicker();
    tickHandle = setInterval(function () {
      if (!game || game.status !== "playing") {
        stopTicker();
        return;
      }
      var res = L.tickSession(game, 0.5);
      if (game.status === "ended") {
        stopTicker();
        renderAll();
        return;
      }
      updateLiveSections(res.events || []);
    }, 500);
  }

  function startNewGame(mode) {
    var el = document.getElementById("pname");
    var name = (el ? el.value : savedName).trim() || "അമൽ";
    savedName = name;
    try { localStorage.setItem("mind-among-us-name", name); } catch (e) {}
    ensureAudio();
    sfx("tap");
    keypadVal = "";
    showTeamPicker = false;
    feedback = null;
    modal = null;
    memState = {};
    game = L.createSession({ mode: mode, playerName: name });
    renderAll();
    startTicker();
  }

  function renderAll() {
    if (!game) return renderIntro();
    if (game.status === "accuse") return renderFinalAccuse();
    if (game.status === "ended") return renderEnding();
    renderPlayShell();
  }

  function renderIntro() {
    stopTicker();
    app.innerHTML =
      '<div class="screen">' +
      '<svg class="vault-emblem" viewBox="0 0 80 80" fill="none">' +
      '<circle cx="40" cy="40" r="34" stroke="#dfb878" stroke-width="2" stroke-dasharray="6 4"/>' +
      '<circle cx="40" cy="40" r="23" stroke="#c45c4a" stroke-width="2"/>' +
      '<circle cx="40" cy="36" r="5" fill="#dfb878"/>' +
      '<path d="M37 40h6l2 12h-10z" fill="#dfb878"/>' +
      "</svg>" +
      '<p class="brand">Escape Puzzle Thriller</p>' +
      '<h1 class="title">ഉള്ളിലെ ശത്രു</h1>' +
      '<p class="subtitle">The Mind Among Us</p>' +
      '<div class="pill-row">' +
      '<span class="stat-pill">🧩 ' + P.count + ' പസിലുകൾ</span>' +
      '<span class="stat-pill">🤝 ടീം സഹായം</span>' +
      '<span class="stat-pill">🕵️ ഉള്ളിൽ ഒരാൾ ശത്രു</span>' +
      "</div>" +
      '<div class="mood">' +
      "പൂട്ടിയ വാതിലുകൾ. ഓരോ ലോക്കിന്റെയും കോഡ് തുറക്കാൻ ചെറിയ പസിലുകൾ പരിഹരിക്കുക. " +
      "നിങ്ങൾക്ക് ഉത്തരം കിട്ടിയില്ലെങ്കിൽ ടീമിലെ കൂട്ടുകാരോട് സഹായം ചോദിക്കാം — പക്ഷേ നിങ്ങളോടൊപ്പമുള്ള ഒരാൾ <strong>ഉള്ളിലെ ശത്രു</strong> ആണ്, തെറ്റായ വഴി കാണിച്ചേക്കാം!" +
      "</div>" +
      '<form id="start-form" class="field">' +
      '<label for="pname">കളിക്കാരന്റെ പേര്</label>' +
      '<input id="pname" maxlength="16" value="' + esc(savedName) + '" placeholder="ഉദാ: അമൽ">' +
      "</form>" +
      '<button class="btn gold wide" id="btn-escape">🔓 വാതിൽ തുറക്കുക (Escape Mode)</button>' +
      '<button class="btn ghost wide" id="btn-marathon">⚡ 100 പസിൽ ചലഞ്ച് (Marathon)</button>' +
      '<button class="btn ghost sm" id="btn-rules" style="margin:6px auto 0">എങ്ങനെ കളിക്കും?</button>' +
      "</div>" +
      renderModalHTML();

    document.getElementById("btn-escape").onclick = function () { startNewGame("escape"); };
    document.getElementById("btn-marathon").onclick = function () { startNewGame("marathon"); };
    document.getElementById("start-form").onsubmit = function (ev) {
      ev.preventDefault();
      startNewGame("escape");
    };
    document.getElementById("btn-rules").onclick = function () {
      modal = { kind: "rules" };
      renderIntro();
    };
    bindModal();
  }

  function hudHTML() {
    var ch = L.getCurrentChamber(game);
    var totalCh = game.chambers.length;
    var fuses = "";
    for (var i = 0; i < game.maxFuses; i++) {
      fuses += '<span class="fuse' + (i < game.fuses ? "" : " out") + '">⚡</span>';
    }
    var low = game.timerSec <= 60 ? " low" : "";
    return (
      '<div class="hud">' +
      '<div class="hud-left">' +
      '<div class="hud-title">' + esc(ch ? ch.name : "ഉള്ളിലെ ശത്രു") + "</div>" +
      '<div class="hud-sub">' +
      (game.mode === "marathon"
        ? "പസിലുകൾ: " + (game.stats.solvedByPlayer + game.stats.solvedByBots) + " / 100"
        : "ചേംബർ " + (game.currentChamberIndex + 1) + " / " + totalCh) +
      "</div></div>" +
      '<div class="hud-right">' +
      '<div class="fuses" title="ഫ്യൂസുകൾ">' + fuses + "</div>" +
      '<div class="timer-box' + low + '">' + fmtTime(game.timerSec) + "</div>" +
      '<button class="icon-btn" id="snd-btn" type="button" aria-label="Sound">' + (soundOn ? "♪" : "🔇") + "</button>" +
      '<button class="icon-btn" id="hlp-btn" type="button" aria-label="Help">?</button>' +
      "</div></div>"
    );
  }

  function vaultHTML() {
    var ch = L.getCurrentChamber(game);
    if (!ch) return "";
    var solvedCount = ch.slots.filter(function (s) { return s.status === "solved"; }).length;
    var ready = solvedCount === ch.slots.length;
    var pins = ch.slots.map(function (sl) {
      var owner = L.getParticipant(game, sl.ownerId);
      var isActive = sl.id === game.activeSlotId;
      var cls = "pin " + sl.status + (isActive ? " active" : "");
      var center = sl.status === "solved" ? String(sl.vaultDigit) : sl.status === "needs_help" ? "!" : "?";
      var bar =
        sl.status === "solving"
          ? '<div class="pin-bar"><i style="width:' + Math.min(100, Math.round(sl.progress)) + '%"></i></div>'
          : "";
      return (
        '<button type="button" class="' + cls + '" data-slot="' + esc(sl.id) + '">' +
        '<span class="pin-num">പിൻ ' + (sl.slotIndex + 1) + "</span>" +
        '<span class="pin-digit">' + center + "</span>" +
        '<span class="pin-owner">' + esc(sl.ownerId === L.PLAYER_ID ? "നീ" : owner ? owner.name : "") + "</span>" +
        bar +
        "</button>"
      );
    }).join("");

    var fault = ch.lastFault
      ? '<div class="fault-banner">⚠️ കള്ളത്തരം കണ്ടെത്തി! പിൻ #' +
        (ch.lastFault.slotIndex + 1) +
        " (" + esc(ch.lastFault.culpritName) + ") തെറ്റായ കോഡ് നൽകി — ഇപ്പോൾ ശരിയാക്കൂ!</div>"
      : "";

    var unlock = ready
      ? '<div class="unlock-bar"><button class="btn gold unlock-btn" id="unlock-btn">🔓 വാതിൽ തുറക്കുക</button></div>'
      : "";

    return (
      '<div class="vault-card' + (vaultShake ? " shake" : "") + '">' +
      '<div class="vault-head">' +
      '<span class="vault-name">🔐 ലോക്ക് കോഡ്</span>' +
      '<span class="vault-progress">' + solvedCount + " / " + ch.slots.length + " പിൻ തുറന്നു</span>" +
      "</div>" +
      '<div class="pins-row">' + pins + "</div>" +
      unlock +
      fault +
      "</div>"
    );
  }

  function teamStripHTML() {
    var ch = L.getCurrentChamber(game);
    var bots = game.participants.filter(function (p) { return p.kind === "bot"; });
    var cards = bots.map(function (b) {
      var stuckSlot = ch && ch.slots.filter(function (s) { return s.ownerId === b.id && s.status === "needs_help"; })[0];
      var workingSlot = ch && ch.slots.filter(function (s) { return s.ownerId === b.id && s.status === "solving"; })[0];
      var cls = "mate" + (stuckSlot ? " stuck" : "") + (b.lockedOut ? " locked-out" : "");
      var status = b.lockedOut
        ? "ലോക്കൗട്ട്"
        : stuckSlot
        ? "സഹായം വേണം!"
        : workingSlot
        ? "സോൾവ് ചെയ്യുന്നു"
        : b.helpCooldownSec > 0
        ? Math.ceil(b.helpCooldownSec) + "s"
        : "തയ്യാർ";

      var actions = "";
      if (!b.lockedOut) {
        actions =
          '<div class="mate-actions">' +
          (stuckSlot
            ? '<button type="button" class="mate-btn help" data-help-slot="' + esc(stuckSlot.id) + '">സഹായിക്കൂ</button>'
            : "") +
          '<button type="button" class="mate-btn" data-accuse="' + esc(b.id) + '">സംശയം</button>' +
          "</div>";
      }

      return (
        '<div class="' + cls + '">' +
        '<div class="mate-av">' + avatarSVG(b, 34) + "</div>" +
        '<div class="mate-name">' + esc(b.name) + "</div>" +
        '<div class="mate-spec">' + esc(b.specialty ? b.specialty.ml : "") + "</div>" +
        '<div class="mate-status">' + status + "</div>" +
        actions +
        "</div>"
      );
    }).join("");

    // Show latest non-empty bot reaction pill above puzzle card if present
    var latestBubble = null;
    bots.forEach(function (b) {
      if (b.bubble && !b.lockedOut) latestBubble = b;
    });
    var bubbleHTML = latestBubble
      ? '<div class="mate-bubble"><span><strong>' + esc(latestBubble.name) + ':</strong> ' + esc(latestBubble.bubble) + '</span><button type="button" class="mate-btn" id="clear-bubble">✕</button></div>'
      : "";

    return '<div class="team-strip">' + cards + "</div>" + bubbleHTML;
  }

  function puzzleCardHTML() {
    var ch = L.getCurrentChamber(game);
    var sl = L.findSlot(game, game.activeSlotId) || (ch && ch.slots[0]);
    if (!sl) return "";
    var puz = P.byId(sl.puzzleId);
    if (!puz) return "";
    var cat = P.CATEGORIES[puz.category] || { ml: puz.category, icon: "🧩" };
    var owner = L.getParticipant(game, sl.ownerId);

    var ownerLabel =
      sl.status === "needs_help"
        ? "പിൻ #" + (sl.slotIndex + 1) + " · " + esc(owner ? owner.name : "") + " സഹായം ചോദിക്കുന്നു!"
        : sl.status === "solved"
        ? "പിൻ #" + (sl.slotIndex + 1) + " തുറന്നു (" + esc(owner ? (owner.id === L.PLAYER_ID ? "നീ" : owner.name) : "") + ")"
        : sl.ownerId === L.PLAYER_ID
        ? "നിന്റെ പിൻ #" + (sl.slotIndex + 1)
        : esc(owner ? owner.name : "") + " സോൾവ് ചെയ്യുന്നു (പിൻ #" + (sl.slotIndex + 1) + ")";

    // If already solved, allow inspecting (and fixing if suspected!)
    if (sl.status === "solved") {
      var solver = L.getParticipant(game, sl.solvedBy);
      return (
        '<div class="puzzle-card">' +
        '<div class="puzzle-meta"><span class="cat-tag">' + cat.icon + " " + esc(cat.ml) + '</span><span class="pin-tag">' + ownerLabel + "</span></div>" +
        '<p class="puzzle-prompt">' + esc(puz.prompt) + "</p>" +
        (puz.svg || "") +
        '<div class="solved-inspect"><div><strong>പരിഹരിച്ചത്:</strong> ' + esc(solver ? solver.name : "") + "</div>" +
        '<div><strong>നൽകിയ ഉത്തരം:</strong> ' + esc(sl.claimedAnswer || puz.answer) + "</div>" +
        (sl.solvedBy !== L.PLAYER_ID ? '<div style="margin-top:6px;font-size:12px;color:var(--muted)">ഉത്തരം തെറ്റാണെന്ന് തോന്നുന്നുവെങ്കിൽ, താഴെ വീണ്ടും ശരിയാക്കി തിരുത്താം:</div>' : "") +
        "</div>" +
        (sl.solvedBy !== L.PLAYER_ID ? answerInputsHTML(puz, sl) : "") +
        "</div>"
      );
    }

    // Memory puzzle handling
    var bodyHTML = "";
    if (puz.category === "memory") {
      var ms = memState[sl.id];
      if (!ms) {
        ms = { phase: "showing" };
        memState[sl.id] = ms;
        setTimeout(function () {
          if (memState[sl.id]) {
            memState[sl.id].phase = "ask";
            renderPuzzleZone();
          }
        }, puz.flashMs || 2200);
      }
      if (ms.phase === "showing") {
        bodyHTML =
          '<p class="puzzle-prompt">' + esc(puz.prompt) + "</p>" +
          '<div class="mem-flash">' + esc(puz.flashText) + "</div>";
      } else {
        bodyHTML =
          '<p class="puzzle-prompt">' + esc(puz.askPrompt || puz.prompt) + "</p>" +
          '<div class="mem-hidden"><span>മിന്നിമറഞ്ഞത് മറന്നോ?</span><button type="button" class="mate-btn" id="mem-replay">വീണ്ടും കാണുക</button></div>' +
          answerInputsHTML(puz, sl);
      }
    } else {
      bodyHTML =
        '<p class="puzzle-prompt">' + esc(puz.prompt) + "</p>" +
        (puz.svg || "") +
        answerInputsHTML(puz, sl);
    }

    var hintHTML = sl.hintData
      ? '<div class="hint-box"><span class="who">' + esc(sl.hintData.teammateName) + ":</span> " +
        esc(sl.hintData.hintText) +
        (sl.hintData.suggestedAnswer ? " <strong>(നിർദ്ദേശം: " + esc(sl.hintData.suggestedAnswer) + ")</strong>" : "") +
        "</div>"
      : "";

    var fbHTML = feedback
      ? '<div class="feedback-line ' + (feedback.ok ? "ok" : "bad") + '">' + esc(feedback.text) + "</div>"
      : "";

    var pickerHTML = showTeamPicker ? teamPickerHTML() : "";

    return (
      '<div class="puzzle-card">' +
      '<div class="puzzle-meta">' +
      '<span class="cat-tag">' + cat.icon + " " + esc(cat.ml) + "</span>" +
      '<span class="pin-tag' + (sl.status === "needs_help" ? " help" : "") + '">' + ownerLabel + "</span>" +
      "</div>" +
      bodyHTML +
      hintHTML +
      fbHTML +
      pickerHTML +
      '<div class="puzzle-actions">' +
      '<button type="button" class="btn ghost" id="ask-team-btn">🤝 ടീം സഹായം</button>' +
      '<button type="button" class="btn ghost" id="swap-btn"' + (ch.swapsLeft <= 0 ? " disabled" : "") + ">↻ മാറ്റൂ (" + ch.swapsLeft + ")</button>" +
      "</div></div>"
    );
  }

  function answerInputsHTML(puz, sl) {
    if (puz.inputType === "choice") {
      var sugg = sl.hintData && sl.hintData.suggestedAnswer;
      return (
        '<div class="choices-grid">' +
        puz.options.map(function (opt) {
          var cls = "choice-btn" + (sugg === opt ? " suggested" : "");
          return '<button type="button" class="' + cls + '" data-choice="' + esc(opt) + '">' + esc(opt) + "</button>";
        }).join("") +
        "</div>"
      );
    }
    // Keypad
    var keys = ["1", "2", "3", "⌫", "4", "5", "6", "C", "7", "8", "9", "✓", "0"];
    return (
      '<div class="keypad-display" id="kp-disp">' + (keypadVal ? esc(keypadVal) : "···") + "</div>" +
      '<div class="keypad-grid">' +
      ["1", "2", "3", "⌫", "4", "5", "6", "0", "7", "8", "9", "✓"].map(function (k) {
        var cls = k === "✓" ? "kbtn ok" : k === "⌫" ? "kbtn clr" : "kbtn";
        return '<button type="button" class="' + cls + '" data-key="' + k + '">' + k + "</button>";
      }).join("") +
      "</div>"
    );
  }

  function teamPickerHTML() {
    var bots = game.participants.filter(function (p) { return p.kind === "bot" && !p.lockedOut; });
    if (!bots.length) return '<div class="hint-box">സഹായിക്കാൻ ആരുമില്ല.</div>';
    return (
      '<div class="team-picker">' +
      bots.map(function (b) {
        var cd = b.helpCooldownSec > 0 ? " (" + Math.ceil(b.helpCooldownSec) + "s)" : "";
        return (
          '<button type="button" class="btn ghost sm" data-ask-bot="' + esc(b.id) + '"' +
          (b.helpCooldownSec > 0 ? " disabled" : "") +
          ">" + esc(b.name) + " · " + esc(b.specialty ? b.specialty.ml : "") + cd + "</button>"
        );
      }).join("") +
      "</div>"
    );
  }

  function renderModalHTML() {
    if (!modal) return "";
    if (modal.kind === "rules") {
      return (
        '<div class="modal-bg" id="modal-bg"><div class="modal-card">' +
        "<h3>എങ്ങനെ കളിക്കും</h3>" +
        "<ul>" +
        "<li><strong>ലോക്ക് തുറക്കുക:</strong> ഓരോ പിൻ നമ്പറിനും ഒരു പസിൽ ഉണ്ട്. ശരിയുത്തരം നൽകുമ്പോൾ ലോക്ക് പിൻ പ്രകാശിക്കും.</li>" +
        "<li><strong>ടീം സഹായം:</strong> ഉത്തരം അറിയില്ലെങ്കിൽ 'ടീം സഹായം' വഴി കൂട്ടുകാരോട് ചോദിക്കാം. കൂട്ടുകാർ കുടുങ്ങുമ്പോൾ നിങ്ങളും അവരെ സഹായിക്കാം (+10s ബോണസ്).</li>" +
        "<li><strong>ഉള്ളിലെ ശത്രു (The Mind):</strong> ടീമിലെ ഒരാൾ രഹസ്യമായി തെറ്റായ ഹിന്റും തെറ്റായ കോഡും നൽകിയേക്കാം! സംശയം തോന്നിയാൽ അവരുടെ കാർഡിൽ 'സംശയം' തൊട്ട് ലോക്കൗട്ട് ചെയ്യാം.</li>" +
        "<li><strong>ഫ്യൂസുകൾ ⚡⚡⚡:</strong> തെറ്റായ ഉത്തരമോ തെറ്റായ ആരോപണമോ ഫ്യൂസ് നഷ്ടപ്പെടുത്തും.</li>" +
        "</ul>" +
        '<button class="btn gold wide" id="modal-close">മനസ്സിലായി</button>' +
        "</div></div>"
      );
    }
    if (modal.kind === "accuse") {
      var b = L.getParticipant(game, modal.botId);
      if (!b) return "";
      return (
        '<div class="modal-bg" id="modal-bg"><div class="modal-card">' +
        "<h3>" + esc(b.name) + "യെ ലോക്കൗട്ട് ചെയ്യണോ?</h3>" +
        "<p>ഇവർ <strong>ഉള്ളിലെ ശത്രു</strong> ആണെങ്കിൽ ടീം രക്ഷപ്പെടും (+30s). നിരപരാധിയാണെങ്കിൽ ഒരു ഫ്യൂസ് ⚡ നഷ്ടമാകും.</p>" +
        '<div style="display:flex;gap:8px">' +
        '<button class="btn danger" style="flex:1" id="accuse-confirm">ലോക്കൗട്ട് ചെയ്യുക</button>' +
        '<button class="btn ghost" style="flex:1" id="modal-close">വേണ്ട</button>' +
        "</div></div></div>"
      );
    }
    return "";
  }

  function renderPlayShell() {
    app.innerHTML =
      '<div id="hud-zone">' + hudHTML() + "</div>" +
      '<div id="vault-zone">' + vaultHTML() + "</div>" +
      '<div id="team-zone">' + teamStripHTML() + "</div>" +
      '<div id="puzzle-zone">' + puzzleCardHTML() + "</div>" +
      '<div id="modal-zone">' + renderModalHTML() + "</div>";
    bindPlayAll();
  }

  function renderPuzzleZone() {
    var pz = document.getElementById("puzzle-zone");
    if (!pz) return;
    pz.innerHTML = puzzleCardHTML();
    bindPuzzleZone();
  }

  function updateLiveSections(events) {
    var hz = document.getElementById("hud-zone");
    var vz = document.getElementById("vault-zone");
    var tz = document.getElementById("team-zone");
    if (hz) hz.innerHTML = hudHTML();
    if (vz) vz.innerHTML = vaultHTML();
    if (tz) tz.innerHTML = teamStripHTML();
    bindHud();
    bindVault();
    bindTeamStrip();

    var needPuzzleRefresh = events.some(function (e) {
      return (e.slotId && e.slotId === game.activeSlotId) || e.kind === "needs_help" || e.kind === "bot_solved";
    });
    if (events.some(function (e) { return e.kind === "needs_help" || e.kind === "bot_solved"; })) {
      sfx("help");
    }
    if (needPuzzleRefresh && !keypadVal && !showTeamPicker) {
      renderPuzzleZone();
    }
  }

  function bindPlayAll() {
    bindHud();
    bindVault();
    bindTeamStrip();
    bindPuzzleZone();
    bindModal();
  }

  function bindHud() {
    var snd = document.getElementById("snd-btn");
    if (snd) snd.onclick = function () {
      soundOn = !soundOn;
      try { localStorage.setItem("mind-among-us-sound", soundOn ? "1" : "0"); } catch (e) {}
      if (soundOn) sfx("tap");
      snd.textContent = soundOn ? "♪" : "🔇";
    };
    var hlp = document.getElementById("hlp-btn");
    if (hlp) hlp.onclick = function () {
      modal = { kind: "rules" };
      var mz = document.getElementById("modal-zone");
      if (mz) { mz.innerHTML = renderModalHTML(); bindModal(); }
    };
  }

  function bindVault() {
    document.querySelectorAll("[data-slot]").forEach(function (btn) {
      btn.onclick = function () {
        sfx("tap");
        keypadVal = "";
        feedback = null;
        showTeamPicker = false;
        L.selectSlot(game, btn.getAttribute("data-slot"));
        renderPlayShell();
      };
    });
    var ubtn = document.getElementById("unlock-btn");
    if (ubtn) {
      ubtn.onclick = function () {
        var res = L.unlockChamber(game);
        if (!res.ok) return;
        if (res.sabotageDetected) {
          sfx("bad");
          vaultShake = true;
          feedback = { ok: false, text: "ആരോ നൽകിയ കോഡ് തെറ്റാണ് — പിൻ ശരിയാക്കൂ!" };
          renderPlayShell();
          setTimeout(function () { vaultShake = false; }, 500);
          return;
        }
        sfx("unlock");
        keypadVal = "";
        feedback = null;
        showTeamPicker = false;
        renderAll();
      };
    }
  }

  function bindTeamStrip() {
    document.querySelectorAll("[data-help-slot]").forEach(function (btn) {
      btn.onclick = function () {
        sfx("tap");
        keypadVal = "";
        feedback = null;
        showTeamPicker = false;
        L.selectSlot(game, btn.getAttribute("data-help-slot"));
        renderPlayShell();
      };
    });
    document.querySelectorAll("[data-accuse]").forEach(function (btn) {
      btn.onclick = function () {
        sfx("tap");
        modal = { kind: "accuse", botId: btn.getAttribute("data-accuse") };
        var mz = document.getElementById("modal-zone");
        if (mz) { mz.innerHTML = renderModalHTML(); bindModal(); }
      };
    });
    var cb = document.getElementById("clear-bubble");
    if (cb) {
      cb.onclick = function () {
        game.participants.forEach(function (p) { p.bubble = null; });
        var tz = document.getElementById("team-zone");
        if (tz) { tz.innerHTML = teamStripHTML(); bindTeamStrip(); }
      };
    }
  }

  function bindPuzzleZone() {
    var replay = document.getElementById("mem-replay");
    if (replay) {
      replay.onclick = function () {
        var sl = L.findSlot(game, game.activeSlotId);
        if (!sl) return;
        var puz = P.byId(sl.puzzleId);
        memState[sl.id] = { phase: "showing" };
        renderPuzzleZone();
        setTimeout(function () {
          if (memState[sl.id]) {
            memState[sl.id].phase = "ask";
            renderPuzzleZone();
          }
        }, (puz && puz.flashMs) || 2200);
      };
    }

    document.querySelectorAll("[data-choice]").forEach(function (btn) {
      btn.onclick = function () {
        handleAnswerSubmit(btn.getAttribute("data-choice"));
      };
    });

    document.querySelectorAll("[data-key]").forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-key");
        sfx("tap");
        if (k === "⌫") {
          keypadVal = keypadVal.slice(0, -1);
          var d = document.getElementById("kp-disp");
          if (d) d.textContent = keypadVal || "···";
        } else if (k === "✓") {
          if (keypadVal) handleAnswerSubmit(keypadVal);
        } else if (keypadVal.length < 6) {
          keypadVal += k;
          var disp = document.getElementById("kp-disp");
          if (disp) disp.textContent = keypadVal;
        }
      };
    });

    var askBtn = document.getElementById("ask-team-btn");
    if (askBtn) {
      askBtn.onclick = function () {
        sfx("tap");
        showTeamPicker = !showTeamPicker;
        renderPuzzleZone();
      };
    }

    document.querySelectorAll("[data-ask-bot]").forEach(function (btn) {
      btn.onclick = function () {
        var res = L.askTeammateHelp(game, game.activeSlotId, btn.getAttribute("data-ask-bot"));
        if (res.ok) {
          sfx("help");
          showTeamPicker = false;
          renderPlayShell();
        }
      };
    });

    var swapBtn = document.getElementById("swap-btn");
    if (swapBtn) {
      swapBtn.onclick = function () {
        var res = L.swapSlotPuzzle(game, game.activeSlotId);
        if (res.ok) {
          sfx("tap");
          keypadVal = "";
          feedback = null;
          showTeamPicker = false;
          renderPlayShell();
        }
      };
    }
  }

  function handleAnswerSubmit(val) {
    var res = L.submitSlotAnswer(game, game.activeSlotId, val);
    if (!res.ok) return;
    if (res.correct) {
      sfx(res.chamberReady ? "unlock" : "pin");
      keypadVal = "";
      showTeamPicker = false;
      feedback = {
        ok: true,
        text: res.wasNeedsHelp
          ? "ശരി! കൂട്ടുകാരനെ സഹായിച്ചു (+10s)."
          : "ശരി! പിൻ തുറന്നു.",
      };
      renderPlayShell();
    } else {
      sfx("bad");
      keypadVal = "";
      if (res.fatal) {
        stopTicker();
        renderAll();
        return;
      }
      vaultShake = true;
      feedback = { ok: false, text: "തെറ്റായ ഉത്തരം! ഒരു ഫ്യൂസ് നഷ്ടമായി ⚡" };
      renderPlayShell();
      setTimeout(function () { vaultShake = false; }, 500);
    }
  }

  function bindModal() {
    var cl = document.getElementById("modal-close");
    if (cl) cl.onclick = function () {
      modal = null;
      if (!game) renderIntro();
      else {
        var mz = document.getElementById("modal-zone");
        if (mz) mz.innerHTML = "";
      }
    };
    var ac = document.getElementById("accuse-confirm");
    if (ac && modal && modal.kind === "accuse") {
      ac.onclick = function () {
        var res = L.accuseParticipant(game, modal.botId);
        modal = null;
        if (res.caughtMind) {
          sfx("unlock");
          feedback = { ok: true, text: res.targetName + " തന്നെയായിരുന്നു ഉള്ളിലെ ശത്രു! (+30s)" };
        } else {
          sfx("bad");
          feedback = { ok: false, text: "തെറ്റായ സംശയം! ഒരു ഫ്യൂസ് നഷ്ടമായി ⚡" };
        }
        renderAll();
      };
    }
  }

  function renderFinalAccuse() {
    stopTicker();
    var bots = game.participants.filter(function (p) { return p.kind === "bot" && !p.lockedOut; });
    app.innerHTML =
      '<div class="screen">' +
      '<p class="brand">അവസാന ചോദ്യം</p>' +
      '<h1 class="title" style="font-size:28px">ആരായിരുന്നു ഉള്ളിലെ ശത്രു?</h1>' +
      '<div class="mood">എല്ലാ വാതിലുകളും തുറന്നു. പക്ഷേ പുറത്തുകടക്കും മുമ്പ് ടീമിനെ വഴിതെറ്റിക്കാൻ ശ്രമിച്ചയാളെ ചൂണ്ടിക്കാണിക്കൂ.</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;max-width:360px;margin:0 auto 16px">' +
      bots.map(function (b) {
        return (
          '<button type="button" class="choice-btn" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px" data-final-accuse="' + esc(b.id) + '">' +
          avatarSVG(b, 44) +
          "<span>" + esc(b.name) + "</span>" +
          '<span style="font-size:11px;color:var(--muted)">സോൾവ്: ' + b.solvedCount + "</span></button>"
        );
      }).join("") +
      "</div>" +
      '<button class="btn ghost wide" id="skip-accuse">ഉറപ്പില്ല — നേരെ പുറത്തേക്ക്</button>' +
      "</div>";

    document.querySelectorAll("[data-final-accuse]").forEach(function (btn) {
      btn.onclick = function () {
        var res = L.accuseParticipant(game, btn.getAttribute("data-final-accuse"));
        sfx(res.caughtMind ? "unlock" : "bad");
        renderAll();
      };
    });
    document.getElementById("skip-accuse").onclick = function () {
      L.skipFinalAccusation(game);
      sfx("tap");
      renderAll();
    };
  }

  function renderEnding() {
    stopTicker();
    var e = game.ending;
    var mind = L.getParticipant(game, e.mindId);
    app.innerHTML =
      '<div class="screen">' +
      '<p class="brand">' + (e.escaped ? "എസ്കേപ്പ് പൂർത്തിയായി" : "ഗെയിം അവസാനിച്ചു") + "</p>" +
      '<h1 class="title" style="font-size:32px">' + esc(e.title) + "</h1>" +
      '<div class="mood">' + esc(e.body) + "</div>" +
      (mind
        ? '<div style="margin:0 auto 16px;display:inline-flex;align-items:center;gap:10px;background:var(--panel);border:1px solid #8a3030;padding:10px 16px;border-radius:14px">' +
          avatarSVG(mind, 40) +
          '<div style="text-align:left"><div style="font-size:11px;color:#ff9c9c">ഉള്ളിലെ ശത്രു (The Mind)</div><strong>' +
          esc(mind.name) + "</strong></div></div>"
        : "") +
      '<div class="stats-grid">' +
      '<div class="stat-box"><div class="num">' + e.stats.solvedByPlayer + '</div><div class="lbl">നീ തുറന്നവ</div></div>' +
      '<div class="stat-box"><div class="num">' + e.stats.helpedTeammates + '</div><div class="lbl">ടീമിനെ സഹായിച്ചു</div></div>' +
      '<div class="stat-box"><div class="num">' + e.stats.mindSabotagesCaught + '</div><div class="lbl">പിടിച്ച കള്ളത്തരങ്ങൾ</div></div>' +
      '<div class="stat-box"><div class="num">' + fmtTime(e.elapsedSec) + '</div><div class="lbl">എടുത്ത സമയം</div></div>' +
      "</div>" +
      '<button class="btn gold wide" id="replay-btn">വീണ്ടും കളിക്കുക</button>' +
      "</div>";

    document.getElementById("replay-btn").onclick = function () {
      sfx("tap");
      game = null;
      renderIntro();
    };
  }

  renderIntro();
})();

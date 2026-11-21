/* ഉള്ളിലെ ശത്രു — UI */
(function () {
  "use strict";

  var L = window.MindLogic;
  var app = document.getElementById("app");
  var game = null;
  var soundOn = true;
  var audio = { ctx: null, drone: null };
  var discussTimer = null;
  var discussStarted = 0;
  var pendingWhisper = null;
  var discussMinMs = 8000;
  var lastChatCount = 0;
  var savedName = "";

  try {
    savedName = localStorage.getItem("mind-among-us-name") || "";
    var storedSound = localStorage.getItem("mind-among-us-sound");
    if (storedSound === "0") soundOn = false;
  } catch (e) {}

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function ensureAudio() {
    if (audio.ctx) return audio.ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audio.ctx = new AC();
    return audio.ctx;
  }

  function beep(freq, dur, type, vol, destTime) {
    if (!soundOn) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    var t0 = destTime != null ? destTime : ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.04, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function startDrone() {
    if (!soundOn) return;
    var ctx = ensureAudio();
    if (!ctx || audio.drone) return;
    if (ctx.state === "suspended") ctx.resume();
    var osc = ctx.createOscillator();
    var osc2 = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = "sine";
    osc2.type = "sine";
    osc.frequency.value = 55;
    osc2.frequency.value = 82.4;
    g.gain.value = 0.012;
    osc.connect(g);
    osc2.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc2.start();
    audio.drone = { osc: osc, osc2: osc2, g: g };
  }

  function stopDrone() {
    if (!audio.drone) return;
    try {
      audio.drone.osc.stop();
      audio.drone.osc2.stop();
    } catch (e) {}
    audio.drone = null;
  }

  function sfx(kind) {
    if (kind === "tick") beep(720, 0.05, "triangle", 0.025);
    else if (kind === "whisper") {
      beep(180, 0.5, "sine", 0.04);
      beep(220, 0.4, "triangle", 0.02);
    } else if (kind === "ok") {
      beep(392, 0.15, "sine", 0.04);
      beep(523, 0.22, "sine", 0.035, (audio.ctx && audio.ctx.currentTime + 0.12) || undefined);
    } else if (kind === "bad") {
      beep(140, 0.35, "sawtooth", 0.03);
      beep(148, 0.35, "square", 0.015);
    } else if (kind === "vote") beep(240, 0.12, "triangle", 0.04);
    else if (kind === "end") {
      beep(98, 0.8, "sine", 0.05);
      beep(123, 0.9, "sine", 0.03);
    }
  }

  function toggleSound() {
    soundOn = !soundOn;
    try {
      localStorage.setItem("mind-among-us-sound", soundOn ? "1" : "0");
    } catch (e) {}
    if (soundOn) startDrone();
    else stopDrone();
    var btn = document.getElementById("sound-btn");
    if (btn) btn.textContent = soundOn ? "♪" : "🔇";
  }

  function avatarSVG(p, size) {
    size = size || 46;
    var bg = (p.color && p.color.bg) || "#444";
    var ac = (p.color && p.color.accent) || "#ddd";
    var k = p.avatarKind || 0;
    var hair =
      k % 5 === 0
        ? '<path d="M8 26c2-16 36-16 38 0v2H8z" fill="' + ac + '" opacity=".85"/>'
        : k % 5 === 1
        ? '<path d="M10 28c4-18 34-14 36-2v4H10z" fill="' + ac + '" opacity=".8"/>'
        : k % 5 === 2
        ? '<circle cx="18" cy="16" r="5" fill="' + ac + '"/><circle cx="36" cy="16" r="5" fill="' + ac + '"/>'
        : k % 5 === 3
        ? '<rect x="12" y="12" width="30" height="8" rx="3" fill="' + ac + '" opacity=".7"/>'
        : '<path d="M16 14h22c2 8 2 16-2 18H18c-4-2-4-10-2-18z" fill="' + ac + '" opacity=".55"/>';
    var glasses =
      k % 2 === 0
        ? '<rect x="16" y="30" width="10" height="6" rx="2" fill="none" stroke="' + ac + '" stroke-width="1.4"/><rect x="28" y="30" width="10" height="6" rx="2" fill="none" stroke="' + ac + '" stroke-width="1.4"/><path d="M26 33h2" stroke="' + ac + '"/>'
        : "";
    return (
      '<svg class="av" width="' +
      size +
      '" height="' +
      size +
      '" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="27" fill="' +
      bg +
      '"/>' +
      hair +
      '<circle cx="22" cy="32" r="2.1" fill="' +
      ac +
      '"/><circle cx="32" cy="32" r="2.1" fill="' +
      ac +
      '"/>' +
      glasses +
      '<path d="M22 40c3 2 7 2 10 0" fill="none" stroke="' +
      ac +
      '" stroke-width="1.3" stroke-linecap="round"/></svg>'
    );
  }

  function doorIcon(symbol) {
    if (symbol === "serpent") {
      return '<svg viewBox="0 0 48 48" fill="none" stroke="#e8c49a" stroke-width="2"><path d="M12 34c8-2 8-10 16-10 8 0 6 12-2 12-6 0-6-14 8-18"/><circle cx="36" cy="16" r="3" fill="#e8c49a" stroke="none"/></svg>';
    }
    if (symbol === "eye") {
      return '<svg viewBox="0 0 48 48" fill="none" stroke="#e8c49a" stroke-width="2"><ellipse cx="24" cy="24" rx="16" ry="9"/><circle cx="24" cy="24" r="4" fill="#e8c49a"/></svg>';
    }
    return '<svg viewBox="0 0 48 48" fill="none" stroke="#e8c49a" stroke-width="2"><path d="M10 30c2-12 8-18 14-18s12 6 14 18"/><circle cx="24" cy="20" r="2" fill="#e8c49a" stroke="none"/></svg>';
  }

  function clearDiscussTimer() {
    if (discussTimer) {
      clearInterval(discussTimer);
      discussTimer = null;
    }
  }

  function render() {
    if (!game || game.phase === "intro") return renderIntro();
    if (game.phase === "briefing") return renderBriefing();
    if (game.phase === "roleReveal") return renderRole();
    if (game.phase === "ending") return renderEnding();
    return renderPlay();
  }

  function renderIntro() {
    clearDiscussTimer();
    stopDrone();
    app.innerHTML =
      '<div class="screen center">' +
      '<p class="brand">Mind Game</p>' +
      " <h1 class=\"title\" >ഉള്ളിലെ ശത്രു</h1>" +
      '<p class="subtitle">The Mind Among Us</p>' +
      '<div class="mood">' +
      "<p>നിങ്ങൾ ഒരു മുറിയിൽ കുടുങ്ങി. വാതിൽ പൂട്ടിയിരിക്കുന്നു. പുറത്തുകടക്കാൻ ഒരുമിച്ച് മൂന്ന് പസിലുകൾ പരിഹരിക്കണം.</p>" +
      "<p>പക്ഷേ നിങ്ങളിൽ ഒരാൾ — <strong>ദി മൈൻഡ്</strong> — നിങ്ങളെ തെറ്റായ വഴിയിലേക്ക് നയിക്കും. ആരെയാണ് വിശ്വസിക്കുക? നിങ്ങളുടെ സ്വന്തം ക്ലൂ പോലും സത്യമായിരിക്കണമെന്നില്ല.</p>" +
      "</div>" +
      '<form id="start-form" class="field">' +
      "<label for=\"pname\">നിങ്ങളുടെ പേര്</label>" +
      '<input id="pname" name="pname" maxlength="18" autocomplete="nickname" value="' +
      esc(savedName) +
      '" placeholder="ഉദാ: അമൽ">' +
      "</form>" +
      '<button class="btn wide" id="start-btn">മുറിയിൽ പ്രവേശിക്കുക</button>' +
      '<details class="how"><summary>എങ്ങനെ കളിക്കും</summary>' +
      "<ul>" +
      "<li>ഒരു റൗണ്ട്: മൂന്ന് ഘട്ടങ്ങൾ (ലോക്ക്, പെട്ടികൾ, വാതിലുകൾ).</li>" +
      "<li>ഓരോ ഘട്ടത്തിലും നിങ്ങൾക്ക് ഒരു രഹസ്യ ക്ലൂ കിട്ടും. ബോട്ടുകളും ക്ലൂ പങ്കുവെക്കും — ചിലത് കള്ളം.</li>" +
      "<li>ചർച്ച കഴിഞ്ഞ് ഉത്തരം നൽകുക. പിന്നെ സംശയമുള്ളയാളെ വോട്ട് ചെയ്ത് പുറത്താക്കാം.</li>" +
      "<li>തെറ്റായ ഉത്തരമോ തെറ്റായ പുറത്താക്കലോ ടീമിന് നഷ്ടം. മൂന്ന് തെറ്റ് = മുറി അടയുന്നു.</li>" +
      "<li>നിങ്ങൾ ദി മൈൻഡ് ആണെങ്കിൽ ടീമിനെ പറ്റിക്കുക.</li>" +
      "<li>ഇപ്പോൾ സോളോ മോഡ് മാത്രം — ബാക്കി അഞ്ച് പേർ കമ്പ്യൂട്ടർ കഥാപാത്രങ്ങളാണ്.</li>" +
      "</ul></details></div>";

    function start(ev) {
      if (ev) ev.preventDefault();
      var name = (document.getElementById("pname").value || "").trim() || "അമൽ";
      savedName = name;
      try {
        localStorage.setItem("mind-among-us-name", name);
      } catch (e) {}
      ensureAudio();
      if (soundOn) startDrone();
      sfx("tick");
      game = L.createGame({ playerName: name });
      L.startBriefing(game);
      render();
    }
    document.getElementById("start-btn").addEventListener("click", start);
    document.getElementById("start-form").addEventListener("submit", start);
  }

  function renderBriefing() {
    var names = L.getPublicPlayers(game)
      .filter(function (p) {
        return !p.isPlayer;
      })
      .map(function (p) {
        return p.name;
      })
      .join(", ");
    app.innerHTML =
      '<div class="screen center">' +
      '<p class="brand">മുറി പൂട്ടിയിരിക്കുന്നു</p>' +
      '<h1 class="title" style="font-size:32px">ആരോ ഒരാൾ നിങ്ങളോടൊപ്പമുണ്ട്</h1>' +
      '<div class="mood"><p>ഈ മുറിയിൽ നിങ്ങൾ ഉൾപ്പെടെ ആറ് പേരാണ്. ' +
      esc(names) +
      " — ഒരാളുടെ മനസ്സ് നിങ്ങൾക്കെതിരെയാണ്.</p>" +
      "<p>മൂന്ന് പസിലുകൾ. രണ്ട് തെറ്റുകൾ മാത്രം സഹിക്കും. മൂന്നാമത്തേത് അവസാനമാണ്.</p></div>" +
      '<button class="btn wide" id="next-btn">തുടരുക</button></div>';
    document.getElementById("next-btn").onclick = function () {
      sfx("tick");
      L.revealRole(game);
      render();
    };
  }

  function renderRole() {
    var mind = L.isPlayerMind(game);
    app.innerHTML =
      '<div class="screen center">' +
      '<div class="panel role-card ' +
      (mind ? "mind" : "") +
      '"><div class="role-tag">' +
      (mind ? "രഹസ്യ റോൾ" : "നിന്റെ റോൾ") +
      "</div>" +
      (mind
        ? "<h2>നീയാണ് ദി മൈൻഡ്</h2><p class=\"blurb\">ടീമിനെ അറിയാതെ തെറ്റിപ്പിക്കുക. നിനക്ക് സത്യം അറിയാം — അത് നേരിട്ട് പങ്കുവെക്കരുത്. തെറ്റായ ക്ലൂകൾ പറയുക, വോട്ട് തെറ്റായ ആളിലേക്ക് തിരിക്കുക. അവർ നിന്നെ കണ്ടെത്തിയാൽ നീ തോറ്റു.</p>"
        : "<h2>നീ ടീമിലാണ്</h2><p class=\"blurb\">ദി മൈൻഡിനെ കണ്ടെത്തുക, മുറിയിൽ നിന്ന് രക്ഷപ്പെടുക. ക്ലൂകൾ പങ്കുവെക്കുക — പക്ഷേ ചിലത് കള്ളമായിരിക്കാം, നിന്റെതുൾപ്പെടെ. ആരെയാണ് വിശ്വസിക്കുക എന്ന് നീ തീരുമാനിക്കണം.</p>") +
      "</div>" +
      '<button class="btn wide" id="next-btn">ഒന്നാം ഘട്ടം തുടങ്ങുക</button></div>';
    document.getElementById("next-btn").onclick = function () {
      sfx("tick");
      L.beginStage(game);
      render();
    };
  }

  function topbarHTML() {
    var stage = game.stage && game.stage.puzzle ? game.stage.puzzle.title : "മുറി";
    var pips = "";
    for (var i = 0; i <= game.maxStrikes; i++) {
      pips += '<span class="pip' + (i < game.strikes ? " lost" : "") + '"></span>';
    }
    return (
      '<div class="topbar"><div class="left"><h1 class="game-name">ഉള്ളിലെ ശത്രു</h1>' +
      '<div class="stage-label">' +
      esc(stage) +
      "</div></div>" +
      '<div class="meters" title="ശേഷിക്കുന്ന തെറ്റുകൾ"><div class="strikes" aria-label="strikes">' +
      pips +
      "</div>" +
      '<button class="icon-btn" id="sound-btn" type="button" aria-label="sound">' +
      (soundOn ? "♪" : "🔇") +
      "</button></div></div>"
    );
  }

  function castHTML() {
    var seats = L.getPublicPlayers(game);
    var html = '<div class="cast" role="list">';
    seats.forEach(function (p) {
      html +=
        '<div class="seat' +
        (p.isPlayer ? " you" : "") +
        (p.alive ? "" : " dead") +
        '" role="listitem">' +
        '<div class="avatar">' +
        avatarSVG(p, 46) +
        (L.isPlayerMind(game) && p.isPlayer && p.alive
          ? '<span class="badge-mind">മൈൻഡ്</span>'
          : "") +
        "</div><div class=\"nm\">" +
        esc(p.isPlayer ? "നീ" : p.name) +
        "</div></div>";
    });
    return html + "</div>";
  }

  function chatHTML() {
    var html = "";
    game.chat.forEach(function (m) {
      if (m.kind === "system") {
        html += '<div class="msg system">' + esc(m.text) + "</div>";
      } else if (m.kind === "clue") {
        html +=
          '<div class="msg clue' +
          (m.from === L.PLAYER_ID ? " you" : "") +
          '">' +
          esc(m.text) +
          "</div>";
      } else {
        html +=
          '<div class="msg' +
          (m.from === L.PLAYER_ID ? " you" : "") +
          '"><span class="who">' +
          esc(m.name) +
          "</span> " +
          esc(m.text) +
          "</div>";
      }
    });
    return html;
  }

  function cluePanel() {
    var clue = L.privateClueForPlayer(game);
    if (!clue) return "";
    var mind = L.isPlayerMind(game);
    var extra = "";
    if (mind) {
      var truth = game.stage.trueClues[L.PLAYER_ID];
      extra =
        '<p class="blurb" style="margin-top:8px">സത്യം (നിനക്ക് മാത്രം): ' +
        esc(truth ? truth.text : "") +
        " ശരിയായ ഉത്തരം: <strong>" +
        esc(formatAnswer(game.stage.puzzle, game.stage.puzzle.answer)) +
        "</strong></p>";
    }
    return (
      '<div class="clue-card"><p class="kicker">നിനക്ക് മാത്രം കാണാം</p><p>' +
      esc(clue.text) +
      "</p>" +
      extra +
      "</div>"
    );
  }

  function formatAnswer(puzzle, value) {
    if (!puzzle) return String(value);
    if (puzzle.answerType === "code") return String(value);
    var c = (puzzle.choices || []).filter(function (x) {
      return x.id === value;
    })[0];
    return c ? c.label : String(value);
  }

  function renderPlay() {
    var canChat = game.phase === "discuss" || game.phase === "answer" || game.phase === "clue";
    var showComposer = canChat || game.phase === "vote";
    app.innerHTML =
      topbarHTML() +
      castHTML() +
      '<div id="phase-panel"></div>' +
      '<div class="chat-wrap"><div class="chat" id="chat-log">' +
      chatHTML() +
      "</div>" +
      (showComposer
        ? '<form class="composer" id="chat-form"><input id="chat-in" maxlength="160" placeholder="ഇവിടെ എഴുതൂ..." autocomplete="off"' +
          (canChat ? "" : " disabled") +
          '><button class="btn" type="submit"' +
          (canChat ? "" : " disabled") +
          ">അയയ്ക്കുക</button></form>"
        : "") +
      "</div>" +
      (pendingWhisper ? whisperHTML(pendingWhisper) : "");

    document.getElementById("sound-btn").onclick = toggleSound;
    fillPhasePanel();
    bindChat();
    scrollChat(true);
    bindWhisper();
  }

  function fillPhasePanel() {
    var el = document.getElementById("phase-panel");
    if (!el) return;
    var p = game.phase;
    if (p === "clue") el.innerHTML = cluePhaseHTML();
    else if (p === "discuss") el.innerHTML = discussPhaseHTML();
    else if (p === "answer") el.innerHTML = answerPhaseHTML();
    else if (p === "answerResult") el.innerHTML = answerResultHTML();
    else if (p === "vote") el.innerHTML = votePhaseHTML();
    else if (p === "voteResult") el.innerHTML = voteResultHTML();
    else el.innerHTML = "";
    bindPhase();
  }

  function cluePhaseHTML() {
    var puzzle = game.stage.puzzle;
    return (
      '<div class="panel"><h2>' +
      esc(puzzle.title) +
      '</h2><p class="blurb">' +
      esc(puzzle.blurb) +
      "</p>" +
      cluePanel() +
      '<div class="btn-row" style="margin-top:14px"><button class="btn" id="go-discuss">ചർച്ച തുടങ്ങുക</button></div></div>'
    );
  }

  function discussPhaseHTML() {
    var shared = game.stage.shared[L.PLAYER_ID];
    var mind = L.isPlayerMind(game);
    var shareBlock = "";
    if (!shared) {
      if (mind) {
        var lie = L.suggestedLie(game.rng, game.stage.trueClues[L.PLAYER_ID] || game.stage.privateClues[L.PLAYER_ID]);
        shareBlock =
          '<p class="blurb">നീ ദി മൈൻഡ് ആണ്. ഒരു തെറ്റായ ക്ലൂ പങ്കുവെക്കുക — തിരുത്താം.</p>' +
          '<textarea class="clue-edit" id="lie-text" rows="2">' +
          esc(lie.text) +
          "</textarea>" +
          '<div class="btn-row"><button class="btn" id="share-btn">തെറ്റായ ക്ലൂ പങ്കുവെക്കുക</button></div>';
      } else {
        shareBlock =
          '<div class="btn-row"><button class="btn" id="share-btn">എന്റെ ക്ലൂ പങ്കുവെക്കുക</button></div>';
      }
    } else {
      shareBlock = '<p class="blurb">നീ ക്ലൂ പങ്കുവെച്ചു.</p>';
    }
    var elapsed = Date.now() - discussStarted;
    var canAdvance = elapsed >= discussMinMs || Object.keys(game.stage.shared).length >= 4;
    return (
      '<div class="panel"><h2>ചർച്ച</h2><p class="blurb">ക്ലൂകൾ പങ്കുവെക്കുക. ആരാണ് കള്ളം പറയുന്നത്?</p>' +
      cluePanel() +
      shareBlock +
      '<div class="btn-row"><button class="btn gold" id="go-answer"' +
      (canAdvance ? "" : " disabled") +
      ">ഉത്തരം നൽകുക</button></div></div>"
    );
  }

  function answerPhaseHTML() {
    var puzzle = game.stage.puzzle;
    var inner;
    if (puzzle.answerType === "code") {
      inner =
        '<div class="code-row">' +
        '<input id="d0" inputmode="numeric" maxlength="1" aria-label="ആദ്യ അക്കം">' +
        '<input id="d1" inputmode="numeric" maxlength="1" aria-label="രണ്ടാമത്തെ അക്കം">' +
        '<input id="d2" inputmode="numeric" maxlength="1" aria-label="അവസാന അക്കം">' +
        "</div>" +
        '<div class="btn-row"><button class="btn gold" id="submit-ans">ലോക്ക് തുറക്കുക</button></div>';
    } else {
      var cls = puzzle.id === "doors" ? "choices door-grid" : "choices";
      inner = '<div class="' + cls + '">';
      puzzle.choices.forEach(function (c) {
        inner +=
          '<button type="button" class="choice ' +
          (c.color || "") +
          (c.symbol ? " door" : "") +
          '" data-val="' +
          esc(c.id) +
          '">' +
          (c.symbol ? doorIcon(c.symbol) : "") +
          esc(c.label) +
          "</button>";
      });
      inner += "</div>";
    }
    var proposals = (game.stage.proposals || [])
      .slice(-3)
      .map(function (pr) {
        var n = L.byId(game, pr.from);
        return (n ? n.name : "") + " → " + pr.label;
      })
      .join(" · ");
    return (
      '<div class="panel"><h2>ഉത്തരം</h2><p class="blurb">' +
      esc(puzzle.blurb) +
      (proposals ? " നിർദ്ദേശങ്ങൾ: " + esc(proposals) : "") +
      "</p>" +
      cluePanel() +
      inner +
      "</div>"
    );
  }

  function lastPuzzleResult() {
    var list = game.history.puzzleResults;
    return list.length ? list[list.length - 1] : null;
  }

  function answerResultHTML() {
    var last = lastPuzzleResult();
    var ok = last && last.correct;
    var fatal = game.strikes > game.maxStrikes;
    var retry = !ok && !fatal && last && game.stage.attempts < 2 && !game.stage.forcedThrough;
    var msg = ok
      ? "ശരിയായ ഉത്തരം. വാതിൽ ഒരല്പം അഴിഞ്ഞു."
      : fatal
      ? "തെറ്റ്. ലോക്ക് ഉറച്ചു. സമയം തീർന്നു."
      : game.stage.forcedThrough
      ? "വീണ്ടും തെറ്റ്. നിങ്ങൾക്ക് മുന്നോട്ട് പോകാൻ മാത്രം വഴി ലഭിച്ചു."
      : "തെറ്റായ ഉത്തരം. ഒരവസരം കൂടി ഉണ്ട്.";
    return (
      '<div class="panel"><div class="result-banner ' +
      (ok ? "ok" : "bad") +
      '">' +
      msg +
      "</div>" +
      '<div class="btn-row"><button class="btn ' +
      (ok ? "gold" : "") +
      '" id="after-ans">' +
      (fatal ? "അവസാനം കാണുക" : retry ? "വീണ്ടും ശ്രമിക്കുക" : "വോട്ടിലേക്ക്") +
      "</button></div></div>"
    );
  }

  function votePhaseHTML() {
    var living = L.living(game).filter(function (p) {
      return !p.isPlayer;
    });
    var html =
      '<div class="panel"><h2>വോട്ട്</h2><p class="blurb">സംശയമുള്ളയാളെ പുറത്താക്കാം. തെറ്റായ ആളെയാണെങ്കിൽ ടീമിന് ഒരു തെറ്റ്. ആരെയും പുറത്താക്കാതിരിക്കുകയും ആകാം.</p><div class="vote-grid">';
    living.forEach(function (p) {
      html +=
        '<button type="button" class="vote-card" data-vote="' +
        esc(p.id) +
        '"><div class="avatar">' +
        avatarSVG(p, 36) +
        "</div><span>" +
        esc(p.name) +
        "</span></button>";
    });
    html +=
      '<button type="button" class="vote-card skip" data-vote="skip">ആരെയും പുറത്താക്കരുത്</button></div></div>';
    return html;
  }

  function voteResultHTML() {
    var v = game.lastVote;
    var lines = "";
    if (v) {
      Object.keys(v.ballots).forEach(function (id) {
        var voter = L.byId(game, id);
        var target = v.ballots[id] === "skip" ? "വിട്ടു" : (L.byId(game, v.ballots[id]) || {}).name || "";
        lines += "<div>" + esc(voter ? voter.name : id) + " → " + esc(target) + "</div>";
      });
    }
    var fatal = game.strikes > game.maxStrikes || (L.byId(game, L.PLAYER_ID) && !L.byId(game, L.PLAYER_ID).alive);
    var last = game.stageIndex >= game.puzzles.length - 1;
    var label = fatal || last ? "അവസാനം കാണുക" : "അടുത്ത ഘട്ടം";
    return (
      '<div class="panel"><h2>വോട്ട് ഫലം</h2><div class="vote-ballots">' +
      lines +
      "</div>" +
      '<div class="btn-row" style="margin-top:12px"><button class="btn gold" id="after-vote">' +
      label +
      "</button></div></div>"
    );
  }

  function whisperHTML(w) {
    return (
      '<div class="whisper-overlay" id="whisper"><div class="whisper-card"><div class="kicker">രഹസ്യ സന്ദേശം</div><p>' +
      esc(w.text) +
      '</p><button class="btn" id="dismiss-whisper">ഞാൻ കേട്ടു</button></div></div>'
    );
  }

  function bindWhisper() {
    var btn = document.getElementById("dismiss-whisper");
    if (!btn) return;
    btn.onclick = function () {
      pendingWhisper = null;
      var ov = document.getElementById("whisper");
      if (ov) ov.remove();
    };
  }

  function bindChat() {
    var form = document.getElementById("chat-form");
    if (!form) return;
    form.onsubmit = function (ev) {
      ev.preventDefault();
      var input = document.getElementById("chat-in");
      var text = (input.value || "").trim();
      if (!text) return;
      input.value = "";
      L.playerChat(game, text);
      sfx("tick");
      refreshChat();
    };
  }

  function bindPhase() {
    var goD = document.getElementById("go-discuss");
    if (goD) {
      goD.onclick = function () {
        sfx("tick");
        L.enterDiscussion(game);
        startDiscussionLoop();
        render();
      };
    }
    var share = document.getElementById("share-btn");
    if (share) {
      share.onclick = function () {
        var lieEl = document.getElementById("lie-text");
        L.playerShareClue(game, lieEl ? lieEl.value : null);
        sfx("tick");
        refreshChat();
        fillPhasePanel();
      };
    }
    var goA = document.getElementById("go-answer");
    if (goA) {
      goA.onclick = function () {
        if (goA.disabled) return;
        sfx("tick");
        clearDiscussTimer();
        L.enterAnswer(game);
        render();
      };
    }
    var d0 = document.getElementById("d0");
    if (d0) {
      ["d0", "d1", "d2"].forEach(function (id, i) {
        var el = document.getElementById(id);
        el.addEventListener("input", function () {
          el.value = el.value.replace(/\D/g, "").slice(0, 1);
          if (el.value && i < 2) document.getElementById("d" + (i + 1)).focus();
        });
        el.addEventListener("keydown", function (ev) {
          if (ev.key === "Backspace" && !el.value && i > 0) document.getElementById("d" + (i - 1)).focus();
        });
      });
    }
    var sub = document.getElementById("submit-ans");
    if (sub) {
      sub.onclick = function () {
        var code =
          (document.getElementById("d0").value || "") +
          (document.getElementById("d1").value || "") +
          (document.getElementById("d2").value || "");
        onSubmitAnswer(code);
      };
    }
    var choices = document.querySelectorAll(".choice[data-val]");
    choices.forEach(function (btn) {
      btn.onclick = function () {
        onSubmitAnswer(btn.getAttribute("data-val"));
      };
    });
    var after = document.getElementById("after-ans");
    if (after) {
      after.onclick = function () {
        var last = lastPuzzleResult();
        var fatal = game.strikes > game.maxStrikes;
        if (fatal) {
          L.finishGame(game);
          sfx("end");
          render();
          return;
        }
        var retry = last && !last.correct && game.stage.attempts < 2 && !game.stage.forcedThrough;
        if (retry) {
          L.retryAnswer(game);
          render();
          return;
        }
        sfx("vote");
        L.enterVote(game);
        render();
      };
    }
    var voteBtns = document.querySelectorAll("[data-vote]");
    voteBtns.forEach(function (btn) {
      btn.onclick = function () {
        var res = L.castPlayerVote(game, btn.getAttribute("data-vote"));
        if (!res.ok) return;
        sfx(res.vote && res.vote.wrongEjection ? "bad" : "vote");
        render();
      };
    });
    var afterV = document.getElementById("after-vote");
    if (afterV) {
      afterV.onclick = function () {
        var player = L.byId(game, L.PLAYER_ID);
        var fatal = game.strikes > game.maxStrikes || (player && !player.alive);
        var last = game.stageIndex >= game.puzzles.length - 1;
        if (fatal || last) {
          L.finishGame(game);
          sfx("end");
          render();
          return;
        }
        L.continueAfterVote(game);
        render();
      };
    }
  }

  function onSubmitAnswer(value) {
    var res = L.submitAnswer(game, value);
    if (!res.ok) {
      if (res.message) alert(res.message);
      return;
    }
    sfx(res.correct ? "ok" : "bad");
    render();
  }

  function startDiscussionLoop() {
    clearDiscussTimer();
    discussStarted = Date.now();
    discussTimer = setInterval(function () {
      if (!game || game.phase !== "discuss") {
        clearDiscussTimer();
        return;
      }
      var evs = L.tickDiscussion(game, Date.now() - discussStarted);
      var dirty = false;
      evs.forEach(function (ev) {
        if (ev.kind === "chat") {
          sfx("tick");
          dirty = true;
        }
        if (ev.kind === "whisper" && ev.whisper) {
          pendingWhisper = ev.whisper;
          sfx("whisper");
          dirty = true;
        }
      });
      // Unlock the advance button when ready
      var goA = document.getElementById("go-answer");
      if (goA && goA.disabled) {
        var elapsed = Date.now() - discussStarted;
        if (elapsed >= discussMinMs || Object.keys(game.stage.shared).length >= 4) {
          goA.disabled = false;
        }
      }
      if (dirty) {
        refreshChat();
        if (pendingWhisper && !document.getElementById("whisper")) {
          // re-render to show whisper, keep input
          var typed = (document.getElementById("chat-in") || {}).value || "";
          var lie = (document.getElementById("lie-text") || {}).value;
          render();
          var ci = document.getElementById("chat-in");
          if (ci) ci.value = typed;
          var lt = document.getElementById("lie-text");
          if (lt && lie != null) lt.value = lie;
        }
      }
    }, 250);
  }

  function refreshChat() {
    var log = document.getElementById("chat-log");
    if (!log) return;
    var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    if (game.chat.length !== lastChatCount) {
      log.innerHTML = chatHTML();
      lastChatCount = game.chat.length;
      if (atBottom) log.scrollTop = log.scrollHeight;
    }
  }

  function scrollChat(force) {
    var log = document.getElementById("chat-log");
    if (!log) return;
    lastChatCount = game.chat.length;
    if (force) log.scrollTop = log.scrollHeight;
  }

  function renderEnding() {
    clearDiscussTimer();
    var e = game.ending;
    var recap = "<div><strong>ദി മൈൻഡ്:</strong> " + esc(e.mindName);
    recap += e.playerIsMind ? " (നീ)</div>" : "</div>";
    recap +=
      "<div><strong>രക്ഷപ്പെട്ടോ:</strong> " +
      (e.escaped ? "അതെ" : "ഇല്ല") +
      " · <strong>തെറ്റുകൾ:</strong> " +
      e.strikes +
      "</div>";
    if (e.ejections.length) {
      recap +=
        "<div><strong>പുറത്താക്കിയവർ:</strong> " +
        e.ejections
          .map(function (x) {
            return esc(x.name) + (x.wasMind ? " (ദി മൈൻഡ്)" : "");
          })
          .join(", ") +
        "</div>";
    } else {
      recap += "<div><strong>പുറത്താക്കിയവർ:</strong> ആരുമില്ല</div>";
    }
    recap += "<div><strong>പസിലുകൾ:</strong> ";
    recap += e.puzzleResults
      .map(function (r, i) {
        return "ഘട്ടം " + (r.stageIndex + 1) + (r.correct ? " ✓" : " ✗");
      })
      .filter(function (x, i, a) {
        // show last attempt per stage
        return true;
      })
      .join(" · ");
    recap += "</div>";

    var people =
      '<div class="cast" style="justify-content:center">' +
      L.getPublicPlayers(game)
        .map(function (p) {
          var mark = p.id === e.mindId ? '<span class="badge-mind">മൈൻഡ്</span>' : "";
          return (
            '<div class="seat' +
            (p.alive ? "" : " dead") +
            (p.isPlayer ? " you" : "") +
            '"><div class="avatar">' +
            avatarSVG(p, 46) +
            mark +
            '</div><div class="nm">' +
            esc(p.name) +
            "</div></div>"
          );
        })
        .join("") +
      "</div>";

    app.innerHTML =
      '<div class="screen center ending">' +
      '<p class="brand">' +
      (e.playerWon ? "ഒരു അവസാനം" : "ഇരുട്ട് വിജയിച്ചു") +
      "</p>" +
      '<h1 class="title" style="font-size:clamp(28px,8vw,42px)">' +
      esc(e.title) +
      "</h1>" +
      '<div class="mood"><p class="' +
      (e.kind === "escape_with_mind" ? "twisted" : "") +
      '">' +
      esc(e.body) +
      "</p></div>" +
      people +
      '<div class="recap">' +
      recap +
      "</div>" +
      '<button class="btn wide" id="replay">വീണ്ടും കളിക്കുക</button></div>';
    document.getElementById("replay").onclick = function () {
      sfx("tick");
      game = null;
      pendingWhisper = null;
      renderIntro();
    };
  }

  renderIntro();
})();

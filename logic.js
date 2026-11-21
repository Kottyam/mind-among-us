/**
 * ഉള്ളിലെ ശത്രു — The Mind Among Us (Escape Puzzle Engine)
 * Pure JSON-serializable state & deterministic logic (no DOM).
 * Designed so solo AI teammates can be swapped for human players in future room-code multiplayer.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./puzzles.js"));
  } else {
    root.MindLogic = factory(root.MindPuzzles);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (P) {
  "use strict";

  var PLAYER_ID = "player";
  var MAX_FUSES = 3;

  var BOT_NAMES = [
    "ആര്യ",
    "അർജുൻ",
    "മീര",
    "രാഹുൽ",
    "ദിവ്യ",
    "നിഷാദ്",
    "ലക്ഷ്മി",
    "സജീവ്",
    "സ്നേഹ",
    "വിവേക്",
  ];

  var SPECIALTIES = [
    { id: "riddle", ml: "കടങ്കഥ" },
    { id: "math", ml: "ഗണിതം" },
    { id: "logic", ml: "ലോജിക്" },
    { id: "cipher", ml: "സൈഫർ" },
    { id: "sequence", ml: "ശ്രേണി" },
    { id: "word", ml: "വാക്ക്" },
    { id: "visual", ml: "കാഴ്ച" },
    { id: "memory", ml: "ഓർമ്മ" },
  ];

  var PERSONALITIES = [
    { id: "calm", ml: "ശാന്തൻ" },
    { id: "quick", ml: "വേഗത" },
    { id: "nervous", ml: "പേടി" },
    { id: "sharp", ml: "സൂക്ഷ്മത" },
  ];

  var AVATAR_PALETTE = [
    { bg: "#5a3d28", accent: "#e8c49a" },
    { bg: "#5e2226", accent: "#f0b4b4" },
    { bg: "#223b5e", accent: "#b4ccf0" },
    { bg: "#264a30", accent: "#b4e8c0" },
    { bg: "#46265a", accent: "#d8b4f0" },
  ];

  var CHAMBER_TEMPLATES = [
    { name: "ചേംബർ 1 — ഇരുമ്പ് വാതിൽ", subtitle: "ആദ്യത്തെ ലോക്ക് തുറക്കുക", slots: 5, playerSlots: 3, swaps: 2 },
    { name: "ചേംബർ 2 — രഹസ്യ സേഫ്", subtitle: "കോഡുകൾ കൂട്ടിച്ചേർക്കുക", slots: 6, playerSlots: 3, swaps: 2 },
    { name: "ചേംബർ 3 — ഒടുവിലത്തെ വാതിൽ", subtitle: "പുറത്തേക്കുള്ള അവസാന പൂട്ട്", slots: 6, playerSlots: 3, swaps: 2 },
  ];

  // Deterministic PRNG using plain integer state inside game object (JSON-safe)
  function nextRand(state) {
    var s = (state.rngState | 0) || 1;
    s = (s + 0x6d2b79f5) | 0;
    state.rngState = s;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function randInt(state, min, max) {
    return min + Math.floor(nextRand(state) * (max - min + 1));
  }

  function pick(state, arr) {
    return arr[Math.floor(nextRand(state) * arr.length)];
  }

  function shuffle(state, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(nextRand(state) * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function drawPuzzleId(state, preferredCategory) {
    var used = {};
    state.usedPuzzleIds.forEach(function (id) {
      used[id] = true;
    });
    var pool = P.ALL_PUZZLES.filter(function (p) {
      return !used[p.id];
    });
    if (pool.length === 0) {
      state.usedPuzzleIds = [];
      pool = P.ALL_PUZZLES.slice();
    }
    if (preferredCategory) {
      var catPool = pool.filter(function (p) {
        return p.category === preferredCategory;
      });
      if (catPool.length > 0 && nextRand(state) < 0.65) pool = catPool;
    }
    var chosen = pick(state, pool);
    state.usedPuzzleIds.push(chosen.id);
    return chosen.id;
  }

  function buildChamber(state, idx, cfg, bots) {
    var slots = [];
    var playerSlots = cfg.playerSlots;
    var botList = shuffle(state, bots);

    for (var s = 0; s < cfg.slots; s++) {
      var isPlayerSlot = s < playerSlots;
      var owner = isPlayerSlot ? { id: PLAYER_ID, specialty: null } : botList[(s - playerSlots) % botList.length];
      var puzzleId = drawPuzzleId(state, owner.specialty ? owner.specialty.id : null);
      var digit = randInt(state, 0, 9);
      slots.push({
        id: "c" + idx + "-s" + s,
        chamberIndex: idx,
        slotIndex: s,
        ownerId: owner.id,
        puzzleId: puzzleId,
        vaultDigit: digit,
        status: isPlayerSlot ? "locked" : "solving",
        progress: isPlayerSlot ? 0 : randInt(state, 10, 30),
        solveDuration: isPlayerSlot ? 0 : randInt(state, 9, 17),
        solvedBy: null,
        claimedAnswer: null,
        corrupted: false,
        usedHint: false,
        hintData: null,
      });
    }

    // Shuffle slot positions slightly so player & bot slots are interleaved in the vault ring
    slots = shuffle(state, slots);
    slots.forEach(function (sl, i) {
      sl.slotIndex = i;
    });

    return {
      index: idx,
      name: cfg.name,
      subtitle: cfg.subtitle,
      slots: slots,
      unlocked: false,
      swapsLeft: cfg.swaps,
      lastFault: null,
    };
  }

  function createSession(opts) {
    opts = opts || {};
    var mode = opts.mode === "marathon" ? "marathon" : "escape";
    var seed = opts.seed != null ? (opts.seed >>> 0) || 1 : ((Date.now() % 2147483647) || 1);
    var playerName = String(opts.playerName || "അമൽ").trim() || "അമൽ";

    var state = {
      version: 2,
      mode: mode,
      roomCode: opts.roomCode || null,
      rngState: seed,
      seed: seed,
      status: "playing", // intro | playing | accuse | ended
      timerSec: mode === "escape" ? 600 : 1200,
      elapsedSec: 0,
      fuses: MAX_FUSES,
      maxFuses: MAX_FUSES,
      participants: [],
      mindId: null,
      mindExposed: false,
      chambers: [],
      currentChamberIndex: 0,
      activeSlotId: null,
      usedPuzzleIds: [],
      lastToast: null,
      ending: null,
      stats: {
        solvedByPlayer: 0,
        solvedByBots: 0,
        helpedTeammates: 0,
        askedForHelp: 0,
        wrongAttempts: 0,
        swapsUsed: 0,
        mindSabotagesCaught: 0,
      },
    };

    var names = shuffle(state, BOT_NAMES).slice(0, 4);
    var specs = shuffle(state, SPECIALTIES).slice(0, 4);
    var pers = shuffle(state, PERSONALITIES);

    state.participants.push({
      id: PLAYER_ID,
      name: playerName,
      seat: 0,
      kind: "human",
      specialty: null,
      personality: null,
      color: AVATAR_PALETTE[0],
      avatarKind: 0,
      lockedOut: false,
      isMind: false,
      solvedCount: 0,
      helpCooldownSec: 0,
      bubble: null,
    });

    for (var i = 0; i < 4; i++) {
      state.participants.push({
        id: "bot-" + (i + 1),
        name: names[i],
        seat: i + 1,
        kind: "bot",
        specialty: specs[i],
        personality: pers[i % pers.length],
        color: AVATAR_PALETTE[i + 1],
        avatarKind: i + 1,
        lockedOut: false,
        isMind: false,
        solvedCount: 0,
        helpCooldownSec: 0,
        bubble: null,
      });
    }

    var bots = state.participants.filter(function (p) {
      return p.kind === "bot";
    });
    var mindBot = pick(state, bots);
    mindBot.isMind = true;
    state.mindId = mindBot.id;

    if (mode === "escape") {
      CHAMBER_TEMPLATES.forEach(function (tpl, idx) {
        state.chambers.push(buildChamber(state, idx, tpl, bots));
      });
    } else {
      // Marathon: 20 locks × 5 slots = 100 puzzles!
      for (var m = 0; m < 20; m++) {
        state.chambers.push(
          buildChamber(
            state,
            m,
            {
              name: "ലോക്ക് " + (m + 1) + " / 20",
              subtitle: "100 പസിൽ ചലഞ്ച്",
              slots: 5,
              playerSlots: 3,
              swaps: 1,
            },
            bots
          )
        );
      }
    }

    // Select first player-owned slot in chamber 0
    pickNextActiveSlot(state);
    return state;
  }

  function getParticipant(state, id) {
    for (var i = 0; i < state.participants.length; i++) {
      if (state.participants[i].id === id) return state.participants[i];
    }
    return null;
  }

  function getCurrentChamber(state) {
    return state.chambers[state.currentChamberIndex] || null;
  }

  function findSlot(state, slotId) {
    for (var c = 0; c < state.chambers.length; c++) {
      var ch = state.chambers[c];
      for (var s = 0; s < ch.slots.length; s++) {
        if (ch.slots[s].id === slotId) return ch.slots[s];
      }
    }
    return null;
  }

  function pickNextActiveSlot(state) {
    var ch = getCurrentChamber(state);
    if (!ch) return null;
    // Prefer player's locked slot, then any needs_help, then any locked
    var order = ["locked", "needs_help", "solving", "solved"];
    for (var k = 0; k < order.length; k++) {
      var st = order[k];
      for (var i = 0; i < ch.slots.length; i++) {
        var sl = ch.slots[i];
        if (sl.status === st && (st !== "locked" || sl.ownerId === PLAYER_ID)) {
          state.activeSlotId = sl.id;
          return sl;
        }
      }
      for (var j = 0; j < ch.slots.length; j++) {
        if (ch.slots[j].status === st) {
          state.activeSlotId = ch.slots[j].id;
          return ch.slots[j];
        }
      }
    }
    state.activeSlotId = ch.slots[0] ? ch.slots[0].id : null;
    return null;
  }

  function selectSlot(state, slotId) {
    var sl = findSlot(state, slotId);
    if (!sl) return null;
    state.activeSlotId = sl.id;
    return sl;
  }

  function normalizeAnswer(val) {
    return String(val == null ? "" : val).trim();
  }

  function submitSlotAnswer(state, slotId, answer) {
    if (state.status !== "playing") return { ok: false, reason: "not-playing" };
    var sl = findSlot(state, slotId);
    if (!sl) return { ok: false, reason: "missing-slot" };
    var puz = P.byId(sl.puzzleId);
    if (!puz) return { ok: false, reason: "missing-puzzle" };

    var given = normalizeAnswer(answer);
    if (!given) return { ok: false, reason: "empty" };

    var wasNeedsHelp = sl.status === "needs_help";
    var wasCorrupted = !!sl.corrupted;
    var correct = given === normalizeAnswer(puz.answer);

    if (correct) {
      sl.status = "solved";
      sl.solvedBy = PLAYER_ID;
      sl.claimedAnswer = given;
      sl.corrupted = false;
      sl.progress = 100;
      state.stats.solvedByPlayer += 1;
      if (wasNeedsHelp) {
        state.stats.helpedTeammates += 1;
        state.timerSec += 10;
        var owner = getParticipant(state, sl.ownerId);
        if (owner) owner.bubble = "നന്ദി! ആ പസിൽ ശരിയായി.";
      }
      if (wasCorrupted) {
        state.stats.mindSabotagesCaught += 1;
      }
      var player = getParticipant(state, PLAYER_ID);
      if (player) player.solvedCount += 1;

      pickNextActiveSlot(state);
      return {
        ok: true,
        correct: true,
        digit: sl.vaultDigit,
        wasNeedsHelp: wasNeedsHelp,
        wasCorrupted: wasCorrupted,
        chamberReady: isChamberReady(state),
      };
    }

    // Wrong answer
    state.stats.wrongAttempts += 1;
    state.fuses -= 1;
    if (state.fuses <= 0) {
      state.fuses = 0;
      finishSession(state, "fuses_out");
      return { ok: true, correct: false, fatal: true, fuses: 0 };
    }
    return { ok: true, correct: false, fatal: false, fuses: state.fuses };
  }

  function isChamberReady(state) {
    var ch = getCurrentChamber(state);
    if (!ch) return false;
    return ch.slots.every(function (sl) {
      return sl.status === "solved";
    });
  }

  function askTeammateHelp(state, slotId, teammateId) {
    if (state.status !== "playing") return { ok: false, reason: "not-playing" };
    var sl = findSlot(state, slotId);
    var bot = getParticipant(state, teammateId);
    if (!sl || !bot || bot.kind !== "bot") return { ok: false, reason: "invalid" };
    if (bot.lockedOut) return { ok: false, reason: "locked-out" };
    if (bot.helpCooldownSec > 0) {
      return { ok: false, reason: "cooldown", waitSec: Math.ceil(bot.helpCooldownSec) };
    }
    var puz = P.byId(sl.puzzleId);
    if (!puz) return { ok: false, reason: "missing-puzzle" };

    bot.helpCooldownSec = 10;
    sl.usedHint = true;
    state.stats.askedForHelp += 1;

    var isMind = !!bot.isMind;
    var lie = isMind && nextRand(state) < 0.7;
    var isSpecialty = bot.specialty && bot.specialty.id === puz.category;

    var hintText;
    var suggestedAnswer = null;

    if (lie) {
      hintText = puz.badHint || "ഇത് കുറച്ച് കടുപ്പമാണ് — ശ്രദ്ധിച്ച് നോക്കൂ.";
      suggestedAnswer = puz.wrongOption || null;
      bot.bubble = suggestedAnswer ? "എനിക്ക് തോന്നുന്നത് " + suggestedAnswer + " ആണ്." : hintText;
    } else {
      hintText = puz.hint;
      if (isSpecialty || nextRand(state) < 0.55) {
        suggestedAnswer = puz.answer;
        bot.bubble = "ഉത്തരം '" + suggestedAnswer + "' ആണെന്ന് ഉറപ്പ്!";
      } else {
        bot.bubble = "സൂചന: " + hintText;
      }
    }

    var data = {
      teammateId: bot.id,
      teammateName: bot.name,
      hintText: hintText,
      suggestedAnswer: suggestedAnswer,
      isSpecialty: isSpecialty,
      isDeceptive: lie,
    };
    sl.hintData = data;
    return { ok: true, help: data };
  }

  function swapSlotPuzzle(state, slotId) {
    if (state.status !== "playing") return { ok: false, reason: "not-playing" };
    var ch = getCurrentChamber(state);
    var sl = findSlot(state, slotId);
    if (!ch || !sl || sl.status === "solved") return { ok: false, reason: "invalid" };
    if (ch.swapsLeft <= 0) return { ok: false, reason: "no-swaps" };

    ch.swapsLeft -= 1;
    state.stats.swapsUsed += 1;
    sl.puzzleId = drawPuzzleId(state, null);
    sl.usedHint = false;
    sl.hintData = null;
    sl.corrupted = false;
    if (sl.ownerId !== PLAYER_ID && sl.status === "needs_help") {
      sl.ownerId = PLAYER_ID;
      sl.status = "locked";
    }
    return { ok: true, swapsLeft: ch.swapsLeft, puzzleId: sl.puzzleId };
  }

  function tickSession(state, dtSec) {
    if (state.status !== "playing") return { events: [] };
    dtSec = Math.max(0, Math.min(5, dtSec || 0));
    state.timerSec = Math.max(0, state.timerSec - dtSec);
    state.elapsedSec += dtSec;

    if (state.timerSec <= 0) {
      finishSession(state, "timeout");
      return { events: [{ kind: "timeout" }] };
    }

    var events = [];
    state.participants.forEach(function (p) {
      if (p.helpCooldownSec > 0) {
        p.helpCooldownSec = Math.max(0, p.helpCooldownSec - dtSec);
      }
    });

    var ch = getCurrentChamber(state);
    if (!ch) return { events: events };

    ch.slots.forEach(function (sl) {
      if (sl.status !== "solving") return;
      var owner = getParticipant(state, sl.ownerId);
      if (!owner || owner.lockedOut) {
        // Reassign stuck locked-out bot's slot to player
        sl.ownerId = PLAYER_ID;
        sl.status = "locked";
        events.push({ kind: "reassigned", slotId: sl.id });
        return;
      }

      var speed = owner.personality && owner.personality.id === "quick" ? 1.25 : 1.0;
      sl.progress += (100 / sl.solveDuration) * dtSec * speed;

      // Halfway through, maybe get stuck and ask the player for help!
      if (sl.progress >= 48 && sl.progress < 62 && !sl._stuckChecked) {
        sl._stuckChecked = true;
        if (!owner.isMind && nextRand(state) < 0.35) {
          sl.status = "needs_help";
          owner.bubble = "ഈ പസിൽ കുഴപ്പിക്കുന്നു — സഹായിക്കാമോ?";
          events.push({ kind: "needs_help", slotId: sl.id, botId: owner.id });
          return;
        }
      }

      if (sl.progress >= 100) {
        sl.progress = 100;
        sl.status = "solved";
        sl.solvedBy = owner.id;
        owner.solvedCount += 1;
        state.stats.solvedByBots += 1;
        var puz = P.byId(sl.puzzleId);
        // If owner is The Mind, ~45% chance they secretly lock a wrong answer!
        if (owner.isMind && puz && nextRand(state) < 0.45) {
          sl.claimedAnswer = puz.wrongOption;
          sl.corrupted = true;
          owner.bubble = "എന്റെ കോഡ് ശരിയാക്കി: " + puz.wrongOption;
        } else {
          sl.claimedAnswer = puz ? puz.answer : String(sl.vaultDigit);
          sl.corrupted = false;
          owner.bubble = "പിൻ #" + (sl.slotIndex + 1) + " തുറന്നു!";
        }
        events.push({ kind: "bot_solved", slotId: sl.id, botId: owner.id });
      }
    });

    return { events: events };
  }

  function unlockChamber(state) {
    if (state.status !== "playing") return { ok: false, reason: "not-playing" };
    var ch = getCurrentChamber(state);
    if (!ch || !isChamberReady(state)) return { ok: false, reason: "incomplete" };

    // Check for any Mind-corrupted slots!
    var corrupted = ch.slots.filter(function (sl) {
      return sl.corrupted;
    });
    if (corrupted.length > 0) {
      var bad = corrupted[0];
      var culprit = getParticipant(state, bad.solvedBy);
      bad.status = "locked";
      bad.corrupted = false;
      bad.solvedBy = null;
      bad.claimedAnswer = null;
      bad.ownerId = PLAYER_ID;
      bad.progress = 0;
      state.activeSlotId = bad.id;
      state.stats.mindSabotagesCaught += 1;
      ch.lastFault = {
        slotId: bad.id,
        slotIndex: bad.slotIndex,
        culpritId: culprit ? culprit.id : null,
        culpritName: culprit ? culprit.name : "",
      };
      if (culprit) culprit.bubble = "അയ്യോ... എനിക്ക് കണക്ക് തെറ്റിപ്പോയി!";
      return {
        ok: true,
        unlocked: false,
        sabotageDetected: true,
        fault: ch.lastFault,
      };
    }

    ch.unlocked = true;
    ch.lastFault = null;
    if (state.currentChamberIndex >= state.chambers.length - 1) {
      if (!state.mindExposed) {
        state.status = "accuse";
        return { ok: true, unlocked: true, next: "accuse" };
      }
      finishSession(state, "escaped");
      return { ok: true, unlocked: true, next: "ended" };
    }

    state.currentChamberIndex += 1;
    state.timerSec += 30;
    pickNextActiveSlot(state);
    return {
      ok: true,
      unlocked: true,
      next: "nextChamber",
      chamberIndex: state.currentChamberIndex,
    };
  }

  function accuseParticipant(state, participantId) {
    if (state.status !== "playing" && state.status !== "accuse") {
      return { ok: false, reason: "invalid-phase" };
    }
    var target = getParticipant(state, participantId);
    if (!target || target.kind !== "bot" || target.lockedOut) {
      return { ok: false, reason: "invalid-target" };
    }

    var finalShowdown = state.status === "accuse";
    target.lockedOut = true;

    if (target.isMind) {
      state.mindExposed = true;
      state.timerSec += 30;
      target.bubble = "നിങ്ങൾ എന്നെ കണ്ടെത്തി...";
      // Reveal any corrupted slot in current chamber
      var ch = getCurrentChamber(state);
      if (ch) {
        ch.slots.forEach(function (sl) {
          if (sl.corrupted) {
            sl.status = "locked";
            sl.corrupted = false;
            sl.ownerId = PLAYER_ID;
            sl.solvedBy = null;
            sl.claimedAnswer = null;
          } else if (sl.ownerId === target.id && sl.status !== "solved") {
            sl.ownerId = PLAYER_ID;
            sl.status = "locked";
          }
        });
      }
      if (finalShowdown) {
        finishSession(state, "escaped_caught");
      }
      return { ok: true, caughtMind: true, targetId: target.id, targetName: target.name };
    }

    // Wrong accusation
    state.fuses -= 1;
    target.bubble = "ഞാനല്ലായിരുന്നു ഉള്ളിലെ ശത്രു!";
    var chNow = getCurrentChamber(state);
    if (chNow) {
      chNow.slots.forEach(function (sl) {
        if (sl.ownerId === target.id && sl.status !== "solved") {
          sl.ownerId = PLAYER_ID;
          sl.status = "locked";
        }
      });
    }
    if (finalShowdown) {
      finishSession(state, state.fuses <= 0 ? "fuses_out" : "escaped_missed_mind");
      return { ok: true, caughtMind: false, final: true, fuses: state.fuses };
    }
    if (state.fuses <= 0) {
      state.fuses = 0;
      finishSession(state, "fuses_out");
      return { ok: true, caughtMind: false, fatal: true, fuses: 0 };
    }
    return { ok: true, caughtMind: false, fatal: false, fuses: state.fuses };
  }

  function skipFinalAccusation(state) {
    if (state.status !== "accuse") return null;
    return finishSession(state, "escaped_missed_mind");
  }

  function finishSession(state, reason) {
    state.status = "ended";
    var mind = getParticipant(state, state.mindId);
    var escaped = reason === "escaped" || reason === "escaped_caught" || reason === "escaped_missed_mind";
    var title, body;
    if (reason === "escaped" || reason === "escaped_caught") {
      title = "നിങ്ങൾ രക്ഷപ്പെട്ടു!";
      body =
        "എല്ലാ വാതിലുകളും തുറന്നു. ഉള്ളിലെ ശത്രു " +
        (mind ? mind.name : "") +
        " ആയിരുന്നു — നിങ്ങൾ അവരെ കൃത്യമായി കണ്ടെത്തി!";
    } else if (reason === "escaped_missed_mind") {
      title = "വാതിൽ തുറന്നു... പക്ഷേ";
      body =
        "നിങ്ങൾ പുറത്തെത്തി. പക്ഷേ ഉള്ളിലെ ശത്രു " +
        (mind ? mind.name : "") +
        " ആയിരുന്നു — അവരും കൂടെ പുറത്തിറങ്ങി!";
    } else if (reason === "timeout") {
      title = "സമയം തീർന്നു";
      body =
        "ലോക്കുകൾ പൂർത്തിയാക്കാൻ കഴിഞ്ഞില്ല. ഇരുട്ടിൽ " +
        (mind ? mind.name : "") +
        " (ഉള്ളിലെ ശത്രു) ചിരിക്കുന്നു.";
    } else {
      title = "വൈദ്യുതി നിലച്ചു";
      body =
        "ഫ്യൂസുകൾ എല്ലാം പൊട്ടി. വാതിൽ അടഞ്ഞു. ഉള്ളിലെ ശത്രു " +
        (mind ? mind.name : "") +
        " ആയിരുന്നു.";
    }
    state.ending = {
      reason: reason,
      escaped: escaped,
      mindCaught: !!state.mindExposed,
      mindId: state.mindId,
      mindName: mind ? mind.name : "",
      title: title,
      body: body,
      elapsedSec: Math.round(state.elapsedSec),
      stats: JSON.parse(JSON.stringify(state.stats)),
    };
    return state;
  }

  return {
    PLAYER_ID: PLAYER_ID,
    MAX_FUSES: MAX_FUSES,
    SPECIALTIES: SPECIALTIES,
    createSession: createSession,
    getParticipant: getParticipant,
    getCurrentChamber: getCurrentChamber,
    findSlot: findSlot,
    selectSlot: selectSlot,
    pickNextActiveSlot: pickNextActiveSlot,
    submitSlotAnswer: submitSlotAnswer,
    isChamberReady: isChamberReady,
    askTeammateHelp: askTeammateHelp,
    swapSlotPuzzle: swapSlotPuzzle,
    tickSession: tickSession,
    unlockChamber: unlockChamber,
    accuseParticipant: accuseParticipant,
    skipFinalAccusation: skipFinalAccusation,
    finishSession: finishSession,
  };
});

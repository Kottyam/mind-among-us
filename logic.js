/**
 * ഉള്ളിലെ ശത്രു — The Mind Among Us
 * Pure game logic (no DOM). Works in the browser and in Node tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MindLogic = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var NAME_POOL = [
    "അനിൽ",
    "രേഖ",
    "സജീവ്",
    "മീര",
    "ഫൈസൽ",
    "ദിവ്യ",
    "രാജേഷ്",
    "ലക്ഷ്മി",
    "നിഷാദ്",
    "സ്മിത",
    "അരുൺ",
    "ജെസി",
  ];

  var PERSONALITIES = [
    {
      id: "suspector",
      label: "സംശയി",
      trait: "പെട്ടെന്ന് സംശയിക്കുന്നവൻ",
    },
    {
      id: "logical",
      label: "ശാന്തൻ",
      trait: "ശാന്തനും യുക്തിമാനും",
    },
    {
      id: "blamer",
      label: "കുറ്റപ്പെടുത്തുന്നവൻ",
      trait: "എപ്പോഴും ഒരാളെ കുറ്റപ്പെടുത്തും",
    },
    {
      id: "nervous",
      label: "ഭീതിയുള്ളവൻ",
      trait: "നിശബ്ദനും പേടിയുള്ളവനും",
    },
    {
      id: "eager",
      label: "സഹായി",
      trait: "ആവേശത്തോടെ സഹായിക്കുന്നവൻ",
    },
  ];

  var AVATAR_PALETTE = [
    { bg: "#6b2a2a", accent: "#e8b4b4" },
    { bg: "#2a3d6b", accent: "#b4c4e8" },
    { bg: "#2d4a2d", accent: "#b8e0b8" },
    { bg: "#4a2d5c", accent: "#d4b8e8" },
    { bg: "#6b4a1e", accent: "#e8d0a0" },
    { bg: "#1e4a4a", accent: "#a0e0d8" },
  ];

  var BOXES = [
    { id: "red", ml: "ചുവപ്പ്", en: "Red" },
    { id: "blue", ml: "നീല", en: "Blue" },
    { id: "gold", ml: "സ്വർണം", en: "Gold" },
  ];

  var DOORS = [
    { id: "left", ml: "ഇടത്", symbol: "serpent", symbolMl: "സർപ്പം" },
    { id: "middle", ml: "മധ്യം", symbol: "eye", symbolMl: "കണ്ണ്" },
    { id: "right", ml: "വലത്", symbol: "moon", symbolMl: "ചന്ദ്രൻ" },
  ];

  var MAX_STRIKES = 2;
  var PLAYER_ID = "player";

  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function rng() {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function shuffle(rng, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function sample(rng, arr, n) {
    return shuffle(rng, arr).slice(0, n);
  }

  function uid(prefix, i) {
    return prefix + "-" + i;
  }

  function living(state) {
    return state.players.filter(function (p) {
      return p.alive;
    });
  }

  function byId(state, id) {
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].id === id) return state.players[i];
    }
    return null;
  }

  function othersAlive(state, id) {
    return living(state).filter(function (p) {
      return p.id !== id;
    });
  }

  function leftOf(state, id) {
    var seats = state.seats.filter(function (sid) {
      return byId(state, sid) && byId(state, sid).alive;
    });
    var idx = seats.indexOf(id);
    if (idx < 0) return null;
    return seats[(idx + 1) % seats.length];
  }

  function clueText(clue) {
    return clue.text;
  }

  function mutateClue(rng, clue) {
    var c = JSON.parse(JSON.stringify(clue));
    c.true = false;
    if (c.type === "digit") {
      var nv = c.value;
      var guard = 0;
      while (nv === c.value && guard++ < 20) nv = randInt(rng, c.pos === 0 ? 1 : 0, 9);
      c.value = nv;
      var posWord = ["ആദ്യ", "രണ്ടാമത്തെ", "അവസാന"][c.pos];
      c.text = posWord + " അക്കം " + c.value + " ആണ്.";
    } else if (c.type === "sum") {
      c.value = c.value + (rng() < 0.5 ? 2 : -2);
      if (c.value < 3) c.value = c.value + 4;
      c.text = "മൂന്ന് അക്കങ്ങളുടെ തുക " + c.value + " ആണ്.";
    } else if (c.type === "parity") {
      c.odd = !c.odd;
      c.text = c.odd
        ? "രണ്ടാമത്തെ അക്കം ഒറ്റസംഖ്യയാണ്."
        : "രണ്ടാമത്തെ അക്കം ഇരട്ടസംഖ്യയാണ്.";
    } else if (c.type === "contains") {
      if (c.present) {
        var other = randInt(rng, 0, 9);
        if (other === c.value) other = (other + 3) % 10;
        c.value = other;
        c.text = "കോഡിൽ " + c.value + " ഉണ്ട്.";
      } else {
        c.present = true;
        c.text = "കോഡിൽ " + c.value + " ഉണ്ട്.";
      }
    } else if (c.type === "compare") {
      c.greater = !c.greater;
      c.text = c.greater
        ? "ആദ്യ അക്കം രണ്ടാമത്തേതിനേക്കാൾ വലുതാണ്."
        : "ആദ്യ അക്കം രണ്ടാമത്തേതിനേക്കാൾ ചെറുതോ തുല്യമോ ആണ്.";
    } else if (c.type === "box_not") {
      var otherBox = pick(
        rng,
        BOXES.filter(function (b) {
          return b.id !== c.color;
        })
      );
      c.color = otherBox.id;
      c.text = "കീ " + otherBox.ml + " പെട്ടിയിലല്ല.";
    } else if (c.type === "box_is") {
      var wrong = pick(
        rng,
        BOXES.filter(function (b) {
          return b.id !== c.color;
        })
      );
      c.color = wrong.id;
      c.text = "കീ " + wrong.ml + " പെട്ടിയിലാണ്.";
    } else if (c.type === "box_or") {
      c.colors = shuffle(rng, BOXES.map(function (b) { return b.id; })).slice(0, 2);
      var names = c.colors.map(function (id) {
        return BOXES.filter(function (b) { return b.id === id; })[0].ml;
      });
      c.text = "കീ " + names[0] + " പെട്ടിയിലോ " + names[1] + " പെട്ടിയിലോ ആണ്.";
    } else if (c.type === "door_not") {
      var od = pick(
        rng,
        DOORS.filter(function (d) {
          return d.id !== c.door;
        })
      );
      c.door = od.id;
      c.text = od.ml + " വാതിൽ (" + od.symbolMl + ") സുരക്ഷിതമല്ല.";
    } else if (c.type === "door_is") {
      var wd = pick(
        rng,
        DOORS.filter(function (d) {
          return d.id !== c.door;
        })
      );
      c.door = wd.id;
      c.text = "രക്ഷപ്പെടാനുള്ള വാതിൽ " + wd.ml + " ഭാഗത്താണ് (" + wd.symbolMl + ").";
    } else if (c.type === "door_symbol") {
      var ws = pick(
        rng,
        DOORS.filter(function (d) {
          return d.symbol !== c.symbol;
        })
      );
      c.symbol = ws.symbol;
      c.text = ws.symbolMl + " അടയാളമുള്ള വാതിൽ തുറക്കൂ.";
    } else {
      c.text = "ഈ ക്ലൂ വിശ്വസിക്കരുത് — എല്ലാം തെറ്റാണ്.";
    }
    return c;
  }

  function generateCodePuzzle(rng) {
    var d0 = randInt(rng, 1, 9);
    var d1 = randInt(rng, 0, 9);
    var d2 = randInt(rng, 0, 9);
    var digits = [d0, d1, d2];
    var code = "" + d0 + d1 + d2;
    var sum = d0 + d1 + d2;
    var unused = [];
    for (var n = 0; n <= 9; n++) {
      if (digits.indexOf(n) < 0) unused.push(n);
    }
    var missing = unused.length ? pick(rng, unused) : (d0 + 3) % 10;

    var pool = [
      { type: "digit", pos: 0, value: d0, true: true, text: "ആദ്യ അക്കം " + d0 + " ആണ്." },
      { type: "digit", pos: 1, value: d1, true: true, text: "രണ്ടാമത്തെ അക്കം " + d1 + " ആണ്." },
      { type: "digit", pos: 2, value: d2, true: true, text: "അവസാന അക്കം " + d2 + " ആണ്." },
      { type: "sum", value: sum, true: true, text: "മൂന്ന് അക്കങ്ങളുടെ തുക " + sum + " ആണ്." },
      {
        type: "parity",
        pos: 1,
        odd: d1 % 2 === 1,
        true: true,
        text:
          d1 % 2 === 1
            ? "രണ്ടാമത്തെ അക്കം ഒറ്റസംഖ്യയാണ്."
            : "രണ്ടാമത്തെ അക്കം ഇരട്ടസംഖ്യയാണ്.",
      },
      {
        type: "contains",
        value: pick(rng, digits),
        present: true,
        true: true,
        text: "കോഡിൽ " + pick(rng, digits) + " ഉണ്ട്.",
      },
      {
        type: "contains",
        value: missing,
        present: false,
        true: true,
        text: "കോഡിൽ " + missing + " ഇല്ല.",
      },
      {
        type: "compare",
        greater: d0 > d1,
        true: true,
        text:
          d0 > d1
            ? "ആദ്യ അക്കം രണ്ടാമത്തേതിനേക്കാൾ വലുതാണ്."
            : "ആദ്യ അക്കം രണ്ടാമത്തേതിനേക്കാൾ ചെറുതോ തുല്യമോ ആണ്.",
      },
    ];
    // Fix contains-true text to match value field consistently
    for (var i = 0; i < pool.length; i++) {
      if (pool[i].type === "contains" && pool[i].present) {
        pool[i].value = digits[i % 3];
        pool[i].text = "കോഡിൽ " + pool[i].value + " ഉണ്ട്.";
      }
    }

    return {
      id: "lock",
      title: "ഘട്ടം 1 — ലോക്ക്",
      blurb: "ഇരുമ്പ് വാതിലിൽ ഒരു മൂന്നക്ക കോഡ് ലോക്ക്. ഓരോരുത്തർക്കും ഒരു ക്ലൂ കിട്ടി — പക്ഷേ എല്ലാം സത്യമാണോ?",
      answer: code,
      answerType: "code",
      cluePool: pool,
    };
  }

  function generateBoxPuzzle(rng) {
    var answer = pick(rng, BOXES);
    var others = BOXES.filter(function (b) {
      return b.id !== answer.id;
    });
    var a = others[0];
    var b = others[1];
    var pool = [
      {
        type: "box_not",
        color: a.id,
        true: true,
        text: "കീ " + a.ml + " പെട്ടിയിലല്ല.",
      },
      {
        type: "box_not",
        color: b.id,
        true: true,
        text: "കീ " + b.ml + " പെട്ടിയിലല്ല.",
      },
      {
        type: "box_is",
        color: answer.id,
        true: true,
        text: "കീ " + answer.ml + " പെട്ടിയിലാണ്.",
      },
      {
        type: "box_or",
        colors: [answer.id, a.id],
        true: true,
        text: "കീ " + answer.ml + " പെട്ടിയിലോ " + a.ml + " പെട്ടിയിലോ ആണ്.",
      },
      {
        type: "box_or",
        colors: [answer.id, b.id],
        true: true,
        text: "കീ " + answer.ml + " പെട്ടിയിലോ " + b.ml + " പെട്ടിയിലോ ആണ്.",
      },
      {
        type: "box_not",
        color: a.id,
        true: true,
        text: a.ml + " പെട്ടി തുറന്നാൽ വെറുതെയാണ്.",
      },
    ];
    return {
      id: "boxes",
      title: "ഘട്ടം 2 — മൂന്ന് പെട്ടികൾ",
      blurb: "മേശപ്പുറത്ത് മൂന്ന് പെട്ടികൾ: ചുവപ്പ്, നീല, സ്വർണം. കീ ഒന്നിൽ മാത്രം. ഓരോ കുറിപ്പും ഒരാൾക്ക് മാത്രം കിട്ടി.",
      answer: answer.id,
      answerType: "choice",
      choices: BOXES.map(function (box) {
        return { id: box.id, label: box.ml + " പെട്ടി", color: box.id };
      }),
      cluePool: pool,
    };
  }

  function generateDoorPuzzle(rng) {
    var answer = pick(rng, DOORS);
    var others = DOORS.filter(function (d) {
      return d.id !== answer.id;
    });
    var pool = [
      {
        type: "door_is",
        door: answer.id,
        true: true,
        text: "രക്ഷപ്പെടാനുള്ള വാതിൽ " + answer.ml + " ഭാഗത്താണ് (" + answer.symbolMl + ").",
      },
      {
        type: "door_symbol",
        symbol: answer.symbol,
        true: true,
        text: answer.symbolMl + " അടയാളമുള്ള വാതിൽ തുറക്കൂ.",
      },
      {
        type: "door_not",
        door: others[0].id,
        true: true,
        text: others[0].ml + " വാതിൽ (" + others[0].symbolMl + ") സുരക്ഷിതമല്ല.",
      },
      {
        type: "door_not",
        door: others[1].id,
        true: true,
        text: others[1].ml + " വാതിൽ (" + others[1].symbolMl + ") മരണമാണ്.",
      },
      {
        type: "door_not",
        door: others[0].id,
        true: true,
        text: others[0].symbolMl + " അടയാളം ഒഴിവാക്കുക.",
      },
      {
        type: "door_is",
        door: answer.id,
        true: true,
        text: answer.ml + " വാതിലിന് പിന്നിൽ വെളിച്ചമുണ്ട്.",
      },
    ];
    return {
      id: "doors",
      title: "ഘട്ടം 3 — മൂന്ന് വാതിലുകൾ",
      blurb: "ഒടുവിലത്തെ മുറി. മൂന്ന് വാതിലുകൾ: സർപ്പം, കണ്ണ്, ചന്ദ്രൻ. ഒന്ന് മാത്രം പുറത്തേക്കുള്ള വഴി.",
      answer: answer.id,
      answerType: "choice",
      choices: DOORS.map(function (d) {
        return {
          id: d.id,
          label: d.ml + " — " + d.symbolMl,
          symbol: d.symbol,
        };
      }),
      cluePool: pool,
    };
  }

  function dealClues(rng, puzzle, players, mindId) {
    var livingPlayers = players.filter(function (p) {
      return p.alive;
    });
    var trueClues = shuffle(rng, puzzle.cluePool);
    while (trueClues.length < livingPlayers.length) {
      trueClues = trueClues.concat(shuffle(rng, puzzle.cluePool));
    }

    var assignments = {};
    var privateTrue = {};
    var tamperTarget = null;

    // Sometimes tamper one innocent's private clue
    var innocents = livingPlayers.filter(function (p) {
      return p.id !== mindId;
    });
    if (innocents.length && rng() < 0.45) {
      tamperTarget = pick(rng, innocents).id;
    }

    for (var i = 0; i < livingPlayers.length; i++) {
      var p = livingPlayers[i];
      var trueClue = JSON.parse(JSON.stringify(trueClues[i]));
      trueClue.true = true;
      privateTrue[p.id] = trueClue;

      if (p.id === mindId) {
        // Mind sees the truth (and later may share a lie)
        assignments[p.id] = trueClue;
      } else if (p.id === tamperTarget) {
        assignments[p.id] = mutateClue(rng, trueClue);
      } else {
        assignments[p.id] = trueClue;
      }
    }

    return {
      privateClues: assignments,
      trueClues: privateTrue,
      tamperTarget: tamperTarget,
    };
  }

  function suggestedLie(rng, trueClue) {
    return mutateClue(rng, trueClue);
  }

  function createGame(opts) {
    opts = opts || {};
    var seed = opts.seed != null ? opts.seed : (Date.now() % 2147483647);
    var rng = makeRng(seed);
    var playerName = (opts.playerName || "അമൽ").trim() || "അമൽ";

    var names = sample(rng, NAME_POOL, 5);
    var personalities = shuffle(rng, PERSONALITIES);
    var colors = shuffle(rng, AVATAR_PALETTE);

    var players = [
      {
        id: PLAYER_ID,
        name: playerName,
        isPlayer: true,
        isBot: false,
        personality: null,
        alive: true,
        color: colors[0],
        avatarKind: 0,
      },
    ];

    for (var i = 0; i < 5; i++) {
      players.push({
        id: uid("bot", i + 1),
        name: names[i],
        isPlayer: false,
        isBot: true,
        personality: personalities[i],
        alive: true,
        color: colors[i + 1],
        avatarKind: i + 1,
        blamerTarget: null,
      });
    }

    // Seat order: shuffle, but keep as a circle
    var seats = shuffle(
      rng,
      players.map(function (p) {
        return p.id;
      })
    );

    var mindId = pick(rng, players).id;

    // Blamer picks a target (not self, often the player)
    players.forEach(function (p) {
      if (p.personality && p.personality.id === "blamer") {
        var cands = players.filter(function (o) {
          return o.id !== p.id;
        });
        p.blamerTarget = rng() < 0.4 ? PLAYER_ID : pick(rng, cands).id;
        if (p.blamerTarget === p.id) p.blamerTarget = PLAYER_ID;
      }
    });

    var puzzles = [generateCodePuzzle(rng), generateBoxPuzzle(rng), generateDoorPuzzle(rng)];

    var suspicion = {};
    players.forEach(function (p) {
      suspicion[p.id] = {};
      players.forEach(function (o) {
        if (o.id !== p.id) suspicion[p.id][o.id] = 0;
      });
    });

    // Blamer starts suspicious of their target
    players.forEach(function (p) {
      if (p.blamerTarget && suspicion[p.id]) {
        suspicion[p.id][p.blamerTarget] = 3;
      }
    });

    var state = {
      seed: seed,
      rng: rng,
      phase: "intro",
      stageIndex: -1,
      strikes: 0,
      maxStrikes: MAX_STRIKES,
      players: players,
      seats: seats,
      mindId: mindId,
      puzzles: puzzles,
      suspicion: suspicion,
      chat: [],
      whispers: [],
      stage: null,
      history: {
        stages: [],
        ejections: [],
        puzzleResults: [],
      },
      ending: null,
      sharedClues: {},
      lastVote: null,
      discussionTick: 0,
      botPlan: [],
      playerShared: false,
      attemptsThisStage: 0,
    };

    return state;
  }

  function startBriefing(state) {
    state.phase = "briefing";
    return state;
  }

  function revealRole(state) {
    state.phase = "roleReveal";
    return state;
  }

  function beginStage(state) {
    var player = byId(state, PLAYER_ID);
    if (state.strikes > state.maxStrikes || (player && !player.alive)) {
      return finishGame(state);
    }
    state.stageIndex += 1;
    if (state.stageIndex >= state.puzzles.length) {
      return finishGame(state);
    }
    var puzzle = state.puzzles[state.stageIndex];
    var deal = dealClues(state.rng, puzzle, state.players, state.mindId);
    state.stage = {
      puzzle: puzzle,
      privateClues: deal.privateClues,
      trueClues: deal.trueClues,
      tamperTarget: deal.tamperTarget,
      shared: {},
      proposals: [],
      solved: false,
      attempts: 0,
      whisperShown: false,
      discussionStartedAt: 0,
      botCursor: 0,
    };
    state.sharedClues = {};
    state.playerShared = false;
    state.attemptsThisStage = 0;
    state.discussionTick = 0;
    state.botPlan = buildBotPlan(state);
    state.phase = "clue";
    pushSystem(
      state,
      state.stage.puzzle.title + " തുടങ്ങുന്നു. നിങ്ങളുടെ ക്ലൂ നിങ്ങൾക്ക് മാത്രം കാണാം."
    );
    return state;
  }

  function enterDiscussion(state) {
    state.phase = "discuss";
    state.stage.discussionStartedAt = Date.now();
    return state;
  }

  function buildBotPlan(state) {
    var bots = living(state).filter(function (p) {
      return p.isBot;
    });
    // Share order: eager first, nervous last
    var order = bots.slice().sort(function (a, b) {
      var rank = { eager: 0, logical: 1, blamer: 2, suspector: 3, nervous: 4 };
      return (rank[a.personality.id] || 3) - (rank[b.personality.id] || 3);
    });
    // slight shuffle within
    if (state.rng() < 0.5 && order.length > 2) {
      var i = 1 + Math.floor(state.rng() * (order.length - 2));
      var j = 1 + Math.floor(state.rng() * (order.length - 2));
      var t = order[i];
      order[i] = order[j];
      order[j] = t;
    }

    var plan = [];
    var t = 900;
    order.forEach(function (bot, idx) {
      t += 700 + Math.floor(state.rng() * 900);
      plan.push({ at: t, kind: "share", botId: bot.id });
      t += 600 + Math.floor(state.rng() * 800);
      plan.push({ at: t, kind: "comment", botId: bot.id });
    });

    // A couple of later reactions / accusations
    var late = shuffle(state.rng, bots).slice(0, 3);
    late.forEach(function (bot) {
      t += 800 + Math.floor(state.rng() * 1000);
      plan.push({ at: t, kind: "react", botId: bot.id });
    });

    // Maybe a whisper for the player mid-discussion
    if (state.rng() < 0.72) {
      var wt = 3500 + Math.floor(state.rng() * 4000);
      plan.push({ at: wt, kind: "whisper" });
    }

    // One bot proposes an answer
    var proposer =
      bots.filter(function (b) {
        return b.personality.id === "eager" || b.personality.id === "logical";
      })[0] || bots[0];
    t += 500;
    plan.push({ at: t + 400, kind: "propose", botId: proposer.id });

    plan.sort(function (a, b) {
      return a.at - b.at;
    });
    return plan;
  }

  function pushChat(state, entry) {
    entry.id = "c" + (state.chat.length + 1) + "-" + Math.floor(state.rng() * 1e6);
    entry.t = Date.now();
    state.chat.push(entry);
    return entry;
  }

  function pushSystem(state, text) {
    return pushChat(state, { kind: "system", text: text });
  }

  function shareClueFrom(state, playerId, clue) {
    if (!state.stage || state.stage.shared[playerId]) return null;
    state.stage.shared[playerId] = clue;
    state.sharedClues[playerId] = clue;
    var p = byId(state, playerId);
    if (playerId === PLAYER_ID) state.playerShared = true;
    var msg = pushChat(state, {
      kind: "clue",
      from: playerId,
      name: p.name,
      text: p.name + ": “" + clue.text + "”",
      clue: clue,
    });
    updateSuspicionFromShare(state, playerId, clue);
    return msg;
  }

  function botShareClue(state, bot) {
    var privateClue = state.stage.privateClues[bot.id];
    var toShare = privateClue;
    if (bot.id === state.mindId) {
      // Mind lies — share a false version of the truth they know
      toShare = suggestedLie(state.rng, state.stage.trueClues[bot.id] || privateClue);
    }
    return shareClueFrom(state, bot.id, toShare);
  }

  function cluesConflict(a, b) {
    if (!a || !b) return false;
    if (a.type === "digit" && b.type === "digit" && a.pos === b.pos && a.value !== b.value)
      return true;
    if (a.type === "sum" && b.type === "sum" && a.value !== b.value) return true;
    if (a.type === "parity" && b.type === "parity" && a.odd !== b.odd) return true;
    if (a.type === "contains" && b.type === "contains" && a.value === b.value && a.present !== b.present)
      return true;
    if (a.type === "compare" && b.type === "compare" && a.greater !== b.greater) return true;
    if (a.type === "box_is" && b.type === "box_is" && a.color !== b.color) return true;
    if (a.type === "box_is" && b.type === "box_not" && a.color === b.color) return true;
    if (a.type === "box_not" && b.type === "box_is" && a.color === b.color) return true;
    if (a.type === "door_is" && b.type === "door_is" && a.door !== b.door) return true;
    if (a.type === "door_is" && b.type === "door_not" && a.door === b.door) return true;
    if (a.type === "door_not" && b.type === "door_is" && a.door === b.door) return true;
    if (a.type === "door_symbol" && b.type === "door_symbol" && a.symbol !== b.symbol) return true;
    if (a.type === "box_or" && b.type === "box_is" && b.color && a.colors && a.colors.indexOf(b.color) < 0)
      return true;
    if (a.type === "box_or" && b.type === "box_not" && b.color && a.colors && a.colors.length === 2) {
      // not a hard conflict
    }
    return false;
  }

  function findConflicts(state) {
    var ids = Object.keys(state.stage.shared);
    var pairs = [];
    for (var i = 0; i < ids.length; i++) {
      for (var j = i + 1; j < ids.length; j++) {
        if (cluesConflict(state.stage.shared[ids[i]], state.stage.shared[ids[j]])) {
          pairs.push([ids[i], ids[j]]);
        }
      }
    }
    return pairs;
  }

  function addSus(state, observerId, targetId, amt) {
    if (observerId === targetId) return;
    if (!state.suspicion[observerId]) state.suspicion[observerId] = {};
    if (state.suspicion[observerId][targetId] == null) state.suspicion[observerId][targetId] = 0;
    state.suspicion[observerId][targetId] += amt;
  }

  function updateSuspicionFromShare(state, playerId, clue) {
    var conflicts = findConflicts(state);
    conflicts.forEach(function (pair) {
      if (pair[0] === playerId || pair[1] === playerId) {
        var other = pair[0] === playerId ? pair[1] : pair[0];
        living(state).forEach(function (obs) {
          if (obs.isBot) {
            var bump = obs.personality.id === "logical" ? 2.4 : obs.personality.id === "suspector" ? 2 : 1.2;
            addSus(state, obs.id, playerId, bump * 0.6);
            addSus(state, obs.id, other, bump * 0.6);
          }
        });
      }
    });
  }

  function majorityConsistentValue(shared, field) {
    // not required for all types
    return null;
  }

  function botComment(state, bot) {
    var lines;
    var conflicts = findConflicts(state);
    var isMind = bot.id === state.mindId;
    var pid = PERSONALITIES.length;

    if (isMind) {
      lines = mindComment(state, bot, conflicts);
    } else if (bot.personality.id === "logical") {
      if (conflicts.length) {
        var a = byId(state, conflicts[0][0]);
        var b = byId(state, conflicts[0][1]);
        lines = [
          a.name + "യുടെയും " + b.name + "യുടെയും ക്ലൂകൾ ഒന്നിച്ച് നിൽക്കുന്നില്ല. ഒരാൾ തെറ്റ് പറയുന്നു.",
          "ശ്രദ്ധിച്ചോ: രണ്ട് ക്ലൂകൾ പരസ്പരം ഏറ്റുമുട്ടുന്നു. നമുക്ക് സാവധാനം നോക്കാം.",
        ];
      } else if (Object.keys(state.stage.shared).length >= 3) {
        lines = [
          "ഇപ്പോൾ പങ്കുവെച്ച ക്ലൂകൾ ഒരുപാട് യോജിക്കുന്നു. ഒരു ഉത്തരത്തിലേക്ക് നമുക്ക് അടുക്കാം.",
          "യുക്തിചിന്തിച്ചാൽ ഒരു ദിശ വ്യക്തമാണ്. പക്ഷേ ഒരു ക്ലൂ നിശബ്ദമായി തെറ്റായിരിക്കാം.",
        ];
      } else {
        lines = [
          "നമുക്ക് എല്ലാ ക്ലൂകളും ഒന്നിച്ച് വെച്ച് നോക്കാം. ഉടനെ ആരോപിക്കേണ്ട.",
          "ക്ലൂകൾ കൂടുതൽ കിട്ടട്ടെ. അപ്പോൾ ചിത്രം വ്യക്തമാകും.",
        ];
      }
    } else if (bot.personality.id === "suspector") {
      var tgt = highestSuspicion(state, bot.id) || pick(state.rng, othersAlive(state, bot.id)).id;
      var tn = byId(state, tgt).name;
      lines = [
        "എനിക്ക് " + tn + "യെ സംശയമുണ്ട്. വളരെ സംശയാസ്പദമാണ്.",
        tn + " എന്തോ മറച്ചുവെക്കുന്നു എന്ന് എനിക്ക് തോന്നുന്നു.",
        "ഇതിൽ ഒരാൾ കള്ളം പറയുന്നു. " + tn + " ആയിരിക്കും എന്ന് എനിക്ക് തോന്നുന്നു.",
      ];
      addSus(state, bot.id, tgt, 0.8);
    } else if (bot.personality.id === "blamer") {
      var blame = bot.blamerTarget && byId(state, bot.blamerTarget) && byId(state, bot.blamerTarget).alive
        ? bot.blamerTarget
        : (highestSuspicion(state, bot.id) || othersAlive(state, bot.id)[0].id);
      var bn = byId(state, blame).name;
      lines = [
        "ഇത് " + bn + " തന്നെയാണ്. എനിക്കറിയാം.",
        "ഞാൻ ആദ്യം മുതൽ പറഞ്ഞതല്ലേ — " + bn + " വിശ്വസിക്കരുത്.",
        bn + "യുടെ വാക്കുകളിൽ എനിക്ക് വിശ്വാസമില്ല.",
      ];
    } else if (bot.personality.id === "nervous") {
      lines = [
        "എനിക്ക് ഉറപ്പില്ല... എന്റെ ക്ലൂ തെറ്റായിരിക്കും. ദയവായി എന്നെ പുറത്താക്കരുത്.",
        "ഈ മുറി ഭയങ്കരമാണ്. നമ്മൾ തെറ്റ് ചെയ്താൽ...",
        "ക്ഷമിക്കണം, ഞാൻ വല്ലാതെ പേടിക്കുന്നു. നിങ്ങൾ പറയുന്നത് ശരിയായിരിക്കും.",
      ];
    } else {
      // eager
      lines = [
        "നമുക്ക് ഒരുമിച്ച് ചെയ്യാം! ക്ലൂകൾ എല്ലാം മേശപ്പുറത്ത് വെക്കൂ.",
        "ഞാൻ വിശ്വസിക്കുന്നത് നമുക്ക് ഇതിൽ നിന്ന് ഉത്തരം കണ്ടെത്താം എന്നാണ്.",
        "നല്ല ക്ലൂകൾ! ഇനി ഒരു തീരുമാനമെടുക്കാം.",
      ];
    }
    return pushChat(state, {
      kind: "chat",
      from: bot.id,
      name: bot.name,
      text: pick(state.rng, lines),
    });
  }

  function mindComment(state, bot, conflicts) {
    var innocents = othersAlive(state, bot.id).filter(function (p) {
      return p.id !== state.mindId;
    });
    var scapegoat = pick(state.rng, innocents);
    // Prefer someone who shared a true, useful clue
    var logicalLook = living(state).filter(function (p) {
      return p.isBot && p.personality && p.personality.id === "logical" && p.id !== bot.id && p.alive;
    })[0];
    if (logicalLook && state.rng() < 0.5) scapegoat = logicalLook;

    var lines;
    if (bot.personality.id === "nervous") {
      lines = [
        "എന്റെ ക്ലൂ ശരിയാണെന്ന് തോന്നുന്നു... പക്ഷേ ഞാൻ ആശയക്കുഴപ്പത്തിലാണ്.",
        scapegoat.name + " പറഞ്ഞത് എനിക്ക് അൽപ്പം വിചിത്രമായി തോന്നി.",
      ];
    } else if (bot.personality.id === "logical") {
      lines = [
        "ഈ ക്ലൂകളിൽ ഒരെണ്ണം തെറ്റായിരിക്കണം. " + scapegoat.name + "യുടെ ക്ലൂ ആയിരിക്കുമോ?",
        "നമുക്ക് ക്രമമായി നോക്കാം. ഒരു ഉത്തരം മാത്രമേ യോജിക്കൂ — പക്ഷേ ആരുടെ ക്ലൂ ഒഴിവാക്കണം?",
      ];
    } else {
      lines = [
        "ഞാൻ " + scapegoat.name + "യെ വിശ്വസിക്കുന്നില്ല. അവരുടെ ക്ലൂ നമ്മളെ തെറ്റിദ്ധരിപ്പിക്കും.",
        "ഒരുപക്ഷേ നമ്മൾ തെറ്റായ ദിശയിലാണ്. വേറൊന്ന് ആലോചിക്കണം.",
        "എനിക്ക് തോന്നുന്നു " + scapegoat.name + " എന്തോ മറച്ചുവെക്കുന്നു.",
      ];
    }
    addSus(state, bot.id, scapegoat.id, 1.5);
    // Also try to make others suspicious of scapegoat slightly by speaking
    return pick(state.rng, lines);
  }

  // mindComment sometimes returns a string; wrap it
  function botCommentSafe(state, bot) {
    if (bot.id === state.mindId) {
      var conflicts = findConflicts(state);
      var text = mindComment(state, bot, conflicts);
      if (typeof text !== "string") return text;
      return pushChat(state, { kind: "chat", from: bot.id, name: bot.name, text: text });
    }
    return botComment(state, bot);
  }

  function botReact(state, bot) {
    var conflicts = findConflicts(state);
    var isMind = bot.id === state.mindId;
    var text;

    if (!isMind && conflicts.length && bot.personality.id === "logical") {
      var a = byId(state, conflicts[0][0]);
      var b = byId(state, conflicts[0][1]);
      text = "വീണ്ടും പറയട്ടെ: " + a.name + "യും " + b.name + "യും ഒരേ സത്യം പറയുന്നില്ല.";
    } else if (!isMind && bot.personality.id === "suspector") {
      var quiet = living(state).filter(function (p) {
        return !state.stage.shared[p.id] && p.id !== bot.id;
      });
      if (quiet.length) {
        text = quiet[0].name + " ഇതുവരെ ക്ലൂ പങ്കുവെച്ചിട്ടില്ല. എന്തുകൊണ്ട്?";
        addSus(state, bot.id, quiet[0].id, 1.1);
      } else {
        var t = highestSuspicion(state, bot.id);
        text = t
          ? "ഞാൻ ഇപ്പോഴും " + byId(state, t).name + "യെ സംശയിക്കുന്നു."
          : "ആരോ ഒരാൾ നമ്മളെ തെറ്റിദ്ധരിപ്പിക്കുന്നു.";
      }
    } else if (!isMind && bot.personality.id === "eager") {
      var prop = proposeAnswer(state, bot);
      text = prop
        ? "എനിക്ക് തോന്നുന്നു ഉത്തരം " + prop.label + " ആണ്. അല്ലേ?"
        : "നമുക്ക് ഒരു തീരുമാനമെടുക്കാം.";
      if (prop) state.stage.proposals.push({ from: bot.id, value: prop.value, label: prop.label });
    } else if (isMind) {
      var wrong = wrongAnswerSuggestion(state);
      text = wrong
        ? "ഒരുപക്ഷേ ഇത് " + wrong.label + " ആയിരിക്കും. എന്റെ ക്ലൂ അങ്ങനെയാണ് കാണിക്കുന്നത്."
        : "നമ്മൾ വേഗം തീരുമാനിച്ചാൽ പിഴച്ചേക്കാം. വേറൊരു വഴി ആലോചിക്കൂ.";
      if (wrong) state.stage.proposals.push({ from: bot.id, value: wrong.value, label: wrong.label });
    } else if (bot.personality.id === "nervous") {
      text = "എനിക്ക് വോട്ട് ചെയ്യാൻ പോലും ധൈര്യമില്ല... നിങ്ങൾക്ക് തോന്നുന്നത് ചെയ്യൂ.";
    } else {
      var bt = bot.blamerTarget && byId(state, bot.blamerTarget) && byId(state, bot.blamerTarget).alive
        ? byId(state, bot.blamerTarget).name
        : null;
      text = bt ? "ഇപ്പോഴും " + bt + " തന്നെയാണ് പ്രശ്നം." : "നമുക്ക് ശ്രദ്ധിച്ച് മുന്നോട്ട് പോകാം.";
    }

    return pushChat(state, { kind: "chat", from: bot.id, name: bot.name, text: text });
  }

  function deriveCodeFromShared(shared) {
    var digits = [null, null, null];
    var sum = null;
    var parityOdd = null;
    var mustHave = [];
    var mustNot = [];
    var greater = null;
    Object.keys(shared).forEach(function (id) {
      var c = shared[id];
      if (!c) return;
      if (c.type === "digit") digits[c.pos] = c.value;
      if (c.type === "sum") sum = c.value;
      if (c.type === "parity") parityOdd = c.odd;
      if (c.type === "contains" && c.present) mustHave.push(c.value);
      if (c.type === "contains" && !c.present) mustNot.push(c.value);
      if (c.type === "compare") greater = c.greater;
    });
    return { digits: digits, sum: sum, parityOdd: parityOdd, mustHave: mustHave, mustNot: mustNot, greater: greater };
  }

  function proposeAnswer(state, bot) {
    var puzzle = state.stage.puzzle;
    if (puzzle.answerType === "code") {
      var derived = deriveCodeFromShared(state.stage.shared);
      var guess = [derived.digits[0], derived.digits[1], derived.digits[2]];
      // fill unknowns reasonably from own clue
      var own = state.stage.shared[bot.id] || state.stage.privateClues[bot.id];
      for (var i = 0; i < 3; i++) {
        if (guess[i] == null) {
          if (own && own.type === "digit" && own.pos === i) guess[i] = own.value;
          else guess[i] = i === 0 ? 1 : 0;
        }
      }
      // if we have the true private clue and we're innocent, bias toward truth slightly when confused
      if (bot.id !== state.mindId && state.stage.privateClues[bot.id] && state.stage.privateClues[bot.id].true) {
        // If majority digits present, use them; else if own clue is exact digit, already used
        if (derived.digits.filter(function (d) { return d != null; }).length >= 2) {
          // ok
        } else if (state.rng() < 0.35) {
          var real = puzzle.answer.split("").map(Number);
          // don't cheat too hard — only fill one missing with truth sometimes? Skip, keep fair.
        }
      }
      var code = "" + guess[0] + guess[1] + guess[2];
      return { value: code, label: code };
    }
    // choice: tally box_is / door_is from shared
    var tally = {};
    puzzle.choices.forEach(function (c) {
      tally[c.id] = 0;
    });
    Object.keys(state.stage.shared).forEach(function (id) {
      var c = state.stage.shared[id];
      if (!c) return;
      if (c.type === "box_is") tally[c.color] = (tally[c.color] || 0) + 2;
      if (c.type === "box_not" && tally[c.color] != null) {
        Object.keys(tally).forEach(function (k) {
          if (k !== c.color) tally[k] += 1;
        });
      }
      if (c.type === "box_or" && c.colors) {
        c.colors.forEach(function (col) {
          tally[col] = (tally[col] || 0) + 1;
        });
      }
      if (c.type === "door_is") tally[c.door] = (tally[c.door] || 0) + 2;
      if (c.type === "door_not" && tally[c.door] != null) {
        Object.keys(tally).forEach(function (k) {
          if (k !== c.door) tally[k] += 1;
        });
      }
      if (c.type === "door_symbol") {
        var door = DOORS.filter(function (d) {
          return d.symbol === c.symbol;
        })[0];
        if (door) tally[door.id] = (tally[door.id] || 0) + 2;
      }
    });
    var best = puzzle.choices[0].id;
    var bestN = -1;
    Object.keys(tally).forEach(function (k) {
      if (tally[k] > bestN) {
        bestN = tally[k];
        best = k;
      }
    });
    var choice = puzzle.choices.filter(function (c) {
      return c.id === best;
    })[0];
    return { value: best, label: choice ? choice.label : best };
  }

  function wrongAnswerSuggestion(state) {
    var puzzle = state.stage.puzzle;
    if (puzzle.answerType === "code") {
      var real = puzzle.answer;
      var wr =
        real[0] +
        String((Number(real[1]) + 1 + Math.floor(state.rng() * 8)) % 10) +
        real[2];
      if (wr === real) wr = real[0] + real[1] + String((Number(real[2]) + 3) % 10);
      return { value: wr, label: wr };
    }
    var wrongs = puzzle.choices.filter(function (c) {
      return c.id !== puzzle.answer;
    });
    var w = pick(state.rng, wrongs);
    return { value: w.id, label: w.label };
  }

  function makeWhisper(state) {
    var left = leftOf(state, PLAYER_ID);
    var leftP = left ? byId(state, left) : null;
    var livingOthers = othersAlive(state, PLAYER_ID);
    var variants = [];

    if (leftP) {
      var leftIsLiar =
        leftP.id === state.mindId || state.stage.tamperTarget === leftP.id;
      // 55% truthful whispers, 45% false
      var tellTruth = state.rng() < 0.55;
      var claim = tellTruth ? leftIsLiar : !leftIsLiar;
      if (claim) {
        variants.push({
          text: "നിന്റെ ഇടതുവശത്തുള്ളയാൾ (" + leftP.name + ") കള്ളം പറയുന്നു.",
          truthful: tellTruth && leftIsLiar,
        });
      } else {
        variants.push({
          text: "നിന്റെ ഇടതുവശത്തുള്ള " + leftP.name + " സത്യമാണ് പറയുന്നത്.",
          truthful: tellTruth && !leftIsLiar,
        });
      }
    }

    if (state.stage.tamperTarget === PLAYER_ID) {
      variants.push({
        text: "നിന്റെ ക്ലൂ തന്നെ തെറ്റായിരിക്കാം.",
        truthful: true,
      });
    } else {
      variants.push({
        text: "നിന്റെ ക്ലൂ തന്നെ തെറ്റായിരിക്കാം.",
        truthful: false,
      });
    }

    var quiet = livingOthers.filter(function (p) {
      return !state.stage.shared[p.id];
    });
    if (quiet.length) {
      variants.push({
        text: quiet[0].name + " വളരെ നിശബ്ദനാണ്. അതൊരു കാരണത്താലാകാം.",
        truthful: quiet[0].id === state.mindId,
      });
    }

    var random = pick(state.rng, livingOthers);
    variants.push({
      text: "ഒരാൾ അവരുടെ ക്ലൂ മാറ്റിപ്പറഞ്ഞു — " + random.name + "യെ ശ്രദ്ധിക്കൂ.",
      truthful: random.id === state.mindId,
    });

    var firstSharer = Object.keys(state.stage.shared)[0];
    if (firstSharer) {
      var fn = byId(state, firstSharer);
      variants.push({
        text: "ആദ്യം സംസാരിച്ച " + fn.name + "യെ അത്ര എളുപ്പത്തിൽ വിശ്വസിക്കരുത്.",
        truthful: firstSharer === state.mindId,
      });
    }

    var w = pick(state.rng, variants);
    w.id = "w" + (state.whispers.length + 1);
    w.stageIndex = state.stageIndex;
    state.whispers.push(w);
    state.stage.whisperShown = true;
    return w;
  }

  function tickDiscussion(state, elapsedMs) {
    if (state.phase !== "discuss" || !state.stage) return [];
    var emitted = [];
    while (
      state.stage.botCursor < state.botPlan.length &&
      state.botPlan[state.stage.botCursor].at <= elapsedMs
    ) {
      var ev = state.botPlan[state.stage.botCursor++];
      var out = applyBotEvent(state, ev);
      if (out) emitted.push(out);
    }
    return emitted;
  }

  function applyBotEvent(state, ev) {
    if (ev.kind === "whisper") {
      if (state.stage.whisperShown) return { kind: "skip" };
      var w = makeWhisper(state);
      return { kind: "whisper", whisper: w };
    }
    var bot = byId(state, ev.botId);
    if (!bot || !bot.alive) return { kind: "skip" };
    if (ev.kind === "share") {
      if (state.stage.shared[bot.id]) return { kind: "skip" };
      var msg = botShareClue(state, bot);
      return { kind: "chat", message: msg };
    }
    if (ev.kind === "comment") {
      return { kind: "chat", message: botCommentSafe(state, bot) };
    }
    if (ev.kind === "react" || ev.kind === "propose") {
      return { kind: "chat", message: botReact(state, bot) };
    }
    return { kind: "skip" };
  }

  function playerShareClue(state, overrideText) {
    if (!state.stage || state.stage.shared[PLAYER_ID]) return null;
    var base = state.stage.privateClues[PLAYER_ID];
    if (!base) return null;
    var clue = JSON.parse(JSON.stringify(base));
    if (overrideText && String(overrideText).trim()) {
      clue.text = String(overrideText).trim();
      if (state.mindId === PLAYER_ID) clue.true = false;
    }
    return shareClueFrom(state, PLAYER_ID, clue);
  }

  function playerChat(state, text) {
    text = String(text || "").trim();
    if (!text) return null;
    var msg = pushChat(state, {
      kind: "chat",
      from: PLAYER_ID,
      name: byId(state, PLAYER_ID).name,
      text: text,
    });
    // Bots react to names / numbers
    var reactions = maybeReactToPlayer(state, text);
    return { message: msg, reactions: reactions };
  }

  function maybeReactToPlayer(state, text) {
    var reactions = [];
    if (state.phase !== "discuss" && state.phase !== "answer") return reactions;
    living(state).forEach(function (p) {
      if (p.isPlayer || !p.alive) return;
      if (text.indexOf(p.name) >= 0) {
        living(state).forEach(function (obs) {
          if (obs.isBot) addSus(state, obs.id, p.id, 0.9);
        });
      }
    });

    // A couple of bots may reply
    var responders = living(state)
      .filter(function (p) {
        return p.isBot;
      })
      .filter(function () {
        return state.rng() < 0.45;
      })
      .slice(0, 2);

    responders.forEach(function (bot) {
      var mentioned = living(state).filter(function (p) {
        return p.id !== bot.id && text.indexOf(p.name) >= 0;
      });
      var line;
      if (bot.id === state.mindId) {
        if (mentioned.length && mentioned[0].id !== state.mindId) {
          line = "അതെ, " + mentioned[0].name + "യെ ഞാനും സംശയിക്കുന്നു.";
          addSus(state, bot.id, mentioned[0].id, 1);
        } else if (text.indexOf(bot.name) >= 0) {
          line = "ഞാനോ? ഞാൻ സത്യമാണ് പറഞ്ഞത്. വേറൊരാളെ നോക്കൂ.";
        } else {
          line = "ഹ്മ്. നിന്റെ വാക്ക് ശ്രദ്ധിച്ചു. പക്ഷേ എനിക്ക് വേറൊരു തോന്നൽ.";
        }
      } else if (text.indexOf(bot.name) >= 0) {
        if (bot.personality.id === "nervous") {
          line = "ഞാനല്ല! ദയവായി — ഞാൻ സത്യമാണ് പറയുന്നത്.";
        } else if (bot.personality.id === "blamer") {
          line = "എന്നെ സംശയിക്കരുത്. പ്രശ്നം മറ്റൊരാളാണ്.";
        } else {
          line = "എന്നെ സംശയിക്കുന്നുണ്ടോ? എന്റെ ക്ലൂ ഞാൻ നേരെ പങ്കുവെച്ചതാണ്.";
        }
      } else if (mentioned.length) {
        if (bot.personality.id === "suspector" || bot.personality.id === "blamer") {
          line = mentioned[0].name + "യെക്കുറിച്ച് എനിക്കും സംശയമുണ്ട്.";
        } else if (bot.personality.id === "logical") {
          line = "ആരോപണം മാത്രം പോരാ. ക്ലൂകളുമായി ചേർത്ത് നോക്കണം.";
        } else {
          line = "ഒരുപക്ഷേ... പക്ഷേ നമുക്ക് കുറച്ചുകൂടി ആലോചിക്കാം.";
        }
      } else if (bot.personality.id === "eager") {
        line = "ശരി, നീ പറയുന്നത് ഞാൻ കേട്ടു.";
      } else {
        return;
      }
      reactions.push(
        pushChat(state, { kind: "chat", from: bot.id, name: bot.name, text: line })
      );
    });
    return reactions;
  }

  function enterAnswer(state) {
    state.phase = "answer";
    // flush remaining planned shares so clues aren't lost if player rushes
    flushRemainingShares(state);
    return state;
  }

  function flushRemainingShares(state) {
    if (!state.stage) return;
    living(state).forEach(function (p) {
      if (p.isBot && !state.stage.shared[p.id]) {
        botShareClue(state, p);
      }
    });
  }

  function submitAnswer(state, value) {
    if (state.phase !== "answer" || !state.stage) {
      return { ok: false, reason: "not-answering" };
    }
    var puzzle = state.stage.puzzle;
    var submitted = String(value == null ? "" : value).trim();
    if (puzzle.answerType === "code") {
      submitted = submitted.replace(/\s/g, "");
      if (!/^\d{3}$/.test(submitted)) {
        return { ok: false, reason: "invalid", message: "മൂന്നക്ക കോഡ് നൽകൂ." };
      }
    }
    state.stage.attempts += 1;
    state.attemptsThisStage = state.stage.attempts;
    var correct = submitted === String(puzzle.answer);
    var result = {
      ok: true,
      correct: correct,
      submitted: submitted,
      answer: puzzle.answer,
      attempts: state.stage.attempts,
      strikes: state.strikes,
    };

    state.history.puzzleResults.push({
      stageIndex: state.stageIndex,
      puzzleId: puzzle.id,
      submitted: submitted,
      correct: correct,
      attempts: state.stage.attempts,
    });

    if (correct) {
      state.stage.solved = true;
      pushSystem(state, "ലോക്ക് അഴിഞ്ഞു. ശരിയായ ഉത്തരം. പക്ഷേ ഇതിലൊരാൾ ഇപ്പോഴും നിങ്ങളെ നിരീക്ഷിക്കുന്നു.");
      // Reduce suspicion of those whose clues matched the answer
      trustConsistentSharers(state);
      state.phase = "answerResult";
      result.next = "vote";
    } else {
      state.strikes += 1;
      result.strikes = state.strikes;
      bumpSuspicionForWrongProposal(state, submitted);
      if (state.strikes > state.maxStrikes) {
        pushSystem(state, "തെറ്റ്. ലോക്ക് ഉറയുന്നു. സമയം തീർന്നു.");
        state.phase = "answerResult";
        result.fatal = true;
        result.next = "end";
      } else if (state.stage.attempts >= 2) {
        pushSystem(
          state,
          "വീണ്ടും തെറ്റ്. നിങ്ങൾക്ക് ഒരു പോറൽ ഏറ്റു — പക്ഷേ മുന്നോട്ട് പോകാൻ മാത്രം വഴി ലഭിച്ചു."
        );
        // scrape through at a cost
        state.stage.solved = false;
        state.stage.forcedThrough = true;
        state.phase = "answerResult";
        result.next = "vote";
        result.forcedThrough = true;
      } else {
        pushSystem(state, "തെറ്റായ ഉത്തരം. ഒരു അവസരം കൂടി. ആരാണ് നിങ്ങളെ തെറ്റിദ്ധരിപ്പിച്ചത്?");
        state.phase = "answerResult";
        result.next = "answer";
        result.canRetry = true;
      }
    }
    result.strikes = state.strikes;
    return result;
  }

  function retryAnswer(state) {
    if (state.phase === "answerResult") state.phase = "answer";
    return state;
  }

  function trustConsistentSharers(state) {
    // light touch, rule-based
    Object.keys(state.stage.shared).forEach(function (id) {
      var c = state.stage.shared[id];
      if (c && c.true) {
        living(state).forEach(function (obs) {
          if (obs.isBot && obs.id !== id) addSus(state, obs.id, id, -0.8);
        });
      }
    });
  }

  function bumpSuspicionForWrongProposal(state, submitted) {
    (state.stage.proposals || []).forEach(function (p) {
      if (String(p.value) === String(submitted)) {
        living(state).forEach(function (obs) {
          if (obs.isBot && obs.id !== p.from) addSus(state, obs.id, p.from, 2.2);
        });
      }
    });
  }

  function enterVote(state) {
    if (state.strikes > state.maxStrikes) return finishGame(state);
    state.phase = "vote";
    state.lastVote = null;
    pushSystem(state, "ചർച്ച കഴിഞ്ഞു. സംശയമുള്ളയാളെ പുറത്താക്കണോ? തെറ്റായ ആളെയാണെങ്കിൽ ടീമിന് നഷ്ടം.");
    return state;
  }

  function highestSuspicion(state, observerId) {
    var map = state.suspicion[observerId] || {};
    var bestId = null;
    var best = 0.8;
    living(state).forEach(function (p) {
      if (p.id === observerId) return;
      var v = map[p.id] || 0;
      if (v > best) {
        best = v;
        bestId = p.id;
      }
    });
    return bestId;
  }

  function botVote(state, bot) {
    var skipThreshold = { suspector: 1.0, logical: 2.2, blamer: 0.4, nervous: 3.2, eager: 2.5 };
    var th = skipThreshold[bot.personality.id] || 2;
    if (bot.id === state.mindId) {
      // Vote an innocent, preferably popular suspicion target among others, or logical player
      var innocents = othersAlive(state, bot.id).filter(function (p) {
        return p.id !== state.mindId;
      });
      // prefer someone already suspected, not a random if possible
      var scored = innocents.map(function (p) {
        var s = 0;
        living(state).forEach(function (obs) {
          if (obs.isBot && obs.id !== bot.id) s += (state.suspicion[obs.id] || {})[p.id] || 0;
        });
        // prefer player sometimes
        if (p.id === PLAYER_ID) s += 1.2;
        return { id: p.id, s: s };
      });
      scored.sort(function (a, b) {
        return b.s - a.s;
      });
      return scored.length && scored[0].s >= 0 ? scored[0].id : innocents[0].id;
    }
    if (bot.personality.id === "blamer" && bot.blamerTarget && byId(state, bot.blamerTarget) && byId(state, bot.blamerTarget).alive && bot.blamerTarget !== bot.id) {
      return bot.blamerTarget;
    }
    if (bot.personality.id === "nervous" && state.rng() < 0.45) {
      return "skip";
    }
    var target = highestSuspicion(state, bot.id);
    if (!target) return "skip";
    var score = (state.suspicion[bot.id] || {})[target] || 0;
    if (score < th) return "skip";
    return target;
  }

  function castPlayerVote(state, targetId) {
    if (state.phase !== "vote") return { ok: false };
    var player = byId(state, PLAYER_ID);
    if (targetId !== "skip") {
      var t = byId(state, targetId);
      if (!t || !t.alive || t.id === PLAYER_ID) return { ok: false, reason: "invalid-target" };
    }
    var ballots = {};
    ballots[PLAYER_ID] = targetId;
    living(state).forEach(function (p) {
      if (p.isBot) ballots[p.id] = botVote(state, p);
    });

    var counts = { skip: 0 };
    Object.keys(ballots).forEach(function (vid) {
      var v = ballots[vid];
      counts[v] = (counts[v] || 0) + 1;
    });

    var winner = "skip";
    var top = counts.skip || 0;
    var tie = false;
    Object.keys(counts).forEach(function (k) {
      if (k === "skip") return;
      if (counts[k] > top) {
        top = counts[k];
        winner = k;
        tie = false;
      } else if (counts[k] === top && counts[k] > 0) {
        // tie with current winner
        if (winner !== "skip" || counts[k] === (counts.skip || 0)) {
          if (counts[k] === top) tie = winner !== k;
        }
      }
    });
    // Recompute ties properly among all including skip
    var max = 0;
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > max) max = counts[k];
    });
    var leaders = Object.keys(counts).filter(function (k) {
      return counts[k] === max;
    });
    if (leaders.length > 1) {
      winner = "skip";
      tie = true;
    } else {
      winner = leaders[0];
      tie = false;
    }

    var ejected = null;
    var ejectedMind = false;
    var wrongEjection = false;
    if (!tie && winner !== "skip") {
      var victim = byId(state, winner);
      if (victim && victim.alive) {
        victim.alive = false;
        ejected = victim.id;
        ejectedMind = victim.id === state.mindId;
        wrongEjection = !ejectedMind;
        if (wrongEjection) {
          state.strikes += 1;
          pushSystem(
            state,
            victim.name +
              " പുറത്താക്കപ്പെട്ടു. അവർ നിശബ്ദരായി മൂലയിലേക്ക് നീങ്ങുന്നു. വാതിൽ അഴിയുന്നില്ല. തെറ്റായിരുന്നോ?"
          );
        } else {
          pushSystem(
            state,
            victim.name +
              " പുറത്താക്കപ്പെട്ടു. ഒരു നിമിഷം മുറി നിശബ്ദമായി. എന്തോ മാറിയതായി തോന്നുന്നു — പക്ഷേ ഉറപ്പില്ല."
          );
        }
        state.history.ejections.push({
          id: victim.id,
          name: victim.name,
          wasMind: ejectedMind,
          stageIndex: state.stageIndex,
        });
      }
    } else if (tie) {
      pushSystem(state, "വോട്ട് സമം. ആരെയും പുറത്താക്കുന്നില്ല — സംശയം നിലനിൽക്കുന്നു.");
    } else {
      pushSystem(state, "ടീം ആരെയും പുറത്താക്കാനില്ലെന്ന് തീരുമാനിച്ചു.");
    }

    state.lastVote = {
      ballots: ballots,
      counts: counts,
      winner: winner,
      tie: tie,
      ejected: ejected,
      ejectedMind: ejectedMind,
      wrongEjection: wrongEjection,
    };
    state.phase = "voteResult";

    var playerDead = player && !player.alive;
    var fatal = state.strikes > state.maxStrikes || playerDead;
    return {
      ok: true,
      vote: state.lastVote,
      strikes: state.strikes,
      fatal: fatal,
      playerEjected: !!playerDead,
      next: fatal || playerDead || state.stageIndex >= state.puzzles.length - 1 ? "end" : "nextStage",
    };
  }

  function continueAfterVote(state) {
    var player = byId(state, PLAYER_ID);
    if (state.strikes > state.maxStrikes || (player && !player.alive)) return finishGame(state);
    if (state.stageIndex >= state.puzzles.length - 1) return finishGame(state);
    return beginStage(state);
  }

  function finishGame(state) {
    var player = byId(state, PLAYER_ID);
    var mind = byId(state, state.mindId);
    var mindEjected = mind && !mind.alive;
    var trapped = state.strikes > state.maxStrikes;
    var escaped = !trapped && state.stageIndex >= state.puzzles.length - 1 && state.phase !== "answer";
    // If we finished last vote after last stage, escaped unless trapped
    if (state.phase === "voteResult" && state.stageIndex >= state.puzzles.length - 1 && !trapped) {
      escaped = true;
    }
    if (state.phase === "answerResult" && trapped) escaped = false;

    // If fatal mid-answer
    if (trapped) escaped = false;

    // Need all stages attempted
    var stagesAttempted = state.history.puzzleResults.length;
    var lastStageDone =
      state.stageIndex >= state.puzzles.length - 1 &&
      state.history.puzzleResults.some(function (r) {
        return r.stageIndex === state.puzzles.length - 1;
      });

    if (!trapped && lastStageDone) escaped = true;
    if (trapped) escaped = false;

    var kind;
    var title;
    var body;
    var playerWon;

    if (player && player.id === state.mindId) {
      if (mindEjected) {
        kind = "mind_caught";
        title = "നിന്നെ അവർ കണ്ടെത്തി";
        body =
          "ടീം നിന്നെ പുറത്താക്കി. ദി മൈൻഡ് എന്ന നിലയിൽ നീ പരാജയപ്പെട്ടു. അവർ നിന്റെ മുഖത്ത് നോക്കി — ഇത്തവണ നീ അത്ര പ്രവചിക്കാനാകാത്തവനായിരുന്നില്ല.";
        playerWon = false;
      } else if (trapped) {
        kind = "mind_win_trapped";
        title = "മുറി അവരെ വിഴുങ്ങി";
        body =
          "ടീം തെറ്റുകളിൽ മുങ്ങി. നീയാണ് ദി മൈൻഡ് — നീ അവരെ തെറ്റായ വഴിയിലേക്ക് നയിച്ചു. ഇരുട്ടിനുള്ളിൽ നീ ഒറ്റയ്ക്ക് ചിരിക്കുന്നു.";
        playerWon = true;
      } else if (escaped) {
        kind = "mind_win_escape";
        title = "നീയും കൂടെ പുറത്തിറങ്ങി";
        body =
          "വാതിൽ തുറന്നു. എല്ലാവരും രക്ഷപ്പെട്ടുവെന്ന് കരുതി. പക്ഷേ ദി മൈൻഡ് — നീ — അവരോടൊപ്പം നടന്നു. ആരും അറിഞ്ഞില്ല.";
        playerWon = true;
      } else {
        kind = "mind_win_trapped";
        title = "ആശയക്കുഴപ്പം ജയിച്ചു";
        body = "ടീമിന് രക്ഷപ്പെടാൻ കഴിഞ്ഞില്ല. നീയാണ് ദി മൈൻഡ്. ജോലി പൂർത്തിയായി.";
        playerWon = true;
      }
    } else {
      if (trapped) {
        kind = "trapped";
        title = "മുറി അടയുന്നു";
        body =
          "തെറ്റുകൾ മതിയായി. വാതിൽ ഉറച്ചു. ദി മൈൻഡ് — " +
          (mind ? mind.name : "ആരോ") +
          " — ഇരുട്ടിൽ നിന്ന് നോക്കുന്നു. നിങ്ങൾ ഇവിടെ തന്നെ.";
        playerWon = false;
      } else if (escaped && mindEjected) {
        kind = "team_victory";
        title = "നിങ്ങൾ രക്ഷപ്പെട്ടു";
        body =
          "വാതിൽ തുറന്നു. ദി മൈൻഡ് " +
          mind.name +
          " ആയിരുന്നു — നിങ്ങൾ അവരെ വേർതിരിച്ചു. പുറത്ത് വെളിച്ചമുണ്ട്. ഇത്തവണ, നിങ്ങൾ ജയിച്ചു.";
        playerWon = true;
      } else if (escaped && !mindEjected) {
        kind = "escape_with_mind";
        title = "വാതിൽ തുറന്നു...";
        body =
          "നിങ്ങൾ പുറത്തിറങ്ങി. പിന്നിൽ നിൽക്കുന്നവരിൽ ഒരാൾ ചിരിച്ചു. ദി മൈൻഡ് " +
          mind.name +
          " ആയിരുന്നു — അവരും കൂടെ നടന്നു. രക്ഷപ്പെട്ടോ, അതോ ഒരു പുതിയ കെണിയിലേക്കോ?";
        playerWon = true; // partial — escaped, but dark twist
      } else {
        kind = "trapped";
        title = "ഇതുവിടെ അവസാനിക്കുന്നു";
        body = "നിങ്ങൾക്ക് പുറത്തുകടക്കാൻ കഴിഞ്ഞില്ല. ദി മൈൻഡ് " + (mind ? mind.name : "") + " ആയിരുന്നു.";
        playerWon = false;
      }
    }

    state.ending = {
      kind: kind,
      title: title,
      body: body,
      playerWon: playerWon,
      playerIsMind: state.mindId === PLAYER_ID,
      mindId: state.mindId,
      mindName: mind ? mind.name : "",
      mindEjected: mindEjected,
      escaped: escaped,
      trapped: trapped,
      strikes: state.strikes,
      ejections: state.history.ejections.slice(),
      puzzleResults: state.history.puzzleResults.slice(),
    };
    state.phase = "ending";
    return state;
  }

  function isPlayerMind(state) {
    return state.mindId === PLAYER_ID;
  }

  function privateClueForPlayer(state) {
    if (!state.stage) return null;
    return state.stage.privateClues[PLAYER_ID] || null;
  }

  function getPublicPlayers(state) {
    return state.seats
      .map(function (id) {
        return byId(state, id);
      })
      .filter(Boolean)
      .map(function (p) {
        return {
          id: p.id,
          name: p.name,
          isPlayer: !!p.isPlayer,
          alive: p.alive,
          color: p.color,
          avatarKind: p.avatarKind,
          personality: p.isPlayer ? null : p.personality,
        };
      });
  }

  return {
    PLAYER_ID: PLAYER_ID,
    MAX_STRIKES: MAX_STRIKES,
    NAME_POOL: NAME_POOL,
    PERSONALITIES: PERSONALITIES,
    BOXES: BOXES,
    DOORS: DOORS,
    makeRng: makeRng,
    createGame: createGame,
    startBriefing: startBriefing,
    revealRole: revealRole,
    beginStage: beginStage,
    enterDiscussion: enterDiscussion,
    tickDiscussion: tickDiscussion,
    playerShareClue: playerShareClue,
    playerChat: playerChat,
    enterAnswer: enterAnswer,
    submitAnswer: submitAnswer,
    retryAnswer: retryAnswer,
    enterVote: enterVote,
    castPlayerVote: castPlayerVote,
    continueAfterVote: continueAfterVote,
    finishGame: finishGame,
    isPlayerMind: isPlayerMind,
    privateClueForPlayer: privateClueForPlayer,
    getPublicPlayers: getPublicPlayers,
    byId: byId,
    living: living,
    leftOf: leftOf,
    cluesConflict: cluesConflict,
    mutateClue: mutateClue,
    generateCodePuzzle: generateCodePuzzle,
    generateBoxPuzzle: generateBoxPuzzle,
    generateDoorPuzzle: generateDoorPuzzle,
    dealClues: dealClues,
    suggestedLie: suggestedLie,
    makeWhisper: makeWhisper,
  };
});

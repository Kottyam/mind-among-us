#!/usr/bin/env node
"use strict";

var L = require("./logic.js");
var failed = 0;
var passed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("FAIL:", msg);
  }
}

function assertEq(a, b, msg) {
  assert(a === b, msg + " (got " + JSON.stringify(a) + ", expected " + JSON.stringify(b) + ")");
}

// --- PRNG determinism ---
var r1 = L.makeRng(42);
var r2 = L.makeRng(42);
var same = true;
for (var i = 0; i < 20; i++) {
  if (r1() !== r2()) same = false;
}
assert(same, "PRNG is deterministic for the same seed");

// --- Puzzle generation consistency ---
for (var seed = 1; seed <= 40; seed++) {
  var rng = L.makeRng(seed);
  var lock = L.generateCodePuzzle(rng);
  assert(/^\d{3}$/.test(lock.answer), "code is 3 digits seed=" + seed);
  assert(lock.answer[0] !== "0", "code does not start with 0 seed=" + seed);
  var digits = lock.answer.split("").map(Number);
  lock.cluePool.forEach(function (c, idx) {
    if (c.type === "digit") {
      assert(digits[c.pos] === c.value, "digit clue matches code seed=" + seed + " i=" + idx);
    }
    if (c.type === "sum") {
      assert(c.value === digits[0] + digits[1] + digits[2], "sum clue matches seed=" + seed);
    }
    if (c.type === "parity") {
      assert(c.odd === (digits[1] % 2 === 1), "parity clue matches seed=" + seed);
    }
    if (c.type === "contains" && c.present) {
      assert(digits.indexOf(c.value) >= 0, "contains clue true seed=" + seed);
    }
    if (c.type === "contains" && !c.present) {
      assert(digits.indexOf(c.value) < 0, "absent clue true seed=" + seed);
    }
    if (c.type === "compare") {
      assert(c.greater === digits[0] > digits[1], "compare clue seed=" + seed);
    }
    assert(c.true === true, "pool clues marked true");
    assert(typeof c.text === "string" && c.text.length > 2, "clue has text");
  });

  var boxes = L.generateBoxPuzzle(L.makeRng(seed + 100));
  assert(L.BOXES.some(function (b) { return b.id === boxes.answer; }), "box answer valid");
  boxes.cluePool.forEach(function (c) {
    if (c.type === "box_is") assert(c.color === boxes.answer, "box_is is correct seed=" + seed);
    if (c.type === "box_not") assert(c.color !== boxes.answer, "box_not is correct seed=" + seed);
    if (c.type === "box_or") assert(c.colors.indexOf(boxes.answer) >= 0, "box_or includes answer");
  });

  var doors = L.generateDoorPuzzle(L.makeRng(seed + 200));
  assert(L.DOORS.some(function (d) { return d.id === doors.answer; }), "door answer valid");
  doors.cluePool.forEach(function (c) {
    if (c.type === "door_is") assert(c.door === doors.answer, "door_is correct");
    if (c.type === "door_not") assert(c.door !== doors.answer, "door_not correct");
    if (c.type === "door_symbol") {
      var d = L.DOORS.filter(function (x) { return x.symbol === c.symbol; })[0];
      assert(d && d.id === doors.answer, "door_symbol matches answer");
    }
  });
}

// --- Mutated clues differ and are marked false ---
(function () {
  var rng = L.makeRng(7);
  var lock = L.generateCodePuzzle(rng);
  lock.cluePool.forEach(function (c) {
    var m = L.mutateClue(L.makeRng(99 + c.type.length), c);
    assert(m.true === false, "mutated clue marked false: " + c.type);
    assert(m.text !== c.text || m.type === "unknown", "mutated text differs for " + c.type + " (“" + c.text + "” vs “" + m.text + "”)");
  });
})();

// --- Game setup ---
(function () {
  var g = L.createGame({ playerName: "അമൽ", seed: 12345 });
  assertEq(g.players.length, 6, "6 players");
  assertEq(g.players[0].id, L.PLAYER_ID, "first player is human");
  assertEq(g.players[0].name, "അമൽ", "player name set");
  assert(
    g.players.filter(function (p) { return p.isBot; }).length === 5,
    "5 bots"
  );
  assert(
    g.players.some(function (p) { return p.id === g.mindId; }),
    "Mind is a participant"
  );
  var personalities = g.players.filter(function (p) { return p.isBot; }).map(function (p) {
    return p.personality.id;
  });
  var unique = personalities.filter(function (id, i) { return personalities.indexOf(id) === i; });
  assertEq(unique.length, 5, "5 distinct personalities");
  assertEq(g.seats.length, 6, "6 seats");
  assertEq(g.puzzles.length, 3, "3 puzzles");
})();

// --- Different seeds produce different Minds / names often ---
(function () {
  var minds = {};
  var nameSets = {};
  for (var s = 1; s <= 30; s++) {
    var g = L.createGame({ playerName: "Test", seed: s * 97 });
    minds[g.mindId] = (minds[g.mindId] || 0) + 1;
    var key = g.players
      .filter(function (p) { return p.isBot; })
      .map(function (p) { return p.name; })
      .sort()
      .join(",");
    nameSets[key] = true;
  }
  assert(Object.keys(minds).length >= 3, "Mind identity varies across seeds");
  assert(Object.keys(nameSets).length >= 8, "bot name sets vary");
})();

// --- Deal: Mind gets a true private clue; tampered clue is false ---
(function () {
  for (var s = 1; s <= 25; s++) {
    var g = L.createGame({ playerName: "A", seed: s * 13 });
    L.beginStage(g);
    var mindClue = g.stage.privateClues[g.mindId];
    var mindTrue = g.stage.trueClues[g.mindId];
    assert(mindTrue && mindTrue.true, "Mind's true clue is true, seed=" + s);
    assert(mindClue && mindClue.true, "Mind privately sees truth, seed=" + s);
    if (g.stage.tamperTarget) {
      assert(g.stage.tamperTarget !== g.mindId, "do not tamper the Mind");
      assert(g.stage.privateClues[g.stage.tamperTarget].true === false, "tampered clue is false seed=" + s);
    }
    L.living(g).forEach(function (p) {
      assert(!!g.stage.privateClues[p.id], "every living player has a clue seed=" + s);
    });
  }
})();

// --- Full auto playthroughs: innocent player always answers correctly ---
function playthrough(seed, opts) {
  opts = opts || {};
  var g = L.createGame({ playerName: "അമൽ", seed: seed });
  L.startBriefing(g);
  L.revealRole(g);
  var playerIsMind = g.mindId === L.PLAYER_ID;

  for (var stage = 0; stage < 3; stage++) {
    L.beginStage(g);
    if (g.phase === "ending") break;
    L.enterDiscussion(g);
    // Fast-forward all bot events
    L.tickDiscussion(g, 20000);
    if (!g.stage.shared[L.PLAYER_ID]) {
      if (playerIsMind && opts.mindLies) {
        var lie = L.suggestedLie(g.rng, g.stage.trueClues[L.PLAYER_ID]);
        L.playerShareClue(g, lie.text);
      } else {
        L.playerShareClue(g);
      }
    }
    L.playerChat(g, "നമുക്ക് ശ്രദ്ധിച്ച് നോക്കാം.");
    L.enterAnswer(g);
    var answer = opts.wrongAnswers
      ? (g.stage.puzzle.answerType === "code" ? "000" : "zzzz-nope")
      : g.stage.puzzle.answer;
    // if wrong choice id doesn't match, pick a wrong choice
    if (opts.wrongAnswers && g.stage.puzzle.answerType === "choice") {
      answer = g.stage.puzzle.choices.filter(function (c) {
        return c.id !== g.stage.puzzle.answer;
      })[0].id;
    }
    var res = L.submitAnswer(g, answer);
    assert(res.ok, "submit accepted seed=" + seed + " stage=" + stage + " reason=" + res.reason);
    if (res.canRetry) {
      L.retryAnswer(g);
      var res2 = L.submitAnswer(g, opts.wrongAnswers ? answer : g.stage.puzzle.answer);
      assert(res2.ok, "retry accepted");
      if (res2.fatal) {
        L.finishGame(g);
        break;
      }
    }
    if (res.fatal) {
      L.finishGame(g);
      break;
    }
    L.enterVote(g);
    var voteTarget = opts.voteMind
      ? (g.mindId === L.PLAYER_ID ? "skip" : g.mindId)
      : "skip";
    // If voting a dead or self, skip
    if (voteTarget !== "skip") {
      var t = L.byId(g, voteTarget);
      if (!t || !t.alive) voteTarget = "skip";
    }
    var vote = L.castPlayerVote(g, voteTarget);
    assert(vote.ok, "vote accepted seed=" + seed);
    if (vote.fatal || vote.next === "end") {
      L.finishGame(g);
      break;
    }
    // continue
  }
  if (g.phase !== "ending") L.finishGame(g);
  return g;
}

var innocentEscapes = 0;
var endings = {};
for (var s = 1; s <= 20; s++) {
  var g = playthrough(s * 17, { voteMind: false, mindLies: false });
  assert(g.phase === "ending", "game ended seed=" + s);
  assert(!!g.ending, "ending present");
  assert(typeof g.ending.title === "string" && g.ending.title.length > 0, "ending title");
  assert(typeof g.ending.body === "string" && g.ending.body.length > 10, "ending body");
  endings[g.ending.kind] = (endings[g.ending.kind] || 0) + 1;
  if (g.mindId !== L.PLAYER_ID && g.ending.escaped) innocentEscapes++;
  // Chat should have content
  assert(g.chat.length >= 8, "chat has messages seed=" + s + " count=" + g.chat.length);
}

assert(innocentEscapes >= 8, "innocent player who knows answers usually escapes (got " + innocentEscapes + ")");

// --- Wrong answers can trap the team ---
(function () {
  var trapped = 0;
  for (var s = 1; s <= 8; s++) {
    var g = playthrough(s * 3 + 1, { wrongAnswers: true });
    if (g.ending.trapped || g.ending.kind.indexOf("trap") >= 0 || g.ending.kind === "mind_win_trapped" || g.ending.kind === "trapped") {
      trapped++;
    }
    assert(g.ending.trapped === true || g.strikes > g.maxStrikes, "wrong answers lead to too many strikes seed=" + s + " kind=" + g.ending.kind + " strikes=" + g.strikes);
  }
  assert(trapped >= 6, "most wrong-answer games are trapped");
})();

// --- Player as Mind: lie + wrong steer still produces a valid ending ---
(function () {
  var foundMind = false;
  for (var s = 1; s <= 80 && !foundMind; s++) {
    var g0 = L.createGame({ playerName: "അമൽ", seed: s });
    if (g0.mindId === L.PLAYER_ID) {
      foundMind = true;
      var g = playthrough(s, { mindLies: true, wrongAnswers: true });
      assert(g.ending.playerIsMind, "ending knows player is Mind");
      assert(typeof g.ending.title === "string", "mind ending has title");
    }
  }
  assert(foundMind, "found a seed where player is the Mind");
})();

// --- Voting out the Mind is recorded ---
(function () {
  var ejectedMind = false;
  for (var s = 1; s <= 40; s++) {
    var g0 = L.createGame({ playerName: "A", seed: s * 5 });
    if (g0.mindId === L.PLAYER_ID) continue;
    var g = playthrough(s * 5, { voteMind: true });
    if (g.history.ejections.some(function (e) { return e.wasMind; })) {
      ejectedMind = true;
      break;
    }
  }
  assert(ejectedMind, "player can vote out the Mind (with bot help / majority — may skip if no majority)");
  // This might flake if bots don't agree. Don't fail the suite hard if close — we just note it.
})();

// --- Whispers generate ---
(function () {
  var whispers = 0;
  for (var s = 1; s <= 15; s++) {
    var g = L.createGame({ playerName: "A", seed: s * 11 });
    L.beginStage(g);
    L.enterDiscussion(g);
    L.tickDiscussion(g, 20000);
    whispers += g.whispers.length;
  }
  assert(whispers >= 5, "whispers appear in some games (got " + whispers + ")");
})();

// --- Conflict detector ---
(function () {
  assert(
    L.cluesConflict(
      { type: "digit", pos: 0, value: 1 },
      { type: "digit", pos: 0, value: 2 }
    ),
    "conflicting digits"
  );
  assert(
    !L.cluesConflict(
      { type: "digit", pos: 0, value: 1 },
      { type: "digit", pos: 1, value: 2 }
    ),
    "different positions do not conflict"
  );
  assert(
    L.cluesConflict({ type: "box_is", color: "red" }, { type: "box_not", color: "red" }),
    "box is vs not"
  );
})();

// --- leftOf forms a circle ---
(function () {
  var g = L.createGame({ playerName: "A", seed: 9 });
  var seen = {};
  var id = L.PLAYER_ID;
  for (var i = 0; i < 6; i++) {
    id = L.leftOf(g, id);
    assert(!!id, "leftOf returns id");
    seen[id] = true;
  }
  assertEq(L.leftOf(g, id) ? 1 : 0, 1, "circle continues");
  // walking 6 steps from player should return to a consistent cycle of all 6
  assertEq(Object.keys(seen).length, 6, "leftOf visits everyone");
})();

console.log("Passed:", passed, "Failed:", failed);
if (failed) process.exit(1);

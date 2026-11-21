#!/usr/bin/env node
"use strict";

var P = require("./puzzles.js");
var L = require("./logic.js");
var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error("FAIL:", msg);
  }
}

function assertEq(a, b, msg) {
  assert(a === b, msg + " (got " + JSON.stringify(a) + ", expected " + JSON.stringify(b) + ")");
}

// 1. Puzzle Bank Integrity (100+ puzzles)
assert(P.count >= 100, "At least 100 puzzles in bank (got " + P.count + ")");
var seenIds = {};
P.ALL_PUZZLES.forEach(function (p) {
  assert(!seenIds[p.id], "Unique puzzle id: " + p.id);
  seenIds[p.id] = true;
  assert(!!P.CATEGORIES[p.category], "Valid category for " + p.id);
  assert(typeof p.prompt === "string" && p.prompt.length > 3, "Prompt present for " + p.id);
  assert(typeof p.hint === "string" && p.hint.length > 2, "Hint present for " + p.id);
  assert(typeof p.badHint === "string" && p.badHint.length > 2, "Bad hint present for " + p.id);
  assert(p.hint !== p.badHint, "Hint differs from badHint for " + p.id);
  assert(typeof p.answer === "string" && p.answer.length > 0, "Answer present for " + p.id);
  assert(typeof p.wrongOption === "string" && p.wrongOption !== p.answer, "Wrong option differs from answer for " + p.id);

  if (p.inputType === "choice") {
    assert(Array.isArray(p.options) && p.options.length === 4, "4 options for " + p.id);
    assert(p.options.indexOf(p.answer) >= 0, "Answer in options for " + p.id);
    assert(p.options.indexOf(p.wrongOption) >= 0, "Wrong option in options for " + p.id);
  } else if (p.inputType === "keypad") {
    assert(/^\d+$/.test(p.answer), "Keypad answer numeric for " + p.id);
  } else {
    assert(false, "Unknown inputType for " + p.id);
  }
});

// 2. Escape Session creation & JSON serializability
var g = L.createSession({ mode: "escape", playerName: "അമൽ", seed: 101 });
assertEq(g.participants.length, 5, "1 player + 4 AI teammates");
assertEq(g.chambers.length, 3, "3 escape chambers");
assert(!!g.mindId, "A secret Mind is chosen");
assert(g.participants.filter(function (p) { return p.isMind; }).length === 1, "Exactly one Mind");
var roundtrip = JSON.parse(JSON.stringify(g));
assertEq(roundtrip.mindId, g.mindId, "State is cleanly JSON-serializable for future multiplayer");

// 3. Marathon mode has 100 puzzle slots (20 locks x 5)
var m = L.createSession({ mode: "marathon", playerName: "അമൽ", seed: 202 });
assertEq(m.chambers.length, 20, "Marathon has 20 locks");
var totalMarathonSlots = m.chambers.reduce(function (acc, c) { return acc + c.slots.length; }, 0);
assertEq(totalMarathonSlots, 100, "Marathon has 100 puzzle slots");

// 4. Bot ticker solves slots, triggers help requests, and Mind can sabotage
var sawNeedsHelp = false;
var sawBotSolved = false;
var sawSabotage = false;
for (var s = 1; s <= 12; s++) {
  var sim = L.createSession({ mode: "escape", playerName: "T", seed: s * 31 });
  for (var t = 0; t < 45; t++) {
    var tick = L.tickSession(sim, 1);
    (tick.events || []).forEach(function (ev) {
      if (ev.kind === "needs_help") sawNeedsHelp = true;
      if (ev.kind === "bot_solved") sawBotSolved = true;
    });
  }
  var ch = L.getCurrentChamber(sim);
  if (ch.slots.some(function (sl) { return sl.corrupted; })) sawSabotage = true;
}
assert(sawBotSolved, "AI teammates solve slots over time");
assert(sawNeedsHelp, "AI teammates sometimes get stuck and request player help");
assert(sawSabotage, "The Mind sometimes locks a corrupted answer");

// 5. Asking teammates for help respects cooldown & returns hints
(function () {
  var s = L.createSession({ mode: "escape", playerName: "A", seed: 55 });
  var ch = L.getCurrentChamber(s);
  var slot = ch.slots.filter(function (x) { return x.ownerId === L.PLAYER_ID; })[0];
  var honest = s.participants.filter(function (p) { return p.kind === "bot" && !p.isMind; })[0];
  var res1 = L.askTeammateHelp(s, slot.id, honest.id);
  assert(res1.ok && !res1.help.isDeceptive, "Honest teammate gives truthful help");
  var resCd = L.askTeammateHelp(s, slot.id, honest.id);
  assert(!resCd.ok && resCd.reason === "cooldown", "Teammate help has cooldown");
})();

// 6. Full Escape Playthrough (solving all slots + fixing Mind sabotage + catching Mind)
(function () {
  var s = L.createSession({ mode: "escape", playerName: "അമൽ", seed: 777 });
  for (var c = 0; c < 3; c++) {
    // Advance bots
    for (var step = 0; step < 30; step++) L.tickSession(s, 1);
    var ch = L.getCurrentChamber(s);
    // Solve any unsolved or needs_help slots
    ch.slots.forEach(function (sl) {
      if (sl.status !== "solved") {
        var puz = P.byId(sl.puzzleId);
        var r = L.submitSlotAnswer(s, sl.id, puz.answer);
        assert(r.ok && r.correct, "Player solved slot " + sl.id);
      }
    });
    var ul = L.unlockChamber(s);
    assert(ul.ok, "Unlock chamber called");
    if (ul.sabotageDetected) {
      var fixedSl = L.findSlot(s, ul.fault.slotId);
      var fpuz = P.byId(fixedSl.puzzleId);
      var fr = L.submitSlotAnswer(s, fixedSl.id, fpuz.answer);
      assert(fr.ok && fr.correct, "Fixed sabotaged slot");
      ul = L.unlockChamber(s);
      assert(ul.ok && ul.unlocked, "Chamber unlocked after fixing sabotage");
    }
  }
  assertEq(s.status, "accuse", "Reached final Mind accusation");
  var acc = L.accuseParticipant(s, s.mindId);
  assert(acc.ok && acc.caughtMind, "Accusing Mind succeeds");
  assertEq(s.status, "ended", "Game ended");
  assert(s.ending.escaped && s.ending.mindCaught, "Ending confirms escape & Mind caught");
})();

// 7. Fuse depletion & Timeout endings
(function () {
  var s1 = L.createSession({ mode: "escape", playerName: "A", seed: 11 });
  var sl = L.getCurrentChamber(s1).slots.filter(function (x) { return x.ownerId === L.PLAYER_ID; })[0];
  var wrong = P.byId(sl.puzzleId).wrongOption;
  L.submitSlotAnswer(s1, sl.id, wrong);
  L.submitSlotAnswer(s1, sl.id, wrong);
  var r3 = L.submitSlotAnswer(s1, sl.id, wrong);
  assert(r3.fatal && s1.status === "ended", "3 wrong answers blow all fuses");

  var s2 = L.createSession({ mode: "escape", playerName: "A", seed: 12 });
  s2.timerSec = 1;
  L.tickSession(s2, 2);
  assert(s2.status === "ended" && s2.ending.reason === "timeout", "Timer reaching 0 ends game");
})();

// 8. Swap puzzle draws a new puzzle
(function () {
  var s = L.createSession({ mode: "escape", playerName: "A", seed: 33 });
  var ch = L.getCurrentChamber(s);
  var sl = ch.slots.filter(function (x) { return x.ownerId === L.PLAYER_ID; })[0];
  var oldId = sl.puzzleId;
  var sw = L.swapSlotPuzzle(s, sl.id);
  assert(sw.ok && sw.puzzleId !== oldId, "Swap replaces puzzle with a fresh one");
})();

console.log("Passed:", passed, "Failed:", failed);
if (failed) process.exit(1);

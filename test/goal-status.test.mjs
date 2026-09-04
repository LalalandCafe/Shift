import { test } from "node:test";
import assert from "node:assert/strict";
import { goalStatus, cfgFromTarget } from "../lib/scale.js";

test("goalStatus: onGoal when value already meets a lower-is-better target", () => {
  assert.equal(goalStatus(250, { target: 300, redLine: 420, lowerIsBetter: true }), "onGoal");
});

test("goalStatus: action when value crosses the red-line, lower-is-better", () => {
  assert.equal(goalStatus(450, { target: 300, redLine: 420, lowerIsBetter: true }), "action");
});

test("goalStatus: offGoal when missing target but short of the red-line", () => {
  assert.equal(goalStatus(350, { target: 300, redLine: 420, lowerIsBetter: true }), "offGoal");
});

test("goalStatus: offGoal (never action) when redLine is null, higher-is-better", () => {
  assert.equal(goalStatus(-3.55, { target: 0, redLine: null, lowerIsBetter: false }), "offGoal");
});

test("goalStatus: onGoal when redLine is null but target is already met", () => {
  assert.equal(goalStatus(2, { target: 0, redLine: null, lowerIsBetter: false }), "onGoal");
});

test("goalStatus: none when value is null", () => {
  assert.equal(goalStatus(null, { target: 300, redLine: 420 }), "none");
});

test("goalStatus: none when cfg has no target", () => {
  assert.equal(goalStatus(100, { redLine: 420 }), "none");
});

test("cfgFromTarget: null red_value stays null, not coerced to 0", () => {
  const cfg = cfgFromTarget({ metric: "sssg", target_value: 0, red_value: null, lower_is_better: false, unit: "percent" });
  assert.equal(cfg.redLine, null);
});

test("cfgFromTarget: a real red_value still comes through as a number", () => {
  const cfg = cfgFromTarget({ metric: "dt_window", target_value: 150, red_value: 165, lower_is_better: true, unit: "seconds" });
  assert.equal(cfg.redLine, 165);
});

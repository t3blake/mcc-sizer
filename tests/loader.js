/**
 * Loads the browser-global JS files into a shared context for Node testing.
 * Evaluates data.js, sizing.js, and policies.js in order so that
 * MCC_DATA, SizingEngine, and PolicyEngine are available as exports.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = vm.createContext({
  Math, console, parseInt, parseFloat,
  String, Number, Object, Array, JSON
});

const files = ["data.js", "sizing.js", "policies.js"];
for (const file of files) {
  let code = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf-8");
  // Convert const declarations at the top level to var so they become
  // context properties accessible after evaluation
  code = code.replace(/^const\s+/gm, "var ");
  vm.runInContext(code, context, { filename: file });
}

module.exports = {
  MCC_DATA: context.MCC_DATA,
  SizingEngine: context.SizingEngine,
  PolicyEngine: context.PolicyEngine
};

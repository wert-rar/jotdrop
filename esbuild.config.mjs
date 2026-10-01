import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prod = process.argv[2] === "production";
const root = path.dirname(fileURLToPath(import.meta.url));
const bundledPackages = ["markdown-it", "mdurl", "uc.micro", "entities", "linkify-it", "punycode.js"];
const notices = bundledPackages.map((name) => {
  const directory = path.join(root, "node_modules", name);
  const license = fs.readdirSync(directory).find((file) => /^license(?:[.-]|$)/i.test(file));
  if (!license) throw new Error(`Missing license for bundled package ${name}`);
  return `${name}\n${fs.readFileSync(path.join(directory, license), "utf8")}`;
});
notices.unshift(fs.readFileSync(path.join(root, "LICENSE"), "utf8"));
const nativeNotice = fs.readFileSync(path.join(root, "THIRD_PARTY.md"), "utf8").match(/Copyright[\s\S]*/)?.[0];
if (!nativeNotice) throw new Error("Missing native editor attribution in THIRD_PARTY.md");
notices.push(nativeNotice);

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  banner: { js: `/*!\n${notices.join("\n\n").replace(/\*\//g, "* /")}\n*/` },
});

if (prod) {
  await context.rebuild();
  await context.dispose();
  process.exit(0);
} else {
  await context.watch();
}

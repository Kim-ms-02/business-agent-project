import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// v1.1 step 1: the site mockup's colors and fonts as CSS variables in globals.css.
// Every text color pair must reach WCAG AA (4.5:1) and the focus ring 3:1, in light and dark.

const css = readFileSync("src/app/globals.css", "utf8");

type Declarations = Record<string, string>;

function declarations(body: string): Declarations {
  const result: Declarations = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) result[match[1]] = match[2].trim();
  return result;
}

// The body of the first rule whose selector is exactly `selector`, searching from `from`.
function rule(selector: string, from = 0): Declarations {
  const start = css.indexOf(`${selector} {`, from);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  const open = css.indexOf("{", start);
  return declarations(css.slice(open + 1, css.indexOf("}", open)));
}

const light = rule(":root");
const darkBySystem = rule(':root:not([data-theme="light"])', css.indexOf("@media (prefers-color-scheme: dark)"));
const darkByChoice = rule(':root[data-theme="dark"]');
const dark = { ...light, ...darkBySystem };

function resolve(theme: Declarations, name: string): string {
  let value = theme[name];
  for (let guard = 0; value?.startsWith("var("); guard++) {
    if (guard > 10) throw new Error(`variable loop at ${name}`);
    value = theme[value.slice(4, -1).trim()];
  }
  if (!value) throw new Error(`${name} is not defined`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(theme: Declarations, fg: string, bg: string): number {
  const [a, b] = [luminance(resolve(theme, fg)), luminance(resolve(theme, bg))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const BASE_COLORS = ["--paper", "--sheet", "--ink", "--muted", "--line", "--spot", "--spot-ink", "--spot-wash", "--good", "--good-wash"];

// Text color on background, as the screens use them.
const TEXT_PAIRS: [string, string][] = [
  ["--ink", "--paper"],
  ["--ink", "--sheet"],
  ["--muted", "--paper"],
  ["--muted", "--sheet"],
  ["--paper", "--ink"], // primary button and the dark question block
  ["--spot-ink", "--spot-wash"], // sentence marks, first thing to fix label
  ["--spot-ink", "--sheet"],
  ["--spot-ink", "--paper"],
  ["--ink", "--spot-wash"],
  ["--muted", "--spot-wash"],
  ["--good", "--good-wash"], // "브라우저 안" tag
  ["--good", "--sheet"],
  ["--danger", "--danger-surface"], // error messages
  ["--danger", "--sheet"],
  ["--warning-text", "--warning-surface"], // quote not found in the script
  ["--warning-text", "--sheet"],
  ["--ink", "--warning-surface"],
];

describe("color tokens", () => {
  it("has the mockup's base colors as hex values in light mode", () => {
    for (const name of BASE_COLORS) expect(light[name], name).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("gives every light color a dark value, and the two dark rules agree", () => {
    const lightColors = Object.keys(light).filter((name) => /^#/.test(light[name]));
    expect(Object.keys(darkBySystem).sort()).toEqual(lightColors.sort());
    expect(darkByChoice).toEqual(darkBySystem);
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ])("keeps text at 4.5:1 or more in %s mode", (_, theme) => {
    for (const [fg, bg] of TEXT_PAIRS) expect(contrast(theme, fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ])("keeps the focus ring at 3:1 or more in %s mode", (_, theme) => {
    for (const bg of ["--paper", "--sheet", "--spot-wash"]) {
      expect(contrast(theme, "--focus-ring", bg), `focus ring on ${bg}`).toBeGreaterThanOrEqual(3);
    }
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:[^;]*var\(--focus-ring\)/);
  });

  it("uses the dark orange for the focus ring in light mode", () => {
    expect(resolve(light, "--focus-ring")).toBe(resolve(light, "--spot-ink"));
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("fonts", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");

  it("bundles the three mockup fonts with next/font", () => {
    expect(layout).toMatch(/import\s*\{[^}]*\bNoto_Serif_KR\b[^}]*\}\s*from\s*"next\/font\/google"/);
    expect(layout).toMatch(/import\s*\{[^}]*\bIBM_Plex_Sans_KR\b[^}]*\}\s*from\s*"next\/font\/google"/);
    expect(layout).toMatch(/import\s*\{[^}]*\bIBM_Plex_Mono\b[^}]*\}\s*from\s*"next\/font\/google"/);
  });

  it("points the display, body, and number fonts at the bundled fonts", () => {
    expect(light["--display"]).toMatch(/^var\(--font-[\w-]+\)/);
    expect(light["--body"]).toMatch(/^var\(--font-[\w-]+\)/);
    expect(light["--mono"]).toMatch(/^var\(--font-[\w-]+\)/);
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--body\)/);
    expect(css).toMatch(/h1,\s*h2,\s*h3\s*\{[^}]*font-family:\s*var\(--display\)/);
  });

  it("never asks a font server while the app runs", () => {
    for (const file of sourceFiles("src")) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    }
  });
});

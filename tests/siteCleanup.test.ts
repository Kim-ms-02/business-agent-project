import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// v1.1 step 7: cleanup. The app's CSS asks no outside server for fonts, Pretendard is gone, the
// older color names are gone, and every class in a CSS module is still used by its page.

function files(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, ext) : path.endsWith(ext) ? [path] : [];
  });
}

const cssFiles = files("src", ".css");
const codeFiles = [...files("src", ".tsx"), ...files("src", ".ts")];

describe("fonts and stylesheets", () => {
  it("loads no stylesheet from a package or another server", () => {
    for (const file of codeFiles) {
      for (const [, path] of readFileSync(file, "utf8").matchAll(/import\s+(?:\w+\s+from\s+)?"([^"]+\.css)"/g)) {
        expect(path.startsWith("."), `${file} imports ${path}`).toBe(true);
      }
    }
  });

  it("has no outside address or @import in the app's CSS", () => {
    for (const file of cssFiles) {
      const css = readFileSync(file, "utf8");
      expect(css, file).not.toMatch(/url\(\s*["']?(https?:)?\/\//);
      expect(css, file).not.toMatch(/@import/);
    }
  });

  it("no longer has Pretendard", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty("pretendard");
    for (const file of [...codeFiles, ...cssFiles]) expect(readFileSync(file, "utf8"), file).not.toMatch(/pretendard/i);
  });
});

const OLD_NAMES = ["--background", "--foreground", "--border", "--surface", "--accent", "--accent-text", "--focus-surface"];

describe("color names", () => {
  it.each(OLD_NAMES)("no longer has the older name %s", (name) => {
    for (const file of cssFiles) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(new RegExp(`${name}\\s*[:)]`));
    }
  });
});

describe("CSS modules", () => {
  // Classes each module defines, and the names its importers use (styles.x, own.x).
  const modules = cssFiles.filter((f) => f.endsWith(".module.css"));

  it.each(modules)("%s has no unused class", (module) => {
    const css = readFileSync(module, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(([, name]) => name));
    const used = new Set<string>();
    for (const file of codeFiles) {
      const code = readFileSync(file, "utf8");
      for (const [, alias, path] of code.matchAll(/import\s+(\w+)\s+from\s+"([^"]+\.module\.css)"/g)) {
        if (resolve(dirname(file), path) !== resolve(module)) continue;
        for (const [, name] of code.matchAll(new RegExp(`\\b${alias}\\.(\\w+)`, "g"))) used.add(name);
      }
    }
    expect([...defined].filter((name) => !used.has(name)).sort()).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../src/lib/args.js";
import { truncate } from "../src/lib/truncate.js";
import { resolveBody } from "../src/lib/input.js";
import { toon, renderHelp } from "../src/output/toon.js";
import { priorityToNumber, splitList, isUuid } from "../src/linear/resolve.js";

const SCHEMA = {
  state: { type: "string" as const, description: "" },
  full: { type: "boolean" as const, description: "" },
};

describe("parseArgs", () => {
  it("parses string and boolean flags plus positionals", () => {
    const r = parseArgs(["MYT-1", "--state", "open", "--full"], SCHEMA, "issue view");
    expect(r.positionals).toEqual(["MYT-1"]);
    expect(r.flags.state).toBe("open");
    expect(r.flags.full).toBe(true);
    expect(r.help).toBe(false);
  });

  it("supports --flag=value", () => {
    const r = parseArgs(["--state=done"], SCHEMA, "issue list");
    expect(r.flags.state).toBe("done");
  });

  it("always allows --help", () => {
    const r = parseArgs(["--help"], SCHEMA, "issue list");
    expect(r.help).toBe(true);
  });

  it("rejects unknown flags with exit code 2", () => {
    try {
      parseArgs(["--nope"], SCHEMA, "issue list");
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e.exitCode).toBe(2);
      expect(e.message).toContain("unknown flag --nope");
    }
  });

  it("errors when a string flag is missing its value", () => {
    expect(() => parseArgs(["--state"], SCHEMA, "issue list")).toThrowError(/requires a value/);
  });
});

describe("truncate", () => {
  it("passes short text through untouched", () => {
    const t = truncate("hello", 800);
    expect(t.truncated).toBe(false);
    expect(t.text).toBe("hello");
    expect(t.totalChars).toBe(5);
  });

  it("truncates long text and reports total size", () => {
    const t = truncate("x".repeat(1000), 800);
    expect(t.truncated).toBe(true);
    expect(t.text.length).toBe(800);
    expect(t.totalChars).toBe(1000);
  });
});

describe("toon output", () => {
  it("emits a tabular array with a field header", () => {
    const out = toon({ count: 2, issues: [{ id: "A-1", title: "x", state: "Todo" }] });
    expect(out).toContain("count: 2");
    expect(out).toContain("issues[1]{id,title,state}:");
  });

  it("renders help as one command per line", () => {
    const out = renderHelp(["run a", "run b"]);
    expect(out).toBe("help[2]:\n  run a\n  run b");
  });
});

describe("resolveBody (flag or file)", () => {
  it("returns the inline value when no file is given", () => {
    expect(resolveBody("hi", undefined, "description")).toBe("hi");
    expect(resolveBody(undefined, undefined, "description")).toBeUndefined();
  });

  it("reads the body from a file", () => {
    const dir = mkdtempSync(join(tmpdir(), "axi-"));
    const p = join(dir, "body.md");
    writeFileSync(p, "from file");
    expect(resolveBody(undefined, p, "description")).toBe("from file");
  });

  it("rejects passing both the flag and the file with exit 2", () => {
    try {
      resolveBody("a", "b", "description");
      throw new Error("should throw");
    } catch (e: any) {
      expect(e.exitCode).toBe(2);
      expect(e.message).toContain("not both");
    }
  });
});

describe("resolve helpers", () => {
  it("maps priority labels to Linear numbers", () => {
    expect(priorityToNumber("urgent")).toBe(1);
    expect(priorityToNumber("High")).toBe(2);
    expect(priorityToNumber("none")).toBe(0);
  });

  it("rejects invalid priority with exit 2", () => {
    try {
      priorityToNumber("later");
      throw new Error("should throw");
    } catch (e: any) {
      expect(e.exitCode).toBe(2);
    }
  });

  it("splits and trims comma lists, dropping empties", () => {
    expect(splitList("Bug, Improvement ,, Feature")).toEqual(["Bug", "Improvement", "Feature"]);
    expect(splitList(undefined)).toEqual([]);
  });

  it("distinguishes a UUID from a human name", () => {
    expect(isUuid("92b5fa12-7345-477b-a949-762e24500233")).toBe(true);
    expect(isUuid("Milestone 3")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

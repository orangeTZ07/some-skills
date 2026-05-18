#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function fail(message) {
  process.stderr.write(`Failure: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { _: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const item = rest[i];
    if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = rest[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(item);
    }
  }
  return { command, args };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function atomicWrite(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    fail(`Invalid JSON at ${file}: ${err.message}`);
  }
}

function writeJson(file, value) {
  atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
}

function slugify(input) {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeVault(vault) {
  if (!vault) fail("Missing --vault");
  const resolved = path.resolve(vault);
  if (!fs.existsSync(resolved)) fail(`Vault does not exist: ${resolved}`);
  if (!fs.statSync(resolved).isDirectory()) fail(`Vault is not a directory: ${resolved}`);
  return resolved;
}

function parseTags(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return [];
  const tagLine = match[1].split(/\r?\n/).find((line) => /^tags\s*:/.test(line.trim()));
  if (!tagLine) return [];
  const raw = tagLine.replace(/^tags\s*:\s*/, "").trim();
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw.slice(1, -1).split(",").map((tag) => tag.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  return raw.split(/\s+/).map((tag) => tag.replace(/^#/, "").trim()).filter(Boolean);
}

function walkMarkdown(dir, root = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === ".obsidian") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(full, root, out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(path.relative(root, full).replaceAll(path.sep, "/"));
    }
  }
  return out;
}

function writeNote(args) {
  const vault = normalizeVault(args.vault);
  const title = args.title;
  if (!title) fail("Missing --title");
  if (!args.body) fail("Missing --body");
  const bodyFile = path.resolve(args.body);
  if (!fs.existsSync(bodyFile)) fail(`Body file does not exist: ${bodyFile}`);

  const tags = String(args.tags || "")
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);
  const folder = args.folder || "Notes";
  const slug = args.slug || slugify(title);
  const rel = path.posix.join(folder.replace(/^\/+|\/+$/g, ""), `${slug}.md`);
  const out = path.join(vault, rel);
  if (fs.existsSync(out) && !args.force) fail(`Note already exists: ${out}. Pass --force to overwrite.`);

  const body = fs.readFileSync(bodyFile, "utf8").trimEnd();
  const frontmatter = [
    "---",
    `title: "${title.replaceAll('"', '\\"')}"`,
    `date: "${today()}"`,
    `tags: [${tags.join(", ")}]`,
    "source: conversation",
    "---",
    "",
  ].join("\n");

  atomicWrite(out, `${frontmatter}${body}\n`);
  process.stdout.write(JSON.stringify({ note_path: out, note_relative_path: rel, tags }, null, 2) + "\n");
}

function initProfile(args) {
  const vault = normalizeVault(args.vault);
  const stateDir = path.join(vault, ".obsidian-learner");
  ensureDir(stateDir);
  const profilePath = path.join(stateDir, "style_profile.json");
  const glossaryPath = path.join(stateDir, "glossary.json");
  if (!fs.existsSync(profilePath)) {
    writeJson(profilePath, {
      top_heading_level: 2,
      step_verbosity: "detailed",
      code_block_lang_required: true,
      tag_location: "frontmatter",
      use_callouts: true,
    });
  }
  if (!fs.existsSync(glossaryPath)) writeJson(glossaryPath, {});
  process.stdout.write(JSON.stringify({ profile_path: profilePath, glossary_path: glossaryPath }, null, 2) + "\n");
}

function updateCanvas(args) {
  const vault = normalizeVault(args.vault);
  if (!args.note) fail("Missing --note");
  const noteRel = args.note.replaceAll(path.sep, "/").replace(/^\/+/, "");
  const noteAbs = path.join(vault, noteRel);
  if (!fs.existsSync(noteAbs)) fail(`Note does not exist: ${noteAbs}`);
  const canvasRel = (args.canvas || "Knowledge.canvas").replaceAll(path.sep, "/").replace(/^\/+/, "");
  const canvasAbs = path.join(vault, canvasRel);

  let canvas = { nodes: [], edges: [] };
  if (fs.existsSync(canvasAbs)) {
    try {
      canvas = JSON.parse(fs.readFileSync(canvasAbs, "utf8"));
    } catch (err) {
      fs.copyFileSync(canvasAbs, `${canvasAbs}.bak`);
      canvas = { nodes: [], edges: [] };
    }
  }
  canvas.nodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
  canvas.edges = Array.isArray(canvas.edges) ? canvas.edges : [];

  const noteText = fs.readFileSync(noteAbs, "utf8");
  const tags = parseTags(noteText);
  const existing = walkMarkdown(vault).filter((rel) => rel !== noteRel);
  const related = existing
    .map((rel) => {
      const otherTags = parseTags(fs.readFileSync(path.join(vault, rel), "utf8"));
      const shared = otherTags.filter((tag) => tags.includes(tag));
      return { rel, shared };
    })
    .filter((item) => item.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length)
    .slice(0, 5);

  const maxX = canvas.nodes.reduce((max, node) => Math.max(max, Number(node.x) || 0), 0);
  const avgY = canvas.nodes.length
    ? Math.round(canvas.nodes.reduce((sum, node) => sum + (Number(node.y) || 0), 0) / canvas.nodes.length)
    : 0;
  const noteId = `file:${noteRel}`;
  if (!canvas.nodes.some((node) => node.id === noteId)) {
    canvas.nodes.push({ id: noteId, type: "file", file: noteRel, x: maxX + 300, y: avgY, width: 400, height: 240 });
  }

  for (const [index, item] of related.entries()) {
    const targetId = `file:${item.rel}`;
    if (!canvas.nodes.some((node) => node.id === targetId)) {
      canvas.nodes.push({ id: targetId, type: "file", file: item.rel, x: maxX, y: avgY + (index - 2) * 260, width: 400, height: 240 });
    }
    const edgeId = `${noteId}->${targetId}`;
    if (!canvas.edges.some((edge) => edge.id === edgeId)) {
      canvas.edges.push({ id: edgeId, fromNode: noteId, toNode: targetId, label: `tag: ${item.shared[0]}` });
    }
  }

  atomicWrite(canvasAbs, `${JSON.stringify(canvas, null, 2)}\n`);
  process.stdout.write(JSON.stringify({ canvas_path: canvasAbs, linked_notes: related }, null, 2) + "\n");
}

function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  if (command === "write-note") return writeNote(args);
  if (command === "init-profile") return initProfile(args);
  if (command === "update-canvas") return updateCanvas(args);
  fail("Usage: write-note | init-profile | update-canvas");
}

main();

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(".");
if (!fs.existsSync("dist/index.html"))
  throw new Error("Run npm run build before packaging.");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const release = path.resolve(root, "release", `duel-v1-${timestamp}`);
fs.mkdirSync(release, { recursive: true });
fs.cpSync("dist", path.join(release, "public_html"), { recursive: true });
const backend = path.join(release, "server");
fs.mkdirSync(backend, { recursive: true });
for (const name of [
  "bootstrap.php",
  "schema.sql",
  "config.example.php",
  ".htaccess",
  "src",
  "bin",
])
  fs.cpSync(path.join("server", name), path.join(backend, name), {
    recursive: true,
  });
fs.mkdirSync(path.join(backend, "data"));
fs.copyFileSync(
  "public/policies/80_20_difficult.policy.json",
  path.join(backend, "data/80_20_difficult.policy.json"),
);
fs.cpSync("documentation", path.join(release, "documentation"), {
  recursive: true,
});
fs.copyFileSync(
  "node_modules/flag-icons/LICENSE",
  path.join(release, "FLAG-ICONS-LICENSE.txt"),
);
fs.writeFileSync(
  path.join(release, "BUILD.json"),
  JSON.stringify(
    {
      version: JSON.parse(fs.readFileSync("package.json", "utf8")).version,
      commit: process.env.GITHUB_SHA ?? null,
      builtAt: new Date().toISOString(),
      layout: "public_html/ + sibling server/",
      privateConfigIncluded: false,
    },
    null,
    2,
  ),
);
for (const forbidden of [
  "server/config.php",
  "server/config.test.php",
  "server/tests",
  "public_html/server",
])
  if (fs.existsSync(path.join(release, forbidden)))
    throw new Error(`Unexpected private/test file in package: ${forbidden}`);
// Use Python's standard library; no production runtime or package dependency.
execFileSync(
  "python",
  [
    "-c",
    'import shutil,sys; shutil.make_archive(sys.argv[1], "zip", sys.argv[2])',
    release,
    release,
  ],
  { stdio: "inherit" },
);
console.log(`Ready: ${release}.zip`);

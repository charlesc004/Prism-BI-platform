import process from "node:process";
import console from "node:console";

const [major, minor] = process.versions.node.split(".").map(Number);
if (!((major === 24 && minor >= 22) || major >= 26)) {
  console.error(
    `PRISM requires Node 24.22+ (LTS) or 26+. Running ${process.version}. ` +
      "Install the version in .node-version and run npm ci before starting development.",
  );
  process.exitCode = 1;
}

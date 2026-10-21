import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import console from "node:console";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";

test(
  "native dev server survives browser disconnects and rebuilds styles",
  { timeout: 180000 },
  async () => {
    const listener = createServer();
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    const { port } = listener.address();
    await new Promise((resolve) => listener.close(resolve));

    const server = spawn(
      process.execPath,
      [
        resolve("node_modules/@angular/cli/bin/ng.js"),
        "serve",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      { cwd: resolve("apps/web"), stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    let exit;
    const exited = once(server, "exit").then(([code, signal]) => {
      exit = { code, signal };
    });
    server.stdout.on("data", (data) => {
      output = (output + data).slice(-20000);
    });
    server.stderr.on("data", (data) => {
      output = (output + data).slice(-20000);
    });
    const url = `http://127.0.0.1:${port}`;
    const stylesheet = resolve("apps/web/src/styles.css");
    const original = await readFile(stylesheet);
    let browser;
    let edited = false;
    try {
      let ready = false;
      for (let attempt = 0; attempt < 90; attempt++) {
        assert.equal(
          exit,
          undefined,
          `Dev server exited: ${JSON.stringify(exit)}\n${output}`,
        );
        try {
          ready = (
            await globalThis.fetch(url, {
              signal: globalThis.AbortSignal.timeout(1000),
            })
          ).ok;
        } catch {
          /* Still compiling. */
        }
        if (ready) break;
        await delay(1000);
      }
      assert(ready, `Dev server did not become ready:\n${output}`);
      browser = await chromium.launch(
        process.env.PLAYWRIGHT_CHANNEL
          ? { channel: process.env.PLAYWRIGHT_CHANNEL }
          : {},
      );
      for (let round = 0; round < 30; round++) {
        const context = await browser.newContext({
          viewport: { width: [320, 768, 1440][round % 3], height: 900 },
        });
        const page = await context.newPage();
        await page.goto(`${url}/login`);
        await expect(
          page.getByRole("button", { name: "Sign in to workspace" }),
        ).toBeVisible();
        await context.close();
        assert.equal(
          exit,
          undefined,
          `Server exited after browser disconnect:\n${output}`,
        );
      }
      const page = await browser.newPage();
      await page.goto(`${url}/login`);
      edited = true;
      await writeFile(
        stylesheet,
        Buffer.concat([
          original,
          Buffer.from("\n:root { --prism-dev-probe: ready; }\n"),
        ]),
      );
      await expect(page.locator("html")).toHaveCSS(
        "--prism-dev-probe",
        "ready",
        { timeout: 30000 },
      );
      await writeFile(stylesheet, original);
      edited = false;
      await expect(page.locator("html")).toHaveCSS("--prism-dev-probe", "", {
        timeout: 30000,
      });
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Sign in to workspace" }),
      ).toBeVisible();
      assert.equal(exit, undefined, `Server exited after rebuild:\n${output}`);
      console.log(
        `Verified 30 browser disconnects and style update/restore on Node ${process.versions.node}.`,
      );
    } catch (error) {
      throw new Error(`Native dev-server regression failed.\n${output}`, {
        cause: error,
      });
    } finally {
      if (edited) await writeFile(stylesheet, original);
      await browser?.close();
      if (!exit) server.kill("SIGTERM");
      await exited;
    }
  },
);

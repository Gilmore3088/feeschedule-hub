/**
 * Vercel Sandbox helper for the heavy extract stage — the Modal replacement.
 *
 * Spins an ephemeral Linux microVM, installs Chromium + agent-browser, opens a
 * URL, and returns the page's accessibility text for the LLM extractor. Follows
 * the Vercel Sandbox browser-automation pattern.
 *
 * On a Vercel deployment the SDK authenticates via OIDC automatically. Locally,
 * set VERCEL_TOKEN / VERCEL_TEAM_ID / VERCEL_PROJECT_ID. With neither present,
 * Sandbox.create throws — i.e. live extraction runs in the cloud, not on a dev
 * box. Set AGENT_BROWSER_SNAPSHOT_ID to a pre-built sandbox snapshot for
 * sub-second startup.
 */

import { Sandbox } from "@vercel/sandbox";

const CHROMIUM_SYSTEM_DEPS = [
  "nss", "nspr", "libxkbcommon", "atk", "at-spi2-atk", "at-spi2-core",
  "libXcomposite", "libXdamage", "libXrandr", "libXfixes", "libXcursor",
  "libXi", "libXtst", "libXScrnSaver", "libXext", "mesa-libgbm", "libdrm",
  "mesa-libGL", "mesa-libEGL", "cups-libs", "alsa-lib", "pango", "cairo",
  "gtk3", "dbus-libs",
];

function sandboxCredentials() {
  if (process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID) {
    return {
      token: process.env.VERCEL_TOKEN,
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
    };
  }
  return {};
}

async function withBrowser<T>(fn: (sandbox: InstanceType<typeof Sandbox>) => Promise<T>): Promise<T> {
  const snapshotId = process.env.AGENT_BROWSER_SNAPSHOT_ID;
  const credentials = sandboxCredentials();

  const sandbox = snapshotId
    ? await Sandbox.create({ ...credentials, source: { type: "snapshot", snapshotId }, timeout: 120_000 })
    : await Sandbox.create({ ...credentials, runtime: "node24", timeout: 120_000 });

  if (!snapshotId) {
    await sandbox.runCommand("sh", [
      "-c",
      `sudo dnf clean all 2>&1 && sudo dnf install -y --skip-broken ${CHROMIUM_SYSTEM_DEPS.join(" ")} 2>&1 && sudo ldconfig 2>&1`,
    ]);
    await sandbox.runCommand("npm", ["install", "-g", "agent-browser"]);
    await sandbox.runCommand("npx", ["agent-browser", "install"]);
  }

  try {
    return await fn(sandbox);
  } finally {
    await sandbox.stop();
  }
}

/** Open a URL in a sandbox browser and return its title + accessibility text. */
export async function fetchPageText(url: string): Promise<{ title: string; text: string }> {
  return withBrowser(async (sandbox) => {
    await sandbox.runCommand("agent-browser", ["open", url]);

    const titleResult = await sandbox.runCommand("agent-browser", ["get", "title", "--json"]);
    let title = url;
    try {
      title = JSON.parse(await titleResult.stdout())?.data?.title || url;
    } catch {
      // keep the url as the fallback title
    }

    const snapResult = await sandbox.runCommand("agent-browser", ["snapshot", "-i", "-c"]);
    const text = await snapResult.stdout();

    await sandbox.runCommand("agent-browser", ["close"]);
    return { title, text };
  });
}

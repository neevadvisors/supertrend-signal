const url = process.env.API_HEALTH_URL || "http://localhost:8000/health";
const timeoutMs = Number(process.env.API_WAIT_TIMEOUT_MS || 120_000);
const intervalMs = 1_500;
const started = Date.now();

async function check() {
  try {
    const res = await fetch(url);
    if (res.ok) {
      console.log(`API ready at ${url}`);
      process.exit(0);
    }
  } catch {
    // keep waiting
  }
  if (Date.now() - started > timeoutMs) {
    console.error(`Timed out waiting for API at ${url}`);
    process.exit(1);
  }
  setTimeout(check, intervalMs);
}

console.log(`Waiting for API at ${url}…`);
check();

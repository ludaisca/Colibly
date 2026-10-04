export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.COLIBLY_BUILD !== "1") {
    const { startWorkers } = await import("@/lib/workers");
    startWorkers();
  }
}

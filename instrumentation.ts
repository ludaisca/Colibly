// Las colas corren aquí salvo COLIBLY_WORKERS=0: en producción el servicio
// `app` solo atiende HTTP y el servicio `worker` (misma imagen) procesa las
// colas, así un job pesado no frena la bandeja (docker-compose.yml).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.COLIBLY_BUILD !== "1" && process.env.COLIBLY_WORKERS !== "0") {
    const { startWorkers } = await import("@/lib/workers");
    startWorkers();
  }
}

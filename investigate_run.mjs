// investigate.ts
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, setLogLevel } from "firebase/firestore";
import fs from "fs";
setLogLevel("silent");
var cfg = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf8"));
var app = initializeApp(cfg);
var db = getFirestore(app, cfg.firestoreDatabaseId || "(default)");
async function check() {
  const [recsSnap, addrSnap, clientsSnap, histSnap] = await Promise.all([
    getDocs(collection(db, "maintenanceRecords")),
    getDocs(collection(db, "addresses")),
    getDocs(collection(db, "clients")),
    getDocs(collection(db, "editHistory"))
  ]);
  const allRecords = recsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const septRecords = allRecords.filter((r) => r.month === "2026-09");
  const allAddresses = addrSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const addrMap = new Map(allAddresses.map((a) => [a.id, a]));
  const allClients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const clientMap = new Map(allClients.map((c) => [c.id, c]));
  console.log("=== RESUMO GERAL SETEMBRO/2026 ===");
  console.log("Total de registros no banco para 2026-09:", septRecords.length);
  const byAddress = {};
  septRecords.forEach((r) => {
    if (!byAddress[r.addressId]) byAddress[r.addressId] = [];
    byAddress[r.addressId].push(r);
  });
  const duplicated = Object.entries(byAddress).filter(([_, list]) => list.length > 1);
  console.log("Endere\xE7os \xFAnicos em 2026-09:", Object.keys(byAddress).length);
  console.log("Endere\xE7os com registros duplicados/m\xFAltiplos:", duplicated.length);
  console.log("Total de registros excedentes:", duplicated.reduce((s, [_, l]) => s + l.length - 1, 0));
  duplicated.sort((a, b) => b[1].length - a[1].length);
  console.log("\n=== DETALHAMENTO DOS ENDERE\xC7OS COM REPETI\xC7\xC3O ===");
  duplicated.forEach(([addrId, list]) => {
    const addr = addrMap.get(addrId);
    const client = addr ? clientMap.get(addr.clientId) : null;
    console.log(`
[Address ID: ${addrId}] ${client?.name || "Sem cliente"} - ${addr?.name || addr?.street || "Sem nome"} (${list.length} registros | Rota: ${addr?.route || "Sem rota"})`);
    list.forEach((r, idx) => {
      console.log(`  Item ${idx + 1}: ID: ${r.id} | Sem: ${r.scheduledWeek} | DataPlan: ${r.plannedDate || "-"} | DataExec: ${r.executionDate || "-"} | Tec1: ${r.technician1 || "-"} | Tec2: ${r.technician2 || "-"} | Status: ${r.status} | Ciclo: ${r.cycle || "-"} | CreatedAt: ${r.createdAt || "-"} | UpdatedAt: ${r.updatedAt || "-"}`);
    });
  });
  console.log("\n=== HIST\xD3RICO DE REPLICA\xC7\xC3O / ALTERA\xC7\xD5ES RECENTES ===");
  const hist = histSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const relevantHist = hist.filter((h) => {
    const str = JSON.stringify(h);
    return str.includes("2026-09") || str.includes("batch-replication") || str.includes("Replicate") || str.includes("duplicateSchedule") || str.includes("generateSchedule");
  });
  console.log("Registros no editHistory:", relevantHist.length);
  relevantHist.slice(-25).forEach((h) => {
    console.log(`[Hist] ${h.timestamp} | A\xE7\xE3o: ${h.action} | Entidade: ${h.entity} | User: ${h.userName || h.userId} | Detalhes: ${JSON.stringify(h.details || {})}`);
  });
  const byMonth = {};
  allRecords.forEach((r) => {
    byMonth[r.month] = (byMonth[r.month] || 0) + 1;
  });
  console.log("\n=== CONTAGEM TOTAL DE REGISTROS POR M\xCAS NO SISTEMA ===");
  console.log(byMonth);
}
check().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

async function main() {
  const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  
  const projectId = cfg.projectId || process.env.GOOGLE_CLOUD_PROJECT || "placeholder-project-id";
  const firestoreDatabaseId = cfg.firestoreDatabaseId || "(default)";

  const app = admin.initializeApp({
    projectId: projectId
  });

  const db = getFirestore(app, firestoreDatabaseId);

  console.log("=== INICIANDO INVESTIGAÇÃO ADMIN: 'TEOTONIO' / 'APS' ===");

  // 1. Investigar Endereços (addresses)
  console.log("\n--- BUSCANDO ENDEREÇOS (addresses) ---");
  const addrSnap = await db.collection('addresses').get();
  const matchedAddresses: any[] = [];
  addrSnap.forEach(d => {
    const data = d.data();
    const str = (JSON.stringify(data) || '').toLowerCase();
    if (str.includes('teotonio') || str.includes('teotônio') || str.includes('aps')) {
      matchedAddresses.push({ id: d.id, ...data });
    }
  });
  console.log(`Endereços encontrados: ${matchedAddresses.length}`);
  matchedAddresses.forEach(a => {
    console.log(`-> ID: ${a.id} | Label/Rua: ${a.street || a.label} | Cidade: ${a.city} | Status: ${a.status} | ClientId: ${a.clientId}`);
  });

  // 2. Investigar Registros de Manutenção (maintenanceRecords)
  console.log("\n--- BUSCANDO REGISTROS DE MANUTENÇÃO (maintenanceRecords) ---");
  const recSnap = await db.collection('maintenanceRecords').get();
  const matchedRecords: any[] = [];
  const addressIds = matchedAddresses.map(a => a.id);
  
  recSnap.forEach(d => {
    const data = d.data();
    const str = (JSON.stringify(data) || '').toLowerCase();
    const hasAddress = addressIds.includes(data.addressId);
    if (hasAddress || str.includes('teotonio') || str.includes('teotônio')) {
      matchedRecords.push({ id: d.id, ...data });
    }
  });
  console.log(`Registros de manutenção encontrados: ${matchedRecords.length}`);
  matchedRecords.forEach(r => {
    console.log(`-> ID: ${r.id} | Mês: ${r.month} | Status: ${r.status} | AddressId: ${r.addressId} | Data Prevista: ${r.plannedDate} | Data Conclusão: ${r.completedAt || r.date} | Tech1: ${r.technician1} | Tech2: ${r.technician2}`);
    console.log(`   Assinatura Cliente: ${r.clientSignature ? 'SIM' : 'NÃO'} | Assinatura Técnico: ${r.techSignature ? 'SIM' : 'NÃO'} | Responsável: ${r.clientName}`);
    console.log(`   RejectionReason: ${r.rejectionReason || 'nenhuma'} | ApprovedAt: ${r.approvedAt || 'não'} | ApprovedBy: ${r.approvedBy || 'não'}`);
    console.log(`   Notes: ${r.notes || ''} | RouteNotes: ${r.routeNotes || ''}`);
  });

  // 3. Investigar Histórico de Edições / Auditoria (editHistory)
  console.log("\n--- BUSCANDO HISTÓRICO DE AUDITORIA (editHistory) ---");
  try {
    const histSnap = await db.collection('editHistory').get();
    const matchedHistory: any[] = [];
    histSnap.forEach(d => {
      const data = d.data();
      const str = (JSON.stringify(data) || '').toLowerCase();
      if (str.includes('teotonio') || str.includes('teotônio') || matchedRecords.some(r => r.id === data.recordId || r.id === data.targetId)) {
        matchedHistory.push({ id: d.id, ...data });
      }
    });
    console.log(`Entradas de histórico encontradas: ${matchedHistory.length}`);
    matchedHistory.forEach(h => {
      console.log(`-> Hist ID: ${h.id} | Ação: ${h.action} | Tipo: ${h.entityType || h.type} | Data: ${h.timestamp || h.date} | Usuário: ${h.userName || h.userId}`);
      console.log(`   Detalhes:`, JSON.stringify(h.details || h.changes || h.description || h.notes || ''));
    });
  } catch (err: any) {
    console.log("Erro ao ler editHistory:", err.message);
  }

  // 4. Investigar Ordens de Serviço (serviceOrders)
  console.log("\n--- BUSCANDO ORDENS DE SERVIÇO (serviceOrders) ---");
  try {
    const soSnap = await db.collection('serviceOrders').get();
    const matchedSO: any[] = [];
    soSnap.forEach(d => {
      const data = d.data();
      const str = (JSON.stringify(data) || '').toLowerCase();
      if (str.includes('teotonio') || str.includes('teotônio') || addressIds.includes(data.addressId)) {
        matchedSO.push({ id: d.id, ...data });
      }
    });
    console.log(`Ordens de Serviço encontradas: ${matchedSO.length}`);
    matchedSO.forEach(so => {
      console.log(`-> SO #${so.osNumber || so.id} | Status: ${so.status} | Endereço: ${so.addressStreet} | Cliente: ${so.clientName}`);
    });
  } catch (err: any) {
    console.log("Erro ao ler serviceOrders:", err.message);
  }

  // 5. Investigar Todos os registros pre_completed atuais
  console.log("\n--- TODOS OS REGISTROS PRE_COMPLETED NO BANCO ---");
  const preSnap = await db.collection('maintenanceRecords').where('status', '==', 'pre_completed').get();
  console.log(`Total de registros pre_completed no momento: ${preSnap.size}`);
  preSnap.forEach(d => {
    const data = d.data();
    console.log(`-> ID: ${d.id} | AddressId: ${data.addressId} | Mês: ${data.month} | Tech1: ${data.technician1} | Data: ${data.date || data.plannedDate}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error("Erro fatal no script:", err);
  process.exit(1);
});

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

initializeApp({
  projectId: config.projectId,
});

async function test() {
  console.log('Querying all maintenance records with admin SDK (correct import)...');
  const dbInstance = getFirestore(config.firestoreDatabaseId);
  const snap = await dbInstance.collection('maintenanceRecords').get();
  console.log(`Total records: ${snap.size}`);
  
  snap.forEach(doc => {
    const data = doc.data();
    const techMatch = (data.technician1 && data.technician1.toLowerCase().includes('erinaldo')) || 
                      (data.technician2 && data.technician2.toLowerCase().includes('erinaldo'));
    if (techMatch || (data.plannedDate && data.plannedDate.includes('2026-08'))) {
      console.log(`ID: ${doc.id}, Planned: ${data.plannedDate}, Tech1: ${data.technician1}, Tech2: ${data.technician2}, Status: ${data.status}`);
    }
  });

  console.log('Done!');
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});

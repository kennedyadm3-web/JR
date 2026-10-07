import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function test() {
  console.log('Querying all maintenance records...');
  const snap = await getDocs(collection(db, 'maintenanceRecords'));
  console.log(`Total records: ${snap.size}`);
  
  snap.forEach(doc => {
    const data = doc.data();
    // print records if plannedDate is within August 2026 or has technician Erinaldo
    const techMatch = (data.technician1 && data.technician1.toLowerCase().includes('erinaldo')) || 
                      (data.technician2 && data.technician2.toLowerCase().includes('erinaldo'));
    if (techMatch || (data.plannedDate && data.plannedDate.includes('2026-08'))) {
      console.log(`ID: ${doc.id}, Planned: ${data.plannedDate}, Tech1: ${data.technician1}, Tech2: ${data.technician2}, Status: ${data.status}`);
    }
  });

  console.log('Done!');
}

test().catch(err => {
  console.error(err);
});

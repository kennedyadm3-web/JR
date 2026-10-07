const fs = require('fs');
const content = fs.readFileSync('src/services/dataService.ts', 'utf8');

const updated = content.replace(
  `  async renameRoute(oldName: string, newName: string) {
    try {
      const batch = writeBatch(db);

      // 1. Update all addresses
      const addresses = await dataService.getAddresses();
      const addressesToUpdate = addresses.filter(a => a.route === oldName);
      
      addressesToUpdate.forEach(addr => {
        batch.update(doc(db, COLLECTIONS.ADDRESSES, addr.id), { route: newName });
      });

      // 2. Move Route Configuration (Delete old, set new)
      const configs = await dataService.getRouteConfigs();
      const oldConfig = configs.find(c => c.id === oldName);
      
      if (oldConfig) {
        batch.delete(doc(db, COLLECTIONS.ROUTE_CONFIGS, oldName));
        batch.set(doc(db, COLLECTIONS.ROUTE_CONFIGS, newName), clean({
          ...oldConfig,
          id: newName,
          routeName: newName,
          updatedAt: serverTimestamp()
        }));
      }

      await batch.commit();`,
  `  async renameRoute(oldName: string, newName: string) {
    try {
      const batch = writeBatch(db);

      // 1. Update all addresses
      const addresses = await dataService.getAddresses();
      const addressesToUpdate = addresses.filter(a => a.route === oldName);
      
      addressesToUpdate.forEach(addr => {
        batch.update(doc(db, COLLECTIONS.ADDRESSES, addr.id), { route: newName });
      });

      // 2. Move Route Configuration (Delete old, set new)
      const configs = await dataService.getRouteConfigs();
      const oldConfig = configs.find(c => c.id === oldName);
      
      if (oldConfig) {
        batch.delete(doc(db, COLLECTIONS.ROUTE_CONFIGS, oldName));
        batch.set(doc(db, COLLECTIONS.ROUTE_CONFIGS, newName), clean({
          ...oldConfig,
          id: newName,
          routeName: newName,
          updatedAt: serverTimestamp()
        }));
      }

      // 3. Update Route Plannings
      const planningsQuery = query(
        collection(db, COLLECTIONS.ROUTE_PLANNINGS),
        where('routeName', '==', oldName)
      );
      const planningsSnap = await getDocs(planningsQuery);
      planningsSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        batch.delete(docSnap.ref);
        const newDocId = \`\${data.month}_\${newName}\`;
        batch.set(doc(db, COLLECTIONS.ROUTE_PLANNINGS, newDocId), clean({
          ...data,
          id: newDocId,
          routeName: newName,
          updatedAt: serverTimestamp()
        }));
      });

      // 4. Update Records
      const recordsQuery = query(
        collection(db, COLLECTIONS.RECORDS),
        where('assignedRoute', '==', oldName)
      );
      const recordsSnap = await getDocs(recordsQuery);
      recordsSnap.docs.forEach(docSnap => {
        batch.update(docSnap.ref, { assignedRoute: newName });
      });
      
      const tempRecordsQuery = query(
        collection(db, COLLECTIONS.RECORDS),
        where('temporaryRouteName', '==', oldName)
      );
      const tempRecordsSnap = await getDocs(tempRecordsQuery);
      tempRecordsSnap.docs.forEach(docSnap => {
        batch.update(docSnap.ref, { temporaryRouteName: newName });
      });

      await batch.commit();`
);

fs.writeFileSync('src/services/dataService.ts', updated);

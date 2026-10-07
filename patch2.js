const fs = require('fs');
const content = fs.readFileSync('src/components/CardSummaryView.tsx', 'utf8');

const updated = content.replace(
  `const [plannings, records, configs] = await Promise.all([
        dataService.getRoutePlannings(month),
        dataService.getMaintenanceRecords(month),
        dataService.getRouteConfigs()
      ]);`,
  `const [plannings, records, configs, addresses] = await Promise.all([
        dataService.getRoutePlannings(month),
        dataService.getMaintenanceRecords(month),
        dataService.getRouteConfigs(),
        dataService.getAddresses()
      ]);`
).replace(
  `records.forEach(r => {
        if (r.assignedRoute) validNames.add(r.assignedRoute);
        if (r.temporaryRouteName) validNames.add(r.temporaryRouteName);
      });`,
  `records.forEach(r => {
        if (r.assignedRoute) validNames.add(r.assignedRoute);
        if (r.temporaryRouteName) validNames.add(r.temporaryRouteName);
      });
      addresses.forEach(a => {
        if (a.route) validNames.add(a.route);
      });`
);

fs.writeFileSync('src/components/CardSummaryView.tsx', updated);

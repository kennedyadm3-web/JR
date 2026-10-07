const fs = require('fs');
const content = fs.readFileSync('src/components/RoutePlanningView.tsx', 'utf-8');
const lines = content.split('\n');
// We want to delete from line 48 to 166. That is index 47 to 165
lines.splice(47, 166 - 48 + 1); // delete 119 lines, wait: 166-48=118, +1 = 119.
fs.writeFileSync('src/components/RoutePlanningView.tsx', lines.join('\n'));
console.log('Removed MacroTable from RoutePlanningView');

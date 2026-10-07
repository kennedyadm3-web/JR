const fs = require('fs');
let content = fs.readFileSync('src/components/TechDemandView.tsx', 'utf8');

const startPattern = '{/* PRINT-ONLY CHECKLIST / SERVICE SHEET */}';
const startIndex = content.indexOf(startPattern);

if (startIndex === -1) {
  console.log("Could not find start pattern");
  process.exit(1);
}

// We know it ends with the end of the file or similar. Let's just replace from startIndex to the end of the isPrintingChecklist block.
// Since it's near the end, let's find the end of it.
const endPattern = '        </div>\n      )}\n    </>\n  );\n}';
const endIndex = content.indexOf(endPattern, startIndex);

if (endIndex === -1) {
  console.log("Could not find end pattern");
  process.exit(1);
}

const replacement = `{/* PRINT-ONLY CHECKLIST / SERVICE SHEET */}
      {isPrintingChecklist && (
        <div className="hidden print:block p-8 font-sans text-xs text-black space-y-6 leading-tight" style={{ fontFamily: 'Arial, sans-serif' }}>
          {/* Header */}
          <div className="flex justify-between items-start border-b border-black pb-2 mb-4">
            <div className="flex items-center gap-4">
               {/* Simulating Logo Box */}
               <div className="w-16 h-16 bg-green-800 text-white flex items-center justify-center font-bold flex-col">
                  <span className="text-[10px]">LE FRIO</span>
                  <span className="text-[6px]">REFRIGERAÇÃO</span>
               </div>
               <div>
                 <h1 className="text-[11px] font-bold">LE FRIO COMERCIO E SERVICOS LTDA</h1>
                 <p className="text-[9px]">CNPJ: 00.000.000/0001-00</p>
                 <p className="text-[9px]">Endereço: RUA EXEMPLO, 123 - CENTRO - MACEIO - AL</p>
                 <p className="text-[9px]">E-mail: contato@lefrio.com.br - Telefone: (82) 9999-9999</p>
               </div>
            </div>
            <div className="text-right flex flex-col items-end">
               <p className="text-[9px]">Página: 1 de 1</p>
               <p className="text-[9px]">Mês: {isPrintingChecklist.month}</p>
            </div>
          </div>

          <h2 className="text-center font-bold text-sm mb-4 uppercase">RELATÓRIO DE MANUTENÇÃO PREVENTIVA MENSAL (Conforme PMOC)</h2>

          {/* Fields Box */}
          <div className="border border-black bg-[#e6f4ea] text-[10px] rounded-sm overflow-hidden mb-4">
            <div className="grid grid-cols-4 p-1 border-b border-black font-bold">
               <div className="col-span-3">Cliente: {isPrintingChecklist.client?.name}</div>
               <div className="col-span-1 text-right">Ciclo: {isPrintingChecklist.cycle || isPrintingChecklist.client?.contractCycle || 1}</div>
            </div>
            <div className="grid grid-cols-1 p-1 font-bold">
               <div>Endereço: {isPrintingChecklist.address?.street}{isPrintingChecklist.address?.neighborhood ? \` - \${isPrintingChecklist.address?.neighborhood}\` : ''}</div>
            </div>
          </div>

          {/* Checklist Table */}
          <table className="w-full text-left border-collapse border border-black text-[9px]">
            <thead>
              <tr className="bg-[#a8e6cf] font-bold border-b border-black">
                <th className="p-1 border-r border-black text-center w-8">Item</th>
                <th className="p-1 border-r border-black w-24">Setor</th>
                <th className="p-1 border-r border-black w-24">Equipamento</th>
                <th className="p-1 border-r border-black w-20">Marca</th>
                <th className="p-1 border-r border-black w-16 text-center">BTUs</th>
                <th className="p-1 border-r border-black w-20 text-center">ID/Etiqueta</th>
                <th className="p-1 border-r border-black w-32">Visto do Técnico</th>
                <th className="p-1 w-24">Obs.</th>
              </tr>
              <tr className="bg-gray-200 font-bold border-b border-black">
                <td colSpan={8} className="p-1 text-center">{isPrintingChecklist.client?.name}</td>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/80">
              {equipments
                .filter(eq => eq.addressId === isPrintingChecklist.addressId)
                .sort((a, b) => (a.label || '').localeCompare(b.label || ''))
                .map((eq, index) => {
                  const existingChecklist = isPrintingChecklist.checklist || [];
                  const found = existingChecklist.find(item => item.equipmentId === eq.id);
                  const isChecked = found ? found.checked : false;
                  const isSkipped = found ? found.skipped : false;
                  const obsValue = found ? found.notes : '';
                  
                  let statusText = '';
                  if (isChecked && !isSkipped) statusText = \`(APP: \${isPrintingChecklist.executionDate ? format(parseISO(isPrintingChecklist.executionDate), 'dd/MM/yyyy') : ''} \${isPrintingChecklist.technician1 || 'Técnico'})\`;
                  else if (isSkipped) statusText = 'PULADO';
                  else statusText = '';

                  return (
                    <tr key={eq.id} className="border-b border-black">
                      <td className="p-1 border-r border-black text-center">{eq.label || index + 1}</td>
                      <td className="p-1 border-r border-black uppercase">{eq.sector || '-'}</td>
                      <td className="p-1 border-r border-black uppercase">{eq.name || '-'}</td>
                      <td className="p-1 border-r border-black uppercase">{eq.brand || '-'}</td>
                      <td className="p-1 border-r border-black text-center">{eq.btus ? Number(eq.btus).toLocaleString('pt-BR') : '-'}</td>
                      <td className="p-1 border-r border-black text-center">{eq.patrimony || eq.id.slice(0,6)}</td>
                      <td className="p-1 border-r border-black text-[8px] uppercase font-bold">{statusText}</td>
                      <td className="p-1 text-[8px]">{obsValue || '-'}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>

          {/* Route general notes */}
          {isPrintingChecklist.routeNotes && (
            <div className="border border-black p-2 mt-4 text-[9px]">
              <span className="font-bold uppercase">Obs Geral: </span>
              {isPrintingChecklist.routeNotes}
            </div>
          )}

          {/* Signatures */}
          <div className="mt-12 flex justify-between items-end pt-4" style={{ pageBreakInside: 'avoid' }}>
             <div className="text-[10px] w-1/2">
                <p>Equipe autenticada no aplicativo App Técnico</p>
                <p>(APP: {isPrintingChecklist.executionDate ? format(parseISO(isPrintingChecklist.executionDate), 'dd/MM/yyyy') : ''} {isPrintingChecklist.technician1})</p>
             </div>
             
             <div className="flex flex-col items-center justify-end w-64 text-center">
                {isPrintingChecklist.techSignature ? (
                  <img 
                    src={isPrintingChecklist.techSignature} 
                    alt="Assinatura Técnico" 
                    className="h-12 object-contain border-b border-black pb-1 w-full"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-12 w-full border-b border-black" />
                )}
                <span className="font-bold uppercase text-[10px] mt-1">Assinatura do Técnico Responsável</span>
                <span className="text-[8px] mt-1">{isPrintingChecklist.technician1 || '-'}</span>
             </div>
          </div>`;

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync('src/components/TechDemandView.tsx', newContent, 'utf8');
console.log("Patched successfully");

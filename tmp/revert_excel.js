const fs = require('fs');
const path = require('path');

const filePath = '/src/components/ServiceOrdersView.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = '  // Baixar Ordem de Serviço em Formato Excel\n  const downloadOsExcel = async (order: ServiceOrder) => {';
const startMarkerCRLF = '  // Baixar Ordem de Serviço em Formato Excel\r\n  const downloadOsExcel = async (order: ServiceOrder) => {';

let startIndex = content.indexOf(startMarker);
if (startIndex === -1) {
  startIndex = content.indexOf(startMarkerCRLF);
}

if (startIndex === -1) {
  // Let's search just for 'const downloadOsExcel = async'
  const altStart = 'const downloadOsExcel = async';
  const idx = content.indexOf(altStart);
  if (idx !== -1) {
    // find the start of the comment above it
    const commentIdx = content.lastIndexOf('  // Baixar Ordem de Serviço', idx);
    if (commentIdx !== -1) {
      startIndex = commentIdx;
    } else {
      startIndex = idx;
    }
  }
}

if (startIndex === -1) {
  console.error('Could not find start of downloadOsExcel function');
  process.exit(1);
}

const endMarker = '  // Filtros de busca';
const endIndex = content.indexOf(endMarker, startIndex);

if (endIndex === -1) {
  console.error('Could not find end marker // Filtros de busca');
  process.exit(1);
}

const replacement = `  // Baixar Ordem de Serviço em Formato Excel
  const downloadOsExcel = async (order: ServiceOrder) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(\`OS \${order.id}\`);

      // Set column widths so we have a solid 12-column grid layout like the PDF
      worksheet.columns = [
        { width: 10 },  // A
        { width: 10 },  // B
        { width: 10 },  // C
        { width: 10 },  // D
        { width: 10 },  // E
        { width: 10 },  // F
        { width: 10 },  // G
        { width: 10 },  // H
        { width: 10 },  // I
        { width: 10 },  // J
        { width: 10 },  // K
        { width: 12 }   // L
      ];

      worksheet.views = [{ showGridLines: true }];
      
      const printCompany = getActiveCompanyForOrder(order.serviceCompany);
      const themeColor = order.serviceCompany === 'alclima' ? '90EE90' : '9cbdde'; // ARGB format (omitting first FF because we can use solid pattern with hex)
      
      const colLetter = (colIdx: number) => String.fromCharCode(65 + colIdx - 1);

      // Helper to write a merged label/value block with thin borders
      const writeMergedLabelField = (startRow: number, startCol: number, endRow: number, endCol: number, label: string, value: string) => {
        const startRef = \`\${colLetter(startCol)}\${startRow}\`;
        const endRef = \`\${colLetter(endCol)}\${endRow}\`;
        worksheet.mergeCells(\`\${startRef}:\${endRef}\`);
        
        const cell = worksheet.getCell(startRef);
        cell.value = {
          richText: [
            { text: label + ': ', font: { bold: true, size: 8.5, name: 'Arial', color: { argb: 'FF000000' } } },
            { text: value || '', font: { bold: false, size: 8.5, name: 'Arial', color: { argb: 'FF333333' } } }
          ]
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        
        // Apply borders
        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            worksheet.getCell(r, c).border = {
              top: { style: 'thin', color: { argb: 'FF000000' } },
              left: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } }
            };
          }
        }
      };

      // Helper to write full width section headers
      const writeSectionHeader = (row: number, text: string) => {
        worksheet.mergeCells(\`A\${row}:L\${row}\`);
        const cell = worksheet.getCell(\`A\${row}\`);
        cell.value = text;
        cell.font = { bold: true, size: 9, name: 'Arial', color: { argb: 'FF000000' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: \`FF\${themeColor}\` }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        
        for (let c = 1; c <= 12; c++) {
          worksheet.getCell(row, c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
      };

      // --- ROW 1-4: COMPANY HEADER ---
      worksheet.mergeCells('A1:B4');
      const logoCell = worksheet.getCell('A1');
      logoCell.value = order.serviceCompany === 'alclima' ? 'AL CLIMA' : 'LEFRIO';
      logoCell.font = { bold: true, size: 12, name: 'Arial', color: { argb: order.serviceCompany === 'alclima' ? 'FF143E1D' : 'FF1E3A8A' } };
      logoCell.alignment = { vertical: 'middle', horizontal: 'center' };
      logoCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: order.serviceCompany === 'alclima' ? 'FFE2F7E2' : 'FFEFF6FF' }
      };

      // Add border to logo area
      for (let r = 1; r <= 4; r++) {
        for (let c = 1; c <= 2; c++) {
          worksheet.getCell(r, c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
      }

      // Company info
      worksheet.mergeCells('C1:L1');
      const compNameCell = worksheet.getCell('C1');
      compNameCell.value = printCompany?.fullName?.toUpperCase();
      compNameCell.font = { bold: true, size: 9.5, name: 'Arial', color: { argb: 'FF000000' } };
      compNameCell.alignment = { vertical: 'middle', horizontal: 'left' };

      worksheet.mergeCells('C2:L2');
      const compCnpjCell = worksheet.getCell('C2');
      compCnpjCell.value = \`CNPJ: \${printCompany?.cnpj} - IE: \${printCompany?.ie || '-'} - IM: \${printCompany?.im || '-'}\`;
      compCnpjCell.font = { size: 8, name: 'Arial', color: { argb: 'FF555555' } };
      compCnpjCell.alignment = { vertical: 'middle', horizontal: 'left' };

      worksheet.mergeCells('C3:L3');
      const compAddrCell = worksheet.getCell('C3');
      compAddrCell.value = \`Endereço: \${printCompany?.address}\`;
      compAddrCell.font = { size: 8, name: 'Arial', color: { argb: 'FF555555' } };
      compAddrCell.alignment = { vertical: 'middle', horizontal: 'left' };

      worksheet.mergeCells('C4:L4');
      const compContactCell = worksheet.getCell('C4');
      compContactCell.value = \`E-mail: \${printCompany?.email} - Telefone: \${printCompany?.phone}\`;
      compContactCell.font = { size: 8, name: 'Arial', color: { argb: 'FF555555' } };
      compContactCell.alignment = { vertical: 'middle', horizontal: 'left' };

      // Apply borders around the company details area
      for (let r = 1; r <= 4; r++) {
        for (let c = 3; c <= 12; c++) {
          worksheet.getCell(r, c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
      }

      // --- ROW 5: TITLE ---
      worksheet.mergeCells('A5:H5');
      const titleCell = worksheet.getCell('A5');
      titleCell.value = \`ORDEM DE SERVIÇO: \${order.id}\`;
      titleCell.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FF000000' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

      worksheet.mergeCells('I5:L5');
      const subTitleCell = worksheet.getCell('I5');
      subTitleCell.value = '1ª Impressão (Exportação Excel)';
      subTitleCell.font = { bold: true, size: 8.5, name: 'Arial', color: { argb: 'FF555555' } };
      subTitleCell.alignment = { vertical: 'middle', horizontal: 'right' };

      // --- ROW 6: SECTION HEADER "CLIENTE" ---
      writeSectionHeader(6, 'CLIENTE');

      // --- ROW 7: CLIENT LINE 1 (Razão Social & CNPJ) ---
      const clientName = clients.find(c => c.id === order.clientId)?.fullName || order.clientName;
      writeMergedLabelField(7, 1, 7, 8, 'Razão Social', clientName);
      writeMergedLabelField(7, 9, 7, 12, 'CNPJ', order.clientCnpj || '-');

      // --- ROW 8: CLIENT LINE 2 (E-mail & Telefone) ---
      const clientEmail = clients.find(c => c.id === order.clientId)?.email || order.clientEmail || '-';
      writeMergedLabelField(8, 1, 8, 8, 'E-mail', clientEmail);
      writeMergedLabelField(8, 9, 8, 12, 'Telefone', order.clientPhone || '-');

      // --- ROW 9: CLIENT LINE 3 (Endereço) ---
      writeMergedLabelField(9, 1, 9, 12, 'Endereço', order.clientAddress || '-');

      // --- ROW 10: Spacing ---
      worksheet.addRow([]);

      // --- ROW 11: SECTION HEADER "OS: [número]" ---
      writeSectionHeader(11, \`OS: \${order.id}\`);

      // --- ROW 12: OS LINE 1 (Situação & Tipo) ---
      writeMergedLabelField(12, 1, 12, 4, 'Situação', order.status.replace('_', ' ').toUpperCase());
      writeMergedLabelField(12, 5, 12, 12, 'Tipo', order.type);

      // --- ROW 13: OS LINE 2 (Datas e OS Externa) ---
      const openedAtStr = order.openedAt ? new Date(order.openedAt).toLocaleString('pt-BR') : '-';
      const finishedAtStr = order.finishedAt ? new Date(order.finishedAt).toLocaleString('pt-BR') : '-';
      writeMergedLabelField(13, 1, 13, 3, 'Data Abertura', openedAtStr);
      writeMergedLabelField(13, 4, 13, 6, 'Resp. Abertura', order.openedBy || '-');
      writeMergedLabelField(13, 7, 13, 9, 'Finalização', finishedAtStr);
      writeMergedLabelField(13, 10, 13, 12, 'OS Externa', order.externalOs || '-');

      // --- ROW 14: OS LINE 3 (Descrição do Problema) ---
      writeMergedLabelField(14, 1, 14, 12, 'Descrição do Problema', order.description);

      // --- ROW 15: OS LINE 4 (Diagnóstico) ---
      writeMergedLabelField(15, 1, 15, 12, 'Diagnóstico', order.diagnosis || '-');

      // --- ROW 16: OS LINE 5 (Solução) ---
      writeMergedLabelField(16, 1, 16, 12, 'Solução', order.solution || '-');

      // --- ROW 17: Spacing ---
      worksheet.addRow([]);

      // --- ROW 18: SECTION HEADER "DETALHES" ---
      writeSectionHeader(18, 'DETALHES');

      // --- ROW 19: DETALHES LINE 1 (Equipamento & Marca) ---
      writeMergedLabelField(19, 1, 19, 6, 'Equipamento', order.equipmentName || '-');
      writeMergedLabelField(19, 7, 19, 12, 'Marca', order.equipmentBrand || '-');

      // --- ROW 20: DETALHES LINE 2 (Setor, BTUs, Patrimônio) ---
      writeMergedLabelField(20, 1, 20, 4, 'Setor', order.equipmentSector || '-');
      writeMergedLabelField(20, 5, 20, 8, 'BTUs', order.equipmentBtus || '-');
      writeMergedLabelField(20, 9, 20, 12, 'Patrimônio / Tombamento', order.equipmentPatrimony || '-');

      // --- ROW 21: Spacing ---
      worksheet.addRow([]);

      let currentRow = 22;

      // --- SERVICES TABLE (if present) ---
      if (order.services && order.services.length > 0) {
        // Section Header Row
        worksheet.mergeCells(\`A\${currentRow}:L\${currentRow}\`);
        const headerCell = worksheet.getCell(\`A\${currentRow}\`);
        headerCell.value = 'DESCRIÇÃO DOS SERVIÇOS';
        headerCell.font = { bold: true, size: 9, name: 'Arial', color: { argb: 'FF000000' } };
        headerCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' }
        };
        headerCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        for (let c = 1; c <= 12; c++) {
          worksheet.getCell(currentRow, c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
        currentRow++;

        // Table Header
        const headers = [
          { text: 'Código', startCol: 1, endCol: 1 },
          { text: 'Descrição dos Serviços', startCol: 2, endCol: 7 },
          { text: 'Un.', startCol: 8, endCol: 8 },
          { text: 'Qtd.', startCol: 9, endCol: 9 },
          { text: 'Valor Unit.', startCol: 10, endCol: 10 },
          { text: 'Desc. (%)', startCol: 11, endCol: 11 },
          { text: 'Valor Total', startCol: 12, endCol: 12 }
        ];
        
        headers.forEach(h => {
          const startRef = \`\${colLetter(h.startCol)}\${currentRow}\`;
          const endRef = \`\${colLetter(h.endCol)}\${currentRow}\`;
          if (h.startCol !== h.endCol) {
            worksheet.mergeCells(\`\${startRef}:\${endRef}\`);
          }
          const cell = worksheet.getCell(startRef);
          cell.value = h.text;
          cell.font = { bold: true, size: 8, name: 'Arial', color: { argb: 'FF000000' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: \`FF\${themeColor}\` }
          };
          cell.alignment = { 
            vertical: 'middle', 
            horizontal: h.text.includes('Valor') || h.text.includes('Total') ? 'right' : (h.text.includes('Código') || h.text.includes('Un') || h.text.includes('Qtd') ? 'center' : 'left'),
            wrapText: true 
          };
        });
        
        for (let c = 1; c <= 12; c++) {
          worksheet.getCell(currentRow, c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
        currentRow++;

        // Row details
        order.services.forEach(srv => {
          // Code
          worksheet.getCell(\`A\${currentRow}\`).value = srv.code;
          worksheet.getCell(\`A\${currentRow}\`).alignment = { vertical: 'middle', horizontal: 'center' };

          // Description
          worksheet.mergeCells(\`B\${currentRow}:G\${currentRow}\`);
          const descCell = worksheet.getCell(\`B\${currentRow}\`);
          descCell.value = srv.description;
          descCell.font = { bold: true, size: 8, name: 'Arial' };
          descCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

          // Unit
          worksheet.getCell(\`H\${currentRow}\`).value = srv.unit;
          worksheet.getCell(\`H\${currentRow}\`).alignment = { vertical: 'middle', horizontal: 'center' };

          // Qty
          worksheet.getCell(\`I\${currentRow}\`).value = srv.quantity;
          worksheet.getCell(\`I\${currentRow}\`).alignment = { vertical: 'middle', horizontal: 'center' };
          worksheet.getCell(\`I\${currentRow}\`).numFmt = '#,##0';

          // Unit value
          worksheet.getCell(\`J\${currentRow}\`).value = srv.unitValue;
          worksheet.getCell(\`J\${currentRow}\`).numFmt = '"R$"\#,##0.00';
          worksheet.getCell(\`J\${currentRow}\`).alignment = { vertical: 'middle', horizontal: 'right' };

          // Discount
          worksheet.getCell(\`K\${currentRow}\`).value = srv.discountPercent / 100;
          worksheet.getCell(\`K\${currentRow}\`).numFmt = '0.0%';
          worksheet.getCell(\`K\${currentRow}\`).alignment = { vertical: 'middle', horizontal: 'center' };

          // Total value
          worksheet.getCell(\`L\${currentRow}\`).value = srv.totalValue;
          worksheet.getCell(\`L\${currentRow}\`).numFmt = '"R$"\#,##0.00';
          worksheet.getCell(\`L\${currentRow}\`).font = { bold: true, size: 8, name: 'Arial' };
          worksheet.getCell(\`L\${currentRow}\`).alignment = { vertical: 'middle', horizontal: 'right' };

          // Borders & standard fonts
          for (let c = 1; c <= 12; c++) {
            const cell = worksheet.getCell(currentRow, c);
            if (c !== 2 && c !== 12) {
              cell.font = { size: 8, name: 'Arial' };
            }
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF000000' } },
              left: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } }
            };
          }
          currentRow++;
        });

        // Spacing row
        worksheet.addRow([]);
        currentRow++;
      }

      // --- PRODUCTS TABLE (if present) ---
      if (order.products && order.products.length > 0) {
        // Section Header Row
        worksheet.mergeCells(\`A\${currentRow}:L\${currentRow}\`);
        const headerCell = worksheet.getCell(\`A\${currentRow}\`);
        headerCell.value = 'DESCRIÇÃO DOS PRODUTOS';
        headerCell.font = { bold: true, size: 9, name: 'Arial', color: { argb: 'FF000000' } };
        headerCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' }
        };
        headerCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        for (let c = 1; c <= 12; c++) {
          worksheet.getCell(currentRow, c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
        currentRow++;

        // Table Header
        const headers = [
          { text: 'Código', startCol: 1, endCol: 1 },
          { text: 'Descrição dos Produtos', startCol: 2, endCol: 7 },
          { text: 'Un.', startCol: 8, endCol: 8 },
          { text: 'Qtd.', startCol: 9, endCol: 9 },
          { text: 'Valor Unit.', startCol: 10, endCol: 10 },
          { text: 'Desc. (%)', startCol: 11, endCol: 11 },
          { text: 'Valor Total', startCol: 12, endCol: 12 }
        ];
        
        headers.forEach(h => {
          const startRef = \`\${colLetter(h.startCol)}\${currentRow}\`;
          const endRef = \`\${colLetter(h.endCol)}\${currentRow}\`;
          if (h.startCol !== h.endCol) {
            worksheet.mergeCells(\`\${startRef}:\${endRef}\`);
          }
          const cell = worksheet.getCell(startRef);
          cell.value = h.text;
          cell.font = { bold: true, size: 8, name: 'Arial', color: { argb: 'FF000000' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: \`FF\${themeColor}\` }
          };
          cell.alignment = { 
            vertical: 'middle', 
            horizontal: h.text.includes('Valor') || h.text.includes('Total') ? 'right' : (h.text.includes('Código') || h.text.includes('Un') || h.text.includes('Qtd') ? 'center' : 'left'),
            wrapText: true 
          };
        });
        
        for (let c = 1; c <= 12; c++) {
          worksheet.getCell(currentRow, c).border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
        currentRow++;

        // Row details
        order.products.forEach(prod => {
          // Code
          worksheet.getCell(\`A\${currentRow}\`).value = prod.code;
          worksheet.getCell(\`A\${currentRow}\`).alignment = { vertical: 'middle', horizontal: 'center' };

          // Description
          worksheet.mergeCells(\`B\${currentRow}:G\${currentRow}\`);
          const descCell = worksheet.getCell(\`B\${currentRow}\`);
          descCell.value = prod.description;
          descCell.font = { bold: true, size: 8, name: 'Arial' };
          descCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

          // Unit
          worksheet.getCell(\`H\${currentRow}\`).value = prod.unit;
          worksheet.getCell(\`H\${currentRow}\`).alignment = { vertical: 'middle', horizontal: 'center' };

          // Qty
          worksheet.getCell(\`I\${currentRow}\`).value = prod.quantity;
          worksheet.getCell(\`I\${currentRow}\`).alignment = { vertical: 'middle', horizontal: 'center' };
          worksheet.getCell(\`I\${currentRow}\`).numFmt = '#,##0.00';

          // Unit value
          worksheet.getCell(\`J\${currentRow}\`).value = prod.unitValue;
          worksheet.getCell(\`J\${currentRow}\`).numFmt = '"R$"\#,##0.00';
          worksheet.getCell(\`J\${currentRow}\`).alignment = { vertical: 'middle', horizontal: 'right' };

          // Discount
          worksheet.getCell(\`K\${currentRow}\`).value = prod.discountPercent / 100;
          worksheet.getCell(\`K\${currentRow}\`).numFmt = '0.0%';
          worksheet.getCell(\`K\${currentRow}\`).alignment = { vertical: 'middle', horizontal: 'center' };

          // Total value
          worksheet.getCell(\`L\${currentRow}\`).value = prod.totalValue;
          worksheet.getCell(\`L\${currentRow}\`).numFmt = '"R$"\#,##0.00';
          worksheet.getCell(\`L\${currentRow}\`).font = { bold: true, size: 8, name: 'Arial' };
          worksheet.getCell(\`L\${currentRow}\`).alignment = { vertical: 'middle', horizontal: 'right' };

          // Borders & standard fonts
          for (let c = 1; c <= 12; c++) {
            const cell = worksheet.getCell(currentRow, c);
            if (c !== 2 && c !== 12) {
              cell.font = { size: 8, name: 'Arial' };
            }
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF000000' } },
              left: { style: 'thin', color: { argb: 'FF000000' } },
              bottom: { style: 'thin', color: { argb: 'FF000000' } },
              right: { style: 'thin', color: { argb: 'FF000000' } }
            };
          }
          currentRow++;
        });

        // Spacing row
        worksheet.addRow([]);
        currentRow++;
      }

      // --- ROW TOTAL GENERAL ---
      worksheet.mergeCells(\`A\${currentRow}:K\${currentRow}\`);
      const totalLabelCell = worksheet.getCell(\`A\${currentRow}\`);
      totalLabelCell.value = 'Total da OS:';
      totalLabelCell.font = { bold: true, size: 9.5, name: 'Arial', color: { argb: 'FF000000' } };
      totalLabelCell.alignment = { vertical: 'middle', horizontal: 'right' };
      totalLabelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' }
      };

      const totalValueCell = worksheet.getCell(\`L\${currentRow}\`);
      totalValueCell.value = order.totalValue;
      totalValueCell.font = { bold: true, size: 10, name: 'Arial', color: { argb: 'FF000000' } };
      totalValueCell.alignment = { vertical: 'middle', horizontal: 'right' };
      totalValueCell.numFmt = '"R$"\#,##0.00';
      totalValueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' }
      };

      for (let c = 1; c <= 12; c++) {
        worksheet.getCell(currentRow, c).border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      }
      currentRow += 2; // Add some space

      // --- SIGNATURES SECTION ---
      worksheet.mergeCells(\`A\${currentRow}:F\${currentRow}\`);
      const clientSignUnderline = worksheet.getCell(\`A\${currentRow}\`);
      clientSignUnderline.border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };

      worksheet.mergeCells(\`G\${currentRow}:L\${currentRow}\`);
      const providerSignUnderline = worksheet.getCell(\`G\${currentRow}\`);
      providerSignUnderline.border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };
      
      currentRow++;

      // Signatures text
      worksheet.mergeCells(\`A\${currentRow}:F\${currentRow}\`);
      const clientSignCell = worksheet.getCell(\`A\${currentRow}\`);
      clientSignCell.value = order.clientRepresentative || 'REPRESENTANTE DO CLIENTE';
      clientSignCell.font = { bold: true, size: 8.5, name: 'Arial' };
      clientSignCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Provider team names
      const pTech1 = technicians.find(t => t.id === order.technicianId);
      const pTech2 = order.technician2Id ? technicians.find(t => t.id === order.technician2Id) : null;
      const techNames = [pTech1?.name, pTech2?.name].filter(Boolean).join(' / ');
      const authDate = order.finishedAt ? new Date(order.finishedAt).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');

      worksheet.mergeCells(\`G\${currentRow}:L\${currentRow}\`);
      const providerSignCell = worksheet.getCell(\`G\${currentRow}\`);
      providerSignCell.value = \`Equipe autenticada no app JDSmartOS (APP: \${authDate} \${techNames})\`;
      providerSignCell.font = { italic: true, size: 7.5, name: 'Arial', color: { argb: 'FF475569' } };
      providerSignCell.alignment = { vertical: 'middle', horizontal: 'center' };

      currentRow++;

      // Signatures subtitle
      worksheet.mergeCells(\`A\${currentRow}:F\${currentRow}\`);
      const clientSubCell = worksheet.getCell(\`A\${currentRow}\`);
      clientSubCell.value = order.clientRepresentativeMatricula ? \`Matrícula/CPF: \${order.clientRepresentativeMatricula} — \${order.clientName}\` : order.clientName;
      clientSubCell.font = { size: 8, name: 'Arial', color: { argb: 'FF475569' } };
      clientSubCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.mergeCells(\`G\${currentRow}:L\${currentRow}\`);
      const providerSubCell = worksheet.getCell(\`G\${currentRow}\`);
      providerSubCell.value = printCompany?.fullName;
      providerSubCell.font = { bold: true, size: 8, name: 'Arial', color: { argb: 'FF000000' } };
      providerSubCell.alignment = { vertical: 'middle', horizontal: 'center' };

      currentRow++;

      worksheet.mergeCells(\`G\${currentRow}:L\${currentRow}\`);
      const providerSub2Cell = worksheet.getCell(\`G\${currentRow}\`);
      providerSub2Cell.value = 'PRESTADORA AUTORIZADA';
      providerSub2Cell.font = { bold: true, size: 7.5, name: 'Arial', color: { argb: 'FF64748B' } };
      providerSub2Cell.alignment = { vertical: 'middle', horizontal: 'center' };

      currentRow++;

      // Write to buffer and trigger download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.id = \`lnk-download-excel-\${order.id}\`;
      link.href = downloadUrl;
      link.download = \`OS_\${order.id}_\${order.clientName.replace(/\\s+/g, '_')}.xlsx\`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao gerar planilha Excel:', err);
      alert('Erro ao gerar o arquivo Excel da Ordem de Serviço.');
    }
  };

  // Filtros de busca`;
fs.writeFileSync(filePath, content.slice(0, startIndex) + replacement + content.slice(endIndex), 'utf8');
console.log('Successfully reverted Excel export function!');

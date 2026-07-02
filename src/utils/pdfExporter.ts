import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StabilityResults, MaterialProperties, DamGeometry, Point2D } from '../types';
import { UnitSystem, UNIT_CONFIGS } from './units';

// Helper to load image as base64 safely with fallback
async function getLogoBase64(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
          return;
        }
      } catch (e) {
        console.warn("Failed canvas context or base64 conversion", e);
      }
      resolve(null);
    };
    img.onerror = () => {
      resolve(null);
    };
  });
}

export async function exportToPDF(
  geometry: DamGeometry,
  materials: MaterialProperties,
  waterUpstream: number,
  waterDownstream: number,
  results: StabilityResults,
  unitSystem: UnitSystem
) {
  // Pre-load logos asynchronously with fallback
  const uncpLogoUrl = 'https://upload.wikimedia.org/wikipedia/commons/9/92/Escudo_UNCP.png';
  const civilLogoUrl = 'https://civil.uncp.edu.pe/wp-content/uploads/2025/06/logos-civil.png';

  const [logoLeft, logoRight] = await Promise.all([
    getLogoBase64(uncpLogoUrl),
    getLogoBase64(civilLogoUrl)
  ]);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const u = UNIT_CONFIGS[unitSystem];

  const today = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const primaryColor: [number, number, number] = [15, 23, 42]; // Slate 900
  const accentColor: [number, number, number] = [79, 70, 229]; // Indigo 600
  const passColor: [number, number, number] = [5, 150, 105];   // Emerald 600
  const failColor: [number, number, number] = [220, 38, 38];   // Red 600

  // Helper to format numbers in Spanish format
  const fNum = (val: number, decimals: number = 2): string => {
    if (val === Infinity) return 'Infinito';
    if (isNaN(val)) return '0.00';
    return val.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  // Leave space for the Header Banner (0 - 35 mm on page 1)
  let yPos = 48;

  const ensureSpace = (neededHeight: number) => {
    // A4 page height is 297 mm, and the footer is at Y=282. Max safe Y is 265.
    if (yPos + neededHeight > 265) {
      doc.addPage();
      yPos = 25; // below the subsequent pages running header (15 mm)
    }
  };

  // Set default font to helvetica
  doc.setFont('helvetica', 'normal');

  // 1. SUMMARY OF KEY SAFETY FACTORS (BENTO BOX STYLE IN PDF)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('1. Resumen de Seguridad y Estabilidad', 15, yPos);
  
  // Status Badge drawn dynamically in Section 1 instead of inside Header to make room for Academic Banner
  const statusX = 145;
  const statusWidth = 50;
  const statusHeight = 7;
  doc.setFillColor(results.passesAll ? passColor[0] : failColor[0], results.passesAll ? passColor[1] : failColor[1], results.passesAll ? passColor[2] : failColor[2]);
  doc.rect(statusX, yPos - 5, statusWidth, statusHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`ESTADO: ${results.passesAll ? 'ESTABLE' : 'INESTABLE'}`, statusX + statusWidth / 2, yPos - 5 + 4.5, { align: 'center' });

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(15, yPos + 2, 195, yPos + 2);
  yPos += 7;

  // Draw 2 summary boxes for FOS Overturning and Sliding
  const boxWidth = 85;
  const boxHeight = 22;

  // Box 1: Volteo
  doc.setFillColor(248, 250, 252);
  doc.rect(15, yPos, boxWidth, boxHeight, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(15, yPos, boxWidth, boxHeight, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('FACTOR DE SEGURIDAD AL VOLTEO (FOSv)', 18, yPos + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(results.passesOverturning ? passColor[0] : failColor[0], results.passesOverturning ? passColor[1] : failColor[1], results.passesOverturning ? passColor[2] : failColor[2]);
  doc.text(fNum(results.fosOverturning), 18, yPos + 13.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Exigido min: ${fNum(materials.targetFOSOverturning)} | Resultado: ${results.passesOverturning ? 'CUMPLE' : 'FALLA'}`, 18, yPos + 18.5);

  // Box 2: Sliding
  doc.setFillColor(248, 250, 252);
  doc.rect(110, yPos, boxWidth, boxHeight, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.rect(110, yPos, boxWidth, boxHeight, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('FACTOR DE SEGURIDAD AL DESLIZAMIENTO (FOSd)', 113, yPos + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(results.passesSliding ? passColor[0] : failColor[0], results.passesSliding ? passColor[1] : failColor[1], results.passesSliding ? passColor[2] : failColor[2]);
  doc.text(fNum(results.fosSliding), 113, yPos + 13.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Exigido min: ${fNum(materials.targetFOSSliding)} | Resultado: ${results.passesSliding ? 'CUMPLE' : 'FALLA'}`, 113, yPos + 18.5);

  yPos += boxHeight + 8;

  // Stresses and eccentricity summary table
  const checkStatusText = (pass: boolean) => pass ? 'CUMPLE (APROBADO)' : 'FALLA (RECHAZADO)';
  
  // Custom stress outputs to support kg/m² for ST system natively in the PDF too
  const getStressDisplay = (valKPa: number) => {
    if (unitSystem === 'ST') {
      return `${fNum(valKPa * 101.9716, 1)} kg/m²`;
    }
    return `${fNum(valKPa)} ${u.stress}`;
  };

  const getLimitDisplay = (limitKPa: number) => {
    if (unitSystem === 'ST') {
      return `\u2264 ${fNum(limitKPa * 101.9716, 0)} kg/m\u00B2`;
    }
    return `\u2264 ${fNum(limitKPa)} ${u.stress}`;
  };

  autoTable(doc, {
    startY: yPos,
    margin: { left: 15, right: 15, top: 40, bottom: 20 },
    head: [['Verificacion Estructural', 'Valor Calculado', 'Limite Admisible', 'Resultado']],
    body: [
      [
        'Esfuerzo de Compresion en el Talon',
        getStressDisplay(results.stressHeel),
        `${getLimitDisplay(materials.allowableBearing)} (Capacidad Portante)`,
        { content: checkStatusText(results.passesCompression && results.stressHeel >= 0), styles: { textColor: ((results.passesCompression && results.stressHeel >= 0) ? passColor : failColor) as any, fontStyle: 'bold' as any } }
      ],
      [
        'Esfuerzo de Compresion en la Puntera',
        getStressDisplay(results.stressToe),
        `${getLimitDisplay(materials.allowableBearing)} (Capacidad Portante)`,
        { content: checkStatusText(results.passesCompression && results.stressToe >= 0), styles: { textColor: ((results.passesCompression && results.stressToe >= 0) ? passColor : failColor) as any, fontStyle: 'bold' as any } }
      ],
      [
        'Excentricidad de la Resultante (e)',
        `${fNum(results.eccentricity)} ${u.length}`,
        `Tercio Medio: [-${fNum(results.baseWidth / 6)} ${u.length}, +${fNum(results.baseWidth / 6)} ${u.length}]`,
        { content: results.isWithinMiddleThird ? 'CUMPLE (Dentro del Nucleo)' : 'TENSION (Fuera del Nucleo)', styles: { textColor: (results.isWithinMiddleThird ? passColor : failColor) as any, fontStyle: 'bold' as any } }
      ],
      [
        'Esfuerzo de Traccion en la Base',
        results.stressHeel < 0 || results.stressToe < 0 ? `Traccion Max: ${getStressDisplay(Math.min(results.stressHeel, results.stressToe))}` : `Sin Traccion`,
        `\u2265 ${getStressDisplay(materials.allowableTension)} (Admisible)`,
        { content: results.passesTension ? 'CUMPLE' : 'FALLA (Traccion Excesiva)', styles: { textColor: (results.passesTension ? passColor : failColor) as any, fontStyle: 'bold' as any } }
      ],
    ],
    theme: 'striped',
    headStyles: { fillColor: accentColor as any, fontSize: 8.5, fontStyle: 'bold', font: 'helvetica' },
    bodyStyles: { fontSize: 8, font: 'helvetica' },
    styles: { cellPadding: 2.5, overflow: 'linebreak', font: 'helvetica' },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 35 },
      2: { cellWidth: 50 },
      3: { cellWidth: 40 }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + 8;
  ensureSpace(45); // Check if we need a page break before Section 2

  // 2. PHYSICAL AND MATERIAL PROPERTIES + WATER SPECS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('2. Parametros de Diseno y Cargas de Entrada', 15, yPos);
  
  doc.line(15, yPos + 2, 195, yPos + 2);
  yPos += 5;

  autoTable(doc, {
    startY: yPos,
    margin: { left: 15, right: 15, top: 28, bottom: 20 },
    head: [['Propiedades de Materiales', 'Valor', 'Parametros Hidraulicos y 3D', 'Valor']],
    body: [
      [
        'Densidad del Concreto (g_c)',
        `${fNum(materials.gammaConcrete, 1)} ${u.density}`,
        'Nivel de Agua Aguas Arriba (h_u)',
        `${fNum(waterUpstream)} ${u.length}`
      ],
      [
        'Densidad del Agua (g_w)',
        `${fNum(materials.gammaWater, 2)} ${u.density}`,
        'Nivel de Agua Aguas Abajo (h_d)',
        `${fNum(waterDownstream)} ${u.length}`
      ],
      [
        'Coeficiente de Friccion Estatica (u)',
        `${fNum(materials.frictionCoeff, 3)}`,
        'Ancho de Base de la Presa (B)',
        `${fNum(results.baseWidth)} ${u.length}`
      ],
      [
        'Cohesion de la Cimentacion (c)',
        `${fNum(materials.cohesion, 1)} ${u.cohesion}`,
        'Longitud Longitudinal Total (L)',
        `${fNum(results.damLength, 0)} ${u.length}`
      ],
      [
        'Esfuerzo Admisible Cimentacion',
        `${fNum(materials.allowableBearing, 0)} ${u.stress}`,
        'Area de Seccion Bidimensional',
        `${fNum(results.area)} ${u.length}2`
      ],
      [
        'Esfuerzo Admisible Traccion',
        `${fNum(materials.allowableTension, 1)} ${u.stress}`,
        'Pantalla de Inyecciones (Grout Curtain)',
        materials.groutCurtainActive ? `Activa (Eficiencia ${fNum(materials.groutCurtainEfficiency * 100, 0)}%)` : 'Inactiva'
      ],
    ],
    theme: 'plain',
    headStyles: { fillColor: primaryColor as any, textColor: [255, 255, 255] as any, fontSize: 8.5, fontStyle: 'bold', font: 'helvetica' },
    bodyStyles: { fontSize: 8, font: 'helvetica' },
    styles: { cellPadding: 2, overflow: 'linebreak', font: 'helvetica' },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 35 },
      2: { cellWidth: 55 },
      3: { cellWidth: 35 }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + 8;
  ensureSpace(40); // Check if we need to add a page break before Section 3 to keep it orderly

  // 3. COORDINATES TABLE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('3. Coordenadas de los Vertices del Perfil', 15, yPos);
  doc.line(15, yPos + 2, 195, yPos + 2);
  yPos += 5;

  const coordRows = geometry.points.map((p, index) => {
    let typeName = 'Nodo Libre';
    if (p.handleType === 'heel') typeName = 'Talon (Origen X=0, Y=0)';
    else if (p.handleType === 'toe') typeName = 'Puntera (Base)';
    else if (p.handleType === 'crest-left') typeName = 'Corona - Limite Izquierdo';
    else if (p.handleType === 'crest-right') typeName = 'Corona - Limite Derecho';

    return [
      `Vertice ${index + 1} (${p.id})`,
      typeName,
      `${fNum(p.x, 3)} ${u.length}`,
      `${fNum(p.y, 3)} ${u.length}`
    ];
  });

  autoTable(doc, {
    startY: yPos,
    margin: { left: 15, right: 15, top: 28, bottom: 20 },
    head: [['Identificador', 'Tipo de Vertice / Rol', 'Coordenada X (Distancia)', 'Coordenada Y (Altura)']],
    body: coordRows,
    theme: 'striped',
    headStyles: { fillColor: primaryColor as any, textColor: [255, 255, 255] as any, fontSize: 8.5, fontStyle: 'bold', font: 'helvetica' },
    bodyStyles: { fontSize: 8, font: 'helvetica' },
    styles: { cellPadding: 2, overflow: 'linebreak', font: 'helvetica' },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 70 },
      2: { cellWidth: 40 },
      3: { cellWidth: 40 }
    }
  });

  // ADD NEW PAGE FOR FORCES INTEGRATION & MEMORY EXPLANATION
  doc.addPage();
  yPos = 25;

  // 4. DETAILED FORCE INTEGRATION
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('4. Integracion Detallada del Sistema de Fuerzas', 15, yPos);
  doc.line(15, yPos + 2, 195, yPos + 2);
  yPos += 5;

  const forcesRows: any[] = results.forces.map(f => {
    const isStabilizing = f.type === 'stabilizing';
    return [
      f.name,
      `${fNum(f.fx)} ${u.force}`,
      `${fNum(f.fy)} ${u.force}`,
      `${fNum(f.leverArm ?? 0)} ${u.length}`,
      `${fNum(f.momentToe)} ${u.moment}`,
      { content: isStabilizing ? 'Estabilizante' : 'Volcador', styles: { textColor: (isStabilizing ? passColor : failColor) as any, fontStyle: 'bold' as any } }
    ];
  });

  autoTable(doc, {
    startY: yPos,
    margin: { left: 15, right: 15, top: 28, bottom: 20 },
    head: [['Accion / Fuerza', 'Horiz. Fx (+Der)', 'Vert. Fy (+Abajo)', 'Brazo a Puntera', 'Momento (Toe)', 'Efecto']],
    body: forcesRows,
    theme: 'striped',
    headStyles: { fillColor: accentColor as any, textColor: [255, 255, 255] as any, fontSize: 8.5, fontStyle: 'bold', font: 'helvetica' },
    bodyStyles: { fontSize: 8, font: 'helvetica' },
    styles: { cellPadding: 2, overflow: 'linebreak', font: 'helvetica' },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 25 },
      2: { cellWidth: 25 },
      3: { cellWidth: 25 },
      4: { cellWidth: 35 },
      5: { cellWidth: 25 }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + 8;
  ensureSpace(45); // Check if we need to add a page break before Section 5

  // 5. FORCE EQUILIBRIUM SUMMARY
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('5. Resumen de Equilibrio de Momentos y Fuerzas', 15, yPos);
  doc.line(15, yPos + 2, 195, yPos + 2);
  yPos += 5;

  autoTable(doc, {
    startY: yPos,
    margin: { left: 15, right: 15, top: 28, bottom: 20 },
    head: [['Componente de Equilibrio', 'Valor', 'Ecuacion / Memoria de Calculo Asociada']],
    body: [
      [
        'Suma de Fuerzas Horizontales Actuantes (H)',
        `${fNum(results.sumHorizontalOverturning)} ${u.force}`,
        'Sumatoria de todas las fuerzas horizontales activas (empujes de agua, sismo, sedimentos, etc.)'
      ],
      [
        'Suma de Fuerzas Verticales Estabilizadoras (V_est)',
        `${fNum(results.sumVerticalStabilizing)} ${u.force}`,
        'Sumatoria de todas las fuerzas verticales hacia abajo (peso de concreto, peso del agua sobre taludes)'
      ],
      [
        'Suma de Fuerzas Verticales Overturning (V_over)',
        `${fNum(results.sumVerticalOverturning)} ${u.force}`,
        'Sumatoria de todas las fuerzas verticales hacia arriba (subpresion, sismo vertical)'
      ],
      [
        'Suma de Momentos Estabilizadores (Me)',
        `${fNum(results.sumMomentStabilizing)} ${u.moment}`,
        'Momento total antihorario calculado respecto al punto de la Puntera (Toe)'
      ],
      [
        'Suma de Momentos Volcadores (Mv)',
        `${fNum(results.sumMomentOverturning)} ${u.moment}`,
        'Momento horario total provocado por el empuje de agua y la subpresion'
      ],
      [
        'Factor de Seguridad al Volteo (FOSv)',
        fNum(results.fosOverturning),
        'FOSv = Me / Mv  (Requerido \u2265 1.5)'
      ],
      [
        'Factor de Seguridad al Deslizamiento (FOSd)',
        fNum(results.fosSliding),
        materials.soilResistanceBase && materials.soilResistanceBase > 0
          ? `FOSd = (u * V_net + s_R * B) / H (Con resistencia de suelo cimentacion)`
          : 'FOSd = (u * V_net) / H (Friccion simple de cuerpo rigido)'
      ],
    ],
    theme: 'plain',
    headStyles: { fillColor: primaryColor as any, textColor: [255, 255, 255] as any, fontSize: 8.5, fontStyle: 'bold', font: 'helvetica' },
    bodyStyles: { fontSize: 8, font: 'helvetica' },
    styles: { cellPadding: 2, overflow: 'linebreak', font: 'helvetica' },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 30 },
      2: { cellWidth: 90 }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + 8;
  ensureSpace(25); // Check if we need to add a page break before the disclaimer

  // 7. DISCLAIMER AND FOOTER
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  
  const footerText1 = 'PRESAESTABLE . Verificador de estabilidad y equilibrio limite de presas de gravedad de concreto basandose en el analisis de cuerpo rigido estandar del US Bureau of Reclamation.';
  const footerText2 = 'Este reporte fue compilado de forma exacta por el cliente web y se presenta como memoria de calculo oficial de la Facultad de Ingenieria Civil - UNCP para el curso de Mecanica de Fluidos.';
  
  const splitText1 = doc.splitTextToSize(footerText1, 180);
  const splitText2 = doc.splitTextToSize(footerText2, 180);
  
  doc.text(splitText1, 15, yPos);
  yPos += splitText1.length * 3.5 + 1;
  doc.text(splitText2, 15, yPos);

  // 8. SECOND-PASS DYNAMIC HEADERS & FOOTERS (Renders beautiful academic layouts across all pages)
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Header Drawing
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    if (i === 1) {
      // Academic Banner for Cover Page
      doc.rect(0, 0, 210, 35, 'F');
      
      // Left Logo (UNCP)
      if (logoLeft) {
        doc.addImage(logoLeft, 'PNG', 15, 4, 20, 27);
      } else {
        // Fallback: green/yellow circular badge if image fails to load
        doc.setFillColor(5, 150, 105);
        doc.circle(25, 17.5, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('UNCP', 25, 18.5, { align: 'center' });
      }

      // Right Logo (FACULTAD DE INGENIERIA CIVIL)
      if (logoRight) {
        doc.addImage(logoRight, 'PNG', 175, 4, 20, 27);
      } else {
        // Fallback: crimson circle badge
        doc.setFillColor(185, 28, 28);
        doc.circle(185, 17.5, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('FIC', 185, 18.5, { align: 'center' });
      }

      // Center text with elegant, polished lettering (unaccented to keep letter shapes perfectly aligned)
      doc.setTextColor(251, 191, 36); // Amber 400 (Gold)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('MECANICA DE FLUIDOS', 105, 13, { align: 'center' });

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.text('FACULTAD DE INGENIERIA CIVIL - UNCP', 105, 19, { align: 'center' });

      doc.setTextColor(203, 213, 225); // Slate 300
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Analisis de Estabilidad y Equilibrio Limite de Presas de Gravedad', 105, 25, { align: 'center' });

      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // Slate 400
      doc.text(`Generado el: ${today} | Exportado por cristiamvalan24@gmail.com`, 105, 30, { align: 'center' });

    } else {
      // Mini running header for subsequent pages
      doc.rect(0, 0, 210, 15, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('MECANICA DE FLUIDOS - MEMORIA DE CALCULO DE ESTABILIDAD', 15, 9.5);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(226, 232, 240);
      doc.text('FACULTAD DE INGENIERIA CIVIL - UNCP', 195, 9.5, { align: 'right' });
    }
    
    // Running Footer Separator Line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(15, 282, 195, 282);
    
    // Footer details on all pages
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('PRESAESTABLE . Memoria de Calculo de Estabilidad de Cuerpo Rigido', 15, 287);
    doc.text(`Pagina ${i} de ${pageCount}`, 195, 287, { align: 'right' });
  }

  // Download PDF
  const filename = `Reporte_Estabilidad_Presa_${geometry.mode === 'parametric' ? 'Parametrico' : 'DibujoLibre'}.pdf`;
  doc.save(filename);
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { StabilityResults, MaterialProperties, DamGeometry } from '../types';
import { exportToPDF } from '../utils/pdfExporter';
import { UnitSystem, UNIT_CONFIGS, convertValue } from '../utils/units';
import {
  CheckCircle2,
  XCircle,
  Shield,
  FileText,
  Anchor,
  BookOpen,
  ChevronDown,
  ChevronUp,
  AlertTriangle
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

interface ResultsPanelProps {
  geometry: DamGeometry;
  results: StabilityResults;
  materials: MaterialProperties;
  waterUpstream: number;
  waterDownstream: number;
  showAnalysis: boolean;
  onRunAnalysis: () => void;
  unitSystem: UnitSystem;
}

export default function ResultsPanel({
  geometry,
  results,
  materials,
  waterUpstream,
  waterDownstream,
  showAnalysis,
  onRunAnalysis,
  unitSystem,
}: ResultsPanelProps) {
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [showDetailedCalculations, setShowDetailedCalculations] = useState(false);
  const [activeTab, setActiveTab] = useState<'full' | 'empty'>('full');
  const [isExporting, setIsExporting] = useState(false);
  const [showMemoryFull, setShowMemoryFull] = useState(false);
  const [showMemoryEmpty, setShowMemoryEmpty] = useState(false);

  const u = UNIT_CONFIGS[unitSystem];

  const formatNumber = (num: number, decimals: number = 2): string => {
    if (num === Infinity) return '∞';
    return isNaN(num) ? '0.00' : num.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const getForceSymbol = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes('peso propio') || lower.includes('concreto')) return 'W_T';
    if (lower.includes('aguas arriba') && lower.includes('hidrostático')) return 'F_H1';
    if (lower.includes('aguas abajo') && lower.includes('hidrostático')) return 'F_H2';
    if (lower.includes('subpresión') || lower.includes('uplift')) return 'F_sb';
    if (lower.includes('sismo vertical')) return 'E_sv';
    if (lower.includes('sísmica horizontal') || lower.includes('sismo horizontal')) return 'E_sh';
    if (lower.includes('westergaard')) return 'F_ws';
    if (lower.includes('sedimentos') || lower.includes('limo')) return 'F_limo';
    if (lower.includes('sobrecarga')) return 'P_q';
    if (lower.includes('peso del agua') && lower.includes('arriba')) return 'W_w1';
    if (lower.includes('peso del agua') && lower.includes('abajo')) return 'W_w2';
    return 'F_i';
  };

  const getStressDisplayValue = (stressKPa: number): { value: number; unit: string } => {
    if (unitSystem === 'ST') {
      // User explicitly requested kg/m² for S.T. with a multiplier of 101.9716
      return { value: stressKPa * 101.9716, unit: 'kg/m²' };
    }
    // Return standard unit configuration value
    return { value: convertValue(stressKPa, 'stress', 'SI', unitSystem), unit: u.stress };
  };

  const generateStressChartData = () => {
    if (geometry.baseWidth <= 0) return [];
    const steps = 20;
    const data = [];
    const B = geometry.baseWidth;
    
    const isFull = activeTab === 'full';
    const activeResults = isFull ? results : results.emptyDam;
    const isStressRedistributed = activeResults.stressRedistributed;
    const stressHeel = activeResults.stressHeel;
    const stressToe = activeResults.stressToe;
    const crackedLength = activeResults.crackedLength;
    const netHorizontalForce = isFull ? results.sumHorizontalOverturning : 0;
    const shearStressHeel = isFull ? results.shearStressHeel : 0;
    const shearStressToe = isFull ? results.shearStressToe : 0;

    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * B;
      let normal = 0, shear = 0;
      
      if (!isStressRedistributed && crackedLength === 0) {
        normal = stressHeel + (x / B) * (stressToe - stressHeel);
        shear = shearStressHeel + (x / B) * (shearStressToe - shearStressHeel);
      } else {
        const e = isFull ? results.eccentricity : results.emptyDam.eccentricity;
        const activeLength = B - crackedLength;
        
        if (e > 0) {
          if (x >= crackedLength) {
            const relX = x - crackedLength;
            normal = (relX / activeLength) * stressToe;
            shear = (relX / activeLength) * shearStressToe;
          } else {
            normal = 0;
            shear = 0;
          }
        } else {
          if (x <= activeLength) {
            normal = ((activeLength - x) / activeLength) * stressHeel;
            shear = ((activeLength - x) / activeLength) * shearStressHeel;
          } else {
            normal = 0;
            shear = 0;
          }
        }
      }
      
      // Convert normal and shear based on unit system (including the ST-specific kg/m² requested by the user)
      const normalDisp = getStressDisplayValue(normal);
      const shearDisp = getStressDisplayValue(shear);
      
      data.push({
        x: parseFloat(x.toFixed(2)),
        normal: parseFloat(normalDisp.value.toFixed(1)),
        shear: parseFloat(shearDisp.value.toFixed(1))
      });
    }
    return data;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const isFull = activeTab === 'full';
      const unitLabel = isFull ? getStressDisplayValue(0).unit : 'kPa';
      return (
        <div className="bg-slate-900 border border-slate-800 text-white p-3 rounded-xl shadow-xl text-xs space-y-1">
          <p className="font-bold border-b border-slate-800 pb-1 text-[11px]">
            Distancia: <span className="font-mono text-indigo-300">{label} {u.length}</span>
          </p>
          <p className="text-emerald-400">
            σ Esfuerzo Normal: <span className="font-bold font-mono">{payload[0].value} {unitLabel}</span>
          </p>
          <p className="text-amber-400">
            τ Esfuerzo Cortante: <span className="font-bold font-mono">{payload[1].value} {unitLabel}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const stressData = generateStressChartData();

  if (!showAnalysis) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-150 p-6 flex flex-col items-center justify-center text-center space-y-4 h-auto">
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
          <Shield className="w-6 h-6 text-slate-400" />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-sm">Sin Análisis Activo</h3>
          <p className="text-xs text-slate-400 max-w-xs mt-1">Configure los parámetros geométricos y presione el botón de cálculo para proyectar los factores estáticos.</p>
        </div>
        <button
          onClick={onRunAnalysis}
          className="px-4 py-2 bg-indigo-600 text-white font-semibold text-xs rounded-xl hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
        >
          Ejecutar Análisis
        </button>
      </div>
    );
  }

  const heelStressInfo = getStressDisplayValue(results.stressHeel);
  const toeStressInfo = getStressDisplayValue(results.stressToe);

  const emptyHeelStressInfo = getStressDisplayValue(results.emptyDam.stressHeel);
  const emptyToeStressInfo = getStressDisplayValue(results.emptyDam.stressToe);

  const bearingLimitInfo = getStressDisplayValue(materials.allowableBearing);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6 h-auto">
      {/* Header Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            Resultados de Estabilidad Estática
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Verificación de seguridad según criterios de equilibrio límite.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowDetailedCalculations(!showDetailedCalculations)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all border border-indigo-150 cursor-pointer shadow-xs shadow-indigo-100"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-600" />
            {showDetailedCalculations ? 'Ocultar Memorias' : 'Ver Memorias'}
          </button>
          <button
            onClick={() => setShowFormulaModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Ver Fórmulas
          </button>
          <button
            onClick={async () => {
              if (isExporting) return;
              setIsExporting(true);
              try {
                await exportToPDF(geometry, materials, waterUpstream, waterDownstream, results, unitSystem);
              } catch (e) {
                console.error("Error al exportar PDF:", e);
              } finally {
                setIsExporting(false);
              }
            }}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generando...
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5" />
                Reporte PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Selector de Pestañas Interactivas */}
      <div className="flex border-b border-slate-100 pb-px gap-1">
        <button
          onClick={() => setActiveTab('full')}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 rounded-t-lg cursor-pointer ${activeTab === 'full' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/20' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          Presa Llena (Con Agua)
        </button>
        <button
          onClick={() => setActiveTab('empty')}
          className={`px-4 py-2 text-xs font-bold transition-all border-b-2 rounded-t-lg cursor-pointer ${activeTab === 'empty' ? 'border-indigo-600 text-indigo-600 bg-indigo-50/20' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          Presa Vacía (Peso Propio)
        </button>
      </div>

      {/* CONTENIDO DE PESTAÑA: PRESA LLENA */}
      {activeTab === 'full' && (
        <div className="space-y-6">
          {/* Alerta de Inestabilidad por Subpresión */}
          {results.netVerticalForce <= 0 && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 shadow-xs">
              <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-rose-800 text-sm">¡Inestabilidad Crítica por Subpresión!</h4>
                <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                  La fuerza de subpresión (uplift) es mayor que el peso de la estructura (<strong>U &gt; W</strong>). 
                  La resultante neta vertical es de <strong>{formatNumber(convertValue(results.netVerticalForce, 'force', 'SI', unitSystem))} {u.force}</strong> (negativa o nula), 
                  lo que indica flotación inminente y pérdida total de contacto en la base. 
                  Por favor, aumente el peso propio de la presa (redimensionando la sección) o reduzca la subpresión (activando la pantalla de inyecciones o la galería de drenaje).
                </p>
              </div>
            </div>
          )}

          {/* Grid de Factores de Seguridad Principales */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-xl border ${results.passesOverturning ? 'border-emerald-100 bg-emerald-50/20' : 'border-red-100 bg-red-50/20'}`}>
              <div className="flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                <span>F.S. Volteo (Fo)</span>
                <Shield className={`w-3.5 h-3.5 ${results.passesOverturning ? 'text-emerald-500' : 'text-red-500'}`} />
              </div>
              <div className={`text-xl font-bold mt-1 ${results.passesOverturning ? 'text-emerald-700' : 'text-red-700'}`}>
                {formatNumber(results.fosOverturning)}
              </div>
              <div className="flex justify-between items-center text-[10px] text-gray-400 mt-2 border-t border-dashed border-gray-200 pt-1.5 font-mono">
                <span>Mínimo Exigido:</span>
                <span className="font-semibold text-gray-600">{materials.targetFOSOverturning.toFixed(1)}</span>
              </div>
            </div>

            <div className={`p-4 rounded-xl border ${results.passesSliding ? 'border-emerald-100 bg-emerald-50/20' : 'border-red-100 bg-red-50/20'}`}>
              <div className="flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                <span>F.S. Deslizamiento (Fc)</span>
                <Anchor className={`w-3.5 h-3.5 ${results.passesSliding ? 'text-emerald-500' : 'text-red-500'}`} />
              </div>
              <div className={`text-xl font-bold mt-1 ${results.passesSliding ? 'text-emerald-700' : 'text-red-700'}`}>
                {formatNumber(results.fosSliding)}
              </div>
              <div className="flex justify-between items-center text-[10px] text-gray-400 mt-2 border-t border-dashed border-gray-200 pt-1.5 font-mono">
                <span>Mínimo Exigido:</span>
                <span className="font-semibold text-gray-600">{materials.targetFOSSliding.toFixed(1)}</span>
              </div>
            </div>

            <div className={`p-4 rounded-xl border ${results.isWithinMiddleThird ? 'border-emerald-100 bg-emerald-50/20' : 'border-red-100 bg-red-50/20'}`}>
              <div className="flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                <span>Excentricidad (e)</span>
                <div className={`w-2 h-2 rounded-full ${results.isWithinMiddleThird ? 'bg-emerald-500' : 'bg-red-500'}`} />
              </div>
              <div className={`text-xl font-bold mt-1 ${results.isWithinMiddleThird ? 'text-emerald-700' : 'text-red-700'}`}>
                {formatNumber(convertValue(results.eccentricity, 'length', 'SI', unitSystem))} {u.length}
              </div>
              <div className="flex justify-between items-center text-[10px] text-gray-400 mt-2 border-t border-dashed border-gray-200 pt-1.5 font-mono">
                <span>Límite (B/6):</span>
                <span className="font-semibold text-gray-600">± {formatNumber(convertValue(geometry.baseWidth / 6, 'length', 'SI', unitSystem))} {u.length}</span>
              </div>
            </div>
          </div>

          {/* Verificación de Esfuerzos en Base */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase">Esfuerzos en la Base (Presa Llena)</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-mono">Teoría de Navier</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tensión en Talón (σ_Talón)</div>
                <div className="text-xl font-extrabold text-slate-800 mt-1">
                  {formatNumber(heelStressInfo.value)} {heelStressInfo.unit}
                </div>
                <div className="mt-2">
                  {results.stressHeel >= 0 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> CUMPLE (No tensión)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                      <AlertTriangle className="w-3 h-3 text-amber-500" /> TENSIÓN DETECTADA
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Compresión en Puntera (σ_Puntera)</div>
                <div className="text-xl font-extrabold text-slate-800 mt-1">
                  {formatNumber(toeStressInfo.value)} {toeStressInfo.unit}
                </div>
                <div className="mt-2">
                  {results.stressToe <= materials.allowableBearing ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> CUMPLE COMPRESIÓN
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                      <XCircle className="w-3 h-3 text-red-500" /> EXCEDE ADMISIBLE
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Gráfico de distribución de esfuerzos */}
          <div className="space-y-2 border border-slate-100 rounded-2xl p-4 bg-slate-50/30">
            <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Distribución de Esfuerzos en la Cimentación</h4>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={stressData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="x" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  <Area name="σ Normal" type="monotone" dataKey="normal" fill="#e0f2fe" stroke="#38bdf8" strokeWidth={1.5} activeDot={{ r: 4 }} />
                  <Line name="τ Cortante" type="monotone" dataKey="shear" stroke="#fbbf24" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO DE PESTAÑA: PRESA VACÍA */}
      {activeTab === 'empty' && (
        <div className="space-y-6">
          {/* Grid de Factores de Seguridad Principales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-4 rounded-xl border ${results.emptyDam.isWithinMiddleThird ? 'border-emerald-100 bg-emerald-50/20' : 'border-red-100 bg-red-50/20'}`}>
              <div className="flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                <span>Excentricidad (e)</span>
                <div className={`w-2 h-2 rounded-full ${results.emptyDam.isWithinMiddleThird ? 'bg-emerald-500' : 'bg-red-500'}`} />
              </div>
              <div className={`text-xl font-bold mt-1 ${results.emptyDam.isWithinMiddleThird ? 'text-emerald-700' : 'text-red-700'}`}>
                {formatNumber(convertValue(results.emptyDam.eccentricity, 'length', 'SI', unitSystem))} {u.length}
              </div>
              <div className="flex justify-between items-center text-[10px] text-gray-400 mt-2 border-t border-dashed border-gray-200 pt-1.5 font-mono">
                <span>Límite (B/6):</span>
                <span className="font-semibold text-gray-600">± {formatNumber(convertValue(geometry.baseWidth / 6, 'length', 'SI', unitSystem))} {u.length}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/30">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Peso Propio de la Presa</div>
              <div className="text-xl font-bold text-indigo-700 mt-1">
                {formatNumber(convertValue(results.emptyDam.weight, 'force', 'SI', unitSystem))} {u.force}
              </div>
              <div className="text-[10px] text-gray-400 mt-2 border-t border-dashed border-gray-200 pt-1.5 font-sans">
                Carga vertical total sin subpresión ni empujes
              </div>
            </div>
          </div>

          {/* Verificación de Esfuerzos en Base */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase">Esfuerzos en la Base (Presa Vacía)</h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-mono">Peso propio neto</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tensión en Talón (σ_Talón)</div>
                <div className="text-xl font-extrabold text-slate-800 mt-1">
                  {formatNumber(emptyHeelStressInfo.value)} {emptyHeelStressInfo.unit}
                </div>
                <div className="mt-2">
                  {results.emptyDam.stressHeel >= 0 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> CUMPLE (No tensión)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                      <AlertTriangle className="w-3 h-3 text-amber-500" /> TENSIÓN DETECTADA
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Compresión en Puntera (σ_Puntera)</div>
                <div className="text-xl font-extrabold text-slate-800 mt-1">
                  {formatNumber(emptyToeStressInfo.value)} {emptyToeStressInfo.unit}
                </div>
                <div className="mt-2">
                  {results.emptyDam.stressToe <= materials.allowableBearing ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> CUMPLE COMPRESIÓN
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                      <XCircle className="w-3 h-3 text-red-500" /> EXCEDE ADMISIBLE
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Gráfico de distribución de esfuerzos - Vacía */}
          <div className="space-y-2 border border-slate-100 rounded-2xl p-4 bg-slate-50/30">
            <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Distribución de Esfuerzos en la Cimentación</h4>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={stressData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="x" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  <Area name="σ Normal" type="monotone" dataKey="normal" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={1.5} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* MEMORIAS DE CÁLCULO DETALLADAS */}
      {showDetailedCalculations && (
        <div className="space-y-6 pt-4 border-t border-slate-150">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600" />
                Tabla de Fuerzas y Momentos de Estabilidad
              </h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">
                Valores {activeTab === 'full' ? 'Presa Llena' : 'Presa Vacía'}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-100 rounded-xl bg-white shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                    <th className="p-3">Fuerza / Componente</th>
                    <th className="p-3">Símbolo</th>
                    <th className="p-3 text-right">F_Horiz ({u.force})</th>
                    <th className="p-3 text-right">F_Vert ({u.force})</th>
                    <th className="p-3 text-right">Brazo a Puntera ({u.length})</th>
                    <th className="p-3 text-right">Momento ({u.moment})</th>
                    <th className="p-3 text-center">Efecto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-slate-600 font-mono">
                  {results.forces
                    .filter(f => activeTab === 'full' || f.name.toLowerCase().includes('peso propio') || f.name.toLowerCase().includes('concreto'))
                    .map((f, idx) => {
                      const isVertical = f.fy !== 0;
                      const displayFx = convertValue(f.fx, 'force', 'SI', unitSystem);
                      const displayFy = convertValue(f.fy, 'force', 'SI', unitSystem);
                      const displayArm = convertValue(f.leverArm ?? 0, 'length', 'SI', unitSystem);
                      const displayMoment = convertValue(f.momentToe, 'moment', 'SI', unitSystem);

                      return (
                        <tr key={idx} className="hover:bg-slate-50/30">
                          <td className="p-3 font-semibold text-slate-700 font-sans">{f.name}</td>
                          <td className="p-3 font-bold text-indigo-600">{getForceSymbol(f.name)}</td>
                          <td className="p-3 text-right">{!isVertical ? formatNumber(Math.abs(displayFx)) : '0.00'}</td>
                          <td className="p-3 text-right">{isVertical ? formatNumber(Math.abs(displayFy)) : '0.00'}</td>
                          <td className="p-3 text-right">{formatNumber(displayArm)}</td>
                          <td className={`p-3 text-right font-bold ${f.type === 'stabilizing' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatNumber(displayMoment)}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${f.type === 'stabilizing' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                              {f.type === 'stabilizing' ? 'Estabiliza' : 'Vuelca'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                  {/* Fila Resumen de Sumatorias */}
                  <tr className="bg-slate-100/60 font-bold border-t-2 border-slate-200 text-slate-800">
                    <td className="p-3 font-bold font-sans">SUMATORIAS / RESULTANTES</td>
                    <td className="p-3">∑</td>
                    <td className="p-3 text-right text-red-700 font-extrabold">
                      {formatNumber(Math.abs(convertValue(activeTab === 'full' ? results.netHorizontalForce : 0, 'force', 'SI', unitSystem)))}
                    </td>
                    <td className="p-3 text-right text-emerald-700 font-extrabold">
                      {formatNumber(convertValue(activeTab === 'full' ? results.netVerticalForce : results.emptyDam.weight, 'force', 'SI', unitSystem))}
                    </td>
                    <td className="p-3 text-right">--</td>
                    <td className="p-3 text-right text-indigo-700 font-extrabold flex flex-col items-end">
                      <span className="text-emerald-700 text-[11px]">Est: {formatNumber(convertValue(activeTab === 'full' ? results.sumMomentStabilizing : results.sumMomentStabilizing, 'moment', 'SI', unitSystem))}</span>
                      {activeTab === 'full' && <span className="text-red-700 text-[11px]">Vu: {formatNumber(convertValue(results.sumMomentOverturning, 'moment', 'SI', unitSystem))}</span>}
                    </td>
                    <td className="p-3 text-center text-[10px] text-slate-400 font-normal font-sans">
                      {activeTab === 'full' && (
                        <>F.S.: <strong className="text-indigo-600">{formatNumber(results.fosOverturning)}</strong></>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Memoria de Cálculo Paso a Paso */}
          <div className="border border-slate-150 bg-slate-50/20 rounded-2xl p-4">
            <button
              onClick={() => activeTab === 'full' ? setShowMemoryFull(!showMemoryFull) : setShowMemoryEmpty(!showMemoryEmpty)}
              className="w-full flex justify-between items-center text-slate-800 font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                Memoria de Cálculo Detallada Paso a Paso
              </span>
              {((activeTab === 'full' && showMemoryFull) || (activeTab === 'empty' && showMemoryEmpty)) ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
            </button>
            
            {activeTab === 'full' && showMemoryFull && (
              <div className="mt-4 space-y-6 pt-4 border-t border-slate-100 text-xs text-slate-600 leading-relaxed font-sans">
                {/* Paso 1 */}
                <div className="space-y-2 border-l-2 border-indigo-500 pl-4">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wide">Paso 1 — Peso total de la presa (W_T)</h4>
                  <p>La sección del cuerpo rígido se subdivide en figuras geométricas básicas. El peso de cada segmento es:</p>
                  <div className="font-mono bg-white p-2 rounded border border-slate-100 space-y-1">
                    {results.figures.map((fig, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>• {fig.name} ({fig.shape === 'triangle' ? 'Triángulo' : 'Rectángulo'}):</span>
                        <span className="font-bold">W_{idx+1} = {formatNumber(convertValue(fig.weight, 'force', 'SI', unitSystem))} {u.force}</span>
                      </div>
                    ))}
                    <div className="border-t border-dashed border-slate-200 pt-1 mt-1 flex justify-between font-extrabold text-slate-900">
                      <span>Peso Propio Total (W_T):</span>
                      <span>W_T = {formatNumber(convertValue(results.weight, 'force', 'SI', unitSystem))} {u.force}</span>
                    </div>
                  </div>
                </div>

                {/* Paso 2 */}
                <div className="space-y-2 border-l-2 border-indigo-500 pl-4">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wide">Paso 2 — Centroide de la presa desde la puntera (x̄_p)</h4>
                  <p>Se calcula la posición del centroide de las figuras y el momento estabilizador respecto a la puntera (punto de giro):</p>
                  <div className="font-mono bg-white p-2 rounded border border-slate-100 space-y-1">
                    <div className="flex justify-between">
                      <span>∑(W_i · d_i) =</span>
                      <span>{formatNumber(convertValue(results.figures.reduce((acc, f) => acc + f.weight * f.centroidX, 0), 'moment', 'SI', unitSystem))} {u.moment}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>x̄_puntera = ∑(W_i · d_i) / W_T =</span>
                      <span className="font-bold text-indigo-700">{formatNumber(convertValue(results.figures.reduce((acc, f) => acc + f.weight * f.centroidX, 0) / results.weight, 'length', 'SI', unitSystem))} {u.length}</span>
                    </div>
                  </div>
                </div>

                {/* Paso 3 */}
                <div className="space-y-2 border-l-2 border-indigo-500 pl-4">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wide">Paso 3 — Empuje Hidrostático y Subpresión (∑F_H y ∑F_V)</h4>
                  <div className="font-mono bg-white p-2 rounded border border-slate-100 space-y-1">
                    <div className="flex justify-between">
                      <span>Empuje Hidrostático Principal (Aguas Arriba):</span>
                      <span className="font-bold">{formatNumber(convertValue(0.5 * materials.gammaWater * Math.pow(waterUpstream, 2), 'force', 'SI', unitSystem))} {u.force}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Subpresión Total (Uplift):</span>
                      <span className="font-bold text-red-600">{formatNumber(convertValue(results.upliftTotalArea ?? 0, 'force', 'SI', unitSystem))} {u.force}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'empty' && showMemoryEmpty && (
              <div className="mt-4 space-y-6 pt-4 border-t border-slate-100 text-xs text-slate-600 leading-relaxed font-sans">
                <div className="space-y-2 border-l-2 border-indigo-500 pl-4">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wide">Paso 1 — Peso propio de la Presa</h4>
                  <p>En el estado de construcción / vacío, no actúan las fuerzas hidráulicas de empuje ni subpresión:</p>
                  <div className="font-mono bg-white p-2 rounded border border-slate-100 flex justify-between font-extrabold text-slate-900">
                    <span>Peso Neto Estructural:</span>
                    <span>{formatNumber(convertValue(results.emptyDam.weight, 'force', 'SI', unitSystem))} {u.force}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE FÓRMULAS DE ESTABILIDAD */}
      {showFormulaModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-6 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-slate-900">Ecuaciones y Fórmulas de Equilibrio Límite</h3>
                <p className="text-xs text-slate-500">Formulario oficial de estabilidad de presas por gravedad.</p>
              </div>
              <button
                onClick={() => setShowFormulaModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-600 leading-relaxed font-sans">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <h4 className="font-bold text-slate-800 uppercase mb-1">1. Factor de Seguridad ante Volteo (FOSv)</h4>
                <p className="font-mono bg-white p-2 rounded border border-slate-150 text-indigo-700 font-bold text-center">
                  FOSv = ∑ M_Estabilizadores / ∑ M_Volcadores
                </p>
                <p className="mt-1.5 text-[11px]">Calculado tomando como pivote o arista de giro el vértice inferior de la Puntera (Toe).</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <h4 className="font-bold text-slate-800 uppercase mb-1">2. Factor de Seguridad ante Deslizamiento (FOSd)</h4>
                <p className="font-mono bg-white p-2 rounded border border-slate-150 text-indigo-700 font-bold text-center mb-1.5">
                  FOSd = (μ · ∑ F_Verticales + c · B) / ∑ F_Horizontales
                </p>
                <p className="text-[11px]">Donde μ representa el coeficiente de fricción de la base, c es la cohesión y B es el ancho de la cimentación.</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <h4 className="font-bold text-slate-800 uppercase mb-1">3. Distribución de Esfuerzos Lineales (Fórmula de Navier)</h4>
                <p className="font-mono bg-white p-2 rounded border border-slate-150 text-indigo-700 font-bold text-center">
                  σ = (∑ F_V / B) · (1 ± 6·e / B)
                </p>
                <p className="mt-1.5 text-[11px]">Donde e es la excentricidad medida desde el centro del eje de la cimentación.</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowFormulaModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cerrar Formulario
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

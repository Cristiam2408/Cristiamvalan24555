/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MaterialProperties, DrainageGallery, DamGeometry, Point2D } from '../types';
import { DAM_PRESETS, findMinBaseWidthForOvertuningFOS } from '../utils/physics';
import { UnitSystem, UNIT_CONFIGS } from '../utils/units';
import {
  Settings,
  Waves,
  Layers,
  Sparkles,
  RotateCcw,
  Plus,
  Trash2,
  Grid,
  Info,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Undo,
  Check,
  Activity,
  Box,
  Lock,
  Unlock
} from 'lucide-react';

interface ControlPanelProps {
  geometry: DamGeometry;
  materials: MaterialProperties;
  waterUpstream: number;
  waterDownstream: number;
  drainage: DrainageGallery;
  snapToGrid: boolean;
  onUpdateGeometry: (geom: DamGeometry) => void;
  onUpdateMaterials: (mats: MaterialProperties) => void;
  onUpdateWater: (upstream: number, downstream: number) => void;
  onUpdateDrainage: (drain: DrainageGallery) => void;
  onSetSnapToGrid: (snap: boolean) => void;
  onApplyPreset: (index: number) => void;
  unitSystem: UnitSystem;
  geometryConfirmed: boolean;
  onSetGeometryConfirmed: (confirmed: boolean) => void;
}

export default function ControlPanel({
  geometry,
  materials,
  waterUpstream,
  waterDownstream,
  drainage,
  snapToGrid,
  onUpdateGeometry,
  onUpdateMaterials,
  onUpdateWater,
  onUpdateDrainage,
  onSetSnapToGrid,
  onApplyPreset,
  unitSystem,
  geometryConfirmed,
  onSetGeometryConfirmed,
}: ControlPanelProps) {
  const u = UNIT_CONFIGS[unitSystem];
  const [openSection, setOpenSection] = useState<'geometry' | 'water' | 'materials' | 'drainage'>('geometry');
  const [openGeotech, setOpenGeotech] = useState<boolean>(true);
  const [customVertexX, setCustomVertexX] = useState<string>('25');
  const [customVertexY, setCustomVertexY] = useState<string>('15');
  
  // States for adding vertices by angle (polar coordinates)
  const [addMethod, setAddMethod] = useState<'coords' | 'angle'>('coords');
  const [angleDistance, setAngleDistance] = useState<string>('5');
  const [angleDegrees, setAngleDegrees] = useState<string>('45');
  const [angleRefId, setAngleRefId] = useState<string>('');

  // States for trigonometric right triangle calculator
  const [useTrigCalc, setUseTrigCalc] = useState<boolean>(false);
  const [trigKnownType, setTrigKnownType] = useState<'h' | 'dx' | 'dy'>('dx');
  const [trigValue, setTrigValue] = useState<string>('5');

  useEffect(() => {
    if (useTrigCalc) {
      const angleVal = parseFloat(angleDegrees);
      const val = parseFloat(trigValue);
      if (!isNaN(angleVal) && !isNaN(val) && val > 0) {
        const angleRad = angleVal * (Math.PI / 180);
        let distance = 0;
        if (trigKnownType === 'h') {
          distance = val;
        } else if (trigKnownType === 'dx') {
          const absCos = Math.abs(Math.cos(angleRad));
          if (absCos > 0.0001) {
            distance = val / absCos;
          }
        } else if (trigKnownType === 'dy') {
          const absSin = Math.abs(Math.sin(angleRad));
          if (absSin > 0.0001) {
            distance = val / absSin;
          }
        }
        if (distance > 0) {
          setAngleDistance(distance.toFixed(3));
        }
      }
    }
  }, [useTrigCalc, trigKnownType, trigValue, angleDegrees]);

  useEffect(() => {
    if (geometry.points.length > 0 && !angleRefId) {
      setAngleRefId(geometry.points[geometry.points.length - 1].id);
    }
  }, [geometry.points, angleRefId]);

  const minBaseWidthForFOS = findMinBaseWidthForOvertuningFOS(
    geometry,
    materials,
    waterUpstream,
    waterDownstream,
    drainage,
    1.5
  );

  const handleApplySuggestedBaseWidth = (suggestedWidth: number) => {
    handleGeometrySliderChange('baseWidth', parseFloat(suggestedWidth.toFixed(1)));
  };

  const toggleSection = (section: 'geometry' | 'water' | 'materials' | 'drainage') => {
    setOpenSection(openSection === section ? 'geometry' : section);
  };

  const handleGeometrySliderChange = (key: 'height' | 'crestWidth' | 'baseWidth' | 'upstreamSlope' | 'downstreamSlope', val: number) => {
    const updated = { ...geometry, [key]: val };
    
    // Auto-update coupled sliders to keep geometry valid:
    if (key === 'height' || key === 'crestWidth' || key === 'upstreamSlope' || key === 'baseWidth') {
      // n = (B - m * H - b) / H
      const computedN = (updated.baseWidth - updated.upstreamSlope * updated.height - updated.crestWidth) / updated.height;
      updated.downstreamSlope = Math.max(0, computedN);
    } else if (key === 'downstreamSlope') {
      // B = m * H + b + n * H
      updated.baseWidth = updated.upstreamSlope * updated.height + updated.crestWidth + val * updated.height;
    }

    onUpdateGeometry(updated);
  };

  const handleMaterialChange = (key: keyof MaterialProperties, val: number) => {
    onUpdateMaterials({
      ...materials,
      [key]: val,
    });
  };

  const handleDrainageChange = (key: keyof DrainageGallery, val: any) => {
    onUpdateDrainage({
      ...drainage,
      [key]: val,
    });
  };

  // Convert parametric sliders to inputs
  const startDrawingFree = () => {
    // Take current parametric points and switch mode
    onUpdateGeometry({
      ...geometry,
      mode: 'free',
    });
  };

  const resetToParametric = () => {
    onUpdateGeometry({
      ...geometry,
      mode: 'parametric',
    });
  };

  const clearFreeDrawing = () => {
    // Restart with a beautiful 8-point highly versatile profile gravity dam
    const heel: Point2D = { id: 'heel', x: 20, y: 0, isHandle: true, handleType: 'heel' };
    const p1: Point2D = { id: 'free-1', x: 20, y: 15, isHandle: true, handleType: 'free' };
    const p2: Point2D = { id: 'free-2', x: 20, y: 30, isHandle: true, handleType: 'free' };
    const p3: Point2D = { id: 'free-3', x: 23, y: 30, isHandle: true, handleType: 'free' };
    const p4: Point2D = { id: 'free-4', x: 26, y: 30, isHandle: true, handleType: 'free' };
    const p5: Point2D = { id: 'free-5', x: 31, y: 15, isHandle: true, handleType: 'free' };
    const p6: Point2D = { id: 'free-6', x: 35.5, y: 6, isHandle: true, handleType: 'free' };
    const toe: Point2D = { id: 'toe', x: 40, y: 0, isHandle: true, handleType: 'toe' };
    onUpdateGeometry({
      ...geometry,
      points: [heel, p1, p2, p3, p4, p5, p6, toe],
    });
  };

  const undoLastNode = () => {
    const freePoints = geometry.points.filter(p => p.handleType === 'free');
    if (freePoints.length === 0) return;
    const lastFree = freePoints[freePoints.length - 1];
    const filtered = geometry.points.filter(p => p.id !== lastFree.id);
    onUpdateGeometry({
      ...geometry,
      points: filtered
    });
  };

  const handleAddVertexSmart = () => {
    if (geometry.points.length < 2) return;
    
    // Find the longest segment of the dam's upper perimeter (excluding the base line toe -> heel)
    let maxLen = -1;
    let insertIndex = -1;
    
    for (let i = 0; i < geometry.points.length - 1; i++) {
      const p1 = geometry.points[i];
      const p2 = geometry.points[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > maxLen) {
        maxLen = len;
        insertIndex = i + 1;
      }
    }
    
    if (insertIndex === -1) return;
    
    const p1 = geometry.points[insertIndex - 1];
    const p2 = geometry.points[insertIndex];
    
    const newX = parseFloat(((p1.x + p2.x) / 2).toFixed(2));
    const newY = parseFloat(((p1.y + p2.y) / 2).toFixed(2));
    
    const newPoint: Point2D = {
      id: `free-${Date.now()}`,
      x: newX,
      y: newY,
      isHandle: true,
      handleType: 'free'
    };
    
    const updatedPoints = [...geometry.points];
    updatedPoints.splice(insertIndex, 0, newPoint);
    
    onUpdateGeometry({
      ...geometry,
      points: updatedPoints
    });
  };

  const handleAddNewVertexAtCoords = () => {
    const px = parseFloat(customVertexX);
    const py = parseFloat(customVertexY);
    if (isNaN(px) || isNaN(py)) return;

    // Create a new point
    const newPoint: Point2D = {
      id: `free-${Date.now()}`,
      x: Math.max(0, px),
      y: Math.max(0.1, py),
      isHandle: true,
      handleType: 'free'
    };

    // Helper to calculate distance from point to segment
    const getDistanceToSegment = (ptx: number, pty: number, x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) return Math.sqrt((ptx - x1) ** 2 + (pty - y1) ** 2);
      let t = ((ptx - x1) * dx + (pty - y1) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.sqrt((ptx - (x1 + t * dx)) ** 2 + (pty - (y1 + t * dy)) ** 2);
    };

    let minDistance = Infinity;
    let insertIndex = geometry.points.length;

    // Find closest segment to insert the node along the perimeter
    for (let i = 0; i < geometry.points.length; i++) {
      const pt1 = geometry.points[i];
      const pt2 = geometry.points[(i + 1) % geometry.points.length];
      const dist = getDistanceToSegment(newPoint.x, newPoint.y, pt1.x, pt1.y, pt2.x, pt2.y);
      if (dist < minDistance) {
        minDistance = dist;
        insertIndex = i + 1;
      }
    }

    const updatedPoints = [...geometry.points];
    updatedPoints.splice(insertIndex, 0, newPoint);

    // Pass the new points and make sure mode is 'free'
    onUpdateGeometry({
      ...geometry,
      mode: 'free',
      points: updatedPoints
    });
  };

  const handleAddNewVertexByAngle = () => {
    const dist = parseFloat(angleDistance);
    const angleDeg = parseFloat(angleDegrees);
    if (isNaN(dist) || isNaN(angleDeg)) return;

    // Find reference point
    const refPointIndex = geometry.points.findIndex(p => p.id === angleRefId);
    if (refPointIndex === -1) return;
    const refPoint = geometry.points[refPointIndex];

    // Calculate new coordinates relative to reference point
    const angleRad = angleDeg * (Math.PI / 180);
    const newX = parseFloat((refPoint.x + dist * Math.cos(angleRad)).toFixed(3));
    const newY = parseFloat((refPoint.y + dist * Math.sin(angleRad)).toFixed(3));

    const newPoint: Point2D = {
      id: `free-${Date.now()}`,
      x: Math.max(0, newX),
      y: Math.max(0, newY),
      isHandle: true,
      handleType: 'free'
    };

    // Insert immediately after the reference point in the points array
    const updatedPoints = [...geometry.points];
    updatedPoints.splice(refPointIndex + 1, 0, newPoint);

    onUpdateGeometry({
      ...geometry,
      mode: 'free',
      points: updatedPoints
    });
  };

  const handleUpdatePointPolar = (id: string, newDist: number | null, newAngle: number | null) => {
    const points = [...geometry.points];
    const index = points.findIndex(pt => pt.id === id);
    if (index <= 0) return; // Heel cannot be updated this way (no previous point)

    const pPrev = points[index - 1];
    const pCurr = points[index];

    let dist = newDist !== null ? newDist : Math.sqrt((pCurr.x - pPrev.x) ** 2 + (pCurr.y - pPrev.y) ** 2);
    let angleDeg = newAngle !== null ? newAngle : Math.atan2(pCurr.y - pPrev.y, pCurr.x - pPrev.x) * (180 / Math.PI);

    const angleRad = angleDeg * (Math.PI / 180);
    const updatedX = pPrev.x + dist * Math.cos(angleRad);
    const updatedY = pPrev.y + dist * Math.sin(angleRad);

    const updatedPoints = points.map(pt => {
      if (pt.id === id) {
        if (pt.handleType === 'toe') {
          return { ...pt, x: Math.max(0, updatedX), y: 0 };
        }
        return { ...pt, x: Math.max(0, updatedX), y: Math.max(0, updatedY) };
      }
      return pt;
    });

    onUpdateGeometry({
      ...geometry,
      mode: 'free',
      points: updatedPoints
    });
  };

  const getVertexAngleInfo = (idx: number, pts: Point2D[]) => {
    if (pts.length < 2) return null;
    const p = pts[idx];
    const pPrev = idx > 0 ? pts[idx - 1] : null;
    const pNext = idx < pts.length - 1 ? pts[idx + 1] : null;

    let distToPrev = 0;
    let angleToPrev = 0;
    if (pPrev) {
      const dx = p.x - pPrev.x;
      const dy = p.y - pPrev.y;
      distToPrev = Math.sqrt(dx * dx + dy * dy);
      angleToPrev = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angleToPrev < 0) angleToPrev += 360;
    }

    let internalAngle = 0;
    if (pPrev && pNext) {
      const v1x = pPrev.x - p.x;
      const v1y = pPrev.y - p.y;
      const v2x = pNext.x - p.x;
      const v2y = pNext.y - p.y;
      const angle1 = Math.atan2(v1y, v1x);
      const angle2 = Math.atan2(v2y, v2x);
      let diff = Math.abs(angle1 - angle2) * (180 / Math.PI);
      if (diff > 180) diff = 360 - diff;
      internalAngle = diff;
    }

    return {
      distToPrev,
      angleToPrev,
      internalAngle
    };
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-auto">
      {/* Panel Header */}
      <div className="bg-slate-900 px-5 py-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" />
          <h2 className="font-sans font-semibold tracking-tight text-sm">Parámetros de Diseño</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSetSnapToGrid(!snapToGrid)}
            title="Ajustar a cuadrícula"
            className={`p-1.5 rounded transition-colors cursor-pointer ${snapToGrid ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}
          >
            <Grid className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {/* SECTION 2: GEOMETRY */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('geometry')}
            className="w-full bg-slate-50 hover:bg-slate-100 px-4 py-3 flex items-center justify-between font-medium text-xs text-slate-700 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              <span>Geometría y Perfil de la Presa</span>
            </div>
            {openSection === 'geometry' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {openSection === 'geometry' && (
            <div className="p-4 bg-white border-t border-gray-100 space-y-4">
              {/* Mode Selector */}
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={resetToParametric}
                  className={`flex-1 py-1.5 text-center text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                    geometry.mode === 'parametric'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Perfil Paramétrico (Fijo)
                </button>
                <button
                  onClick={startDrawingFree}
                  className={`flex-1 py-1.5 text-center text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                    geometry.mode === 'free'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Dibujo Libre (Polígono)
                </button>
              </div>

              {geometry.mode === 'parametric' && (
                <div className="space-y-2 border border-slate-100 bg-slate-50/50 p-2.5 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Perfil / Forma Geométrica
                    </span>
                    <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">
                      Cambio Rápido
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        id: 'classic',
                        name: 'Gravedad Clásico',
                        desc: 'Vertical aguas arriba',
                        height: 30,
                        crestWidth: 6,
                        baseWidth: 26,
                        upstreamSlope: 0,
                        downstreamSlope: 0.67
                      },
                      {
                        id: 'double-slope',
                        name: 'Doble Talud',
                        desc: 'Inclinación simétrica',
                        height: 30,
                        crestWidth: 5,
                        baseWidth: 29,
                        upstreamSlope: 0.2,
                        downstreamSlope: 0.6
                      },
                      {
                        id: 'triangle',
                        name: 'Triángulo Puro',
                        desc: 'Mínimo coronamiento',
                        height: 25,
                        crestWidth: 1.5,
                        baseWidth: 19,
                        upstreamSlope: 0,
                        downstreamSlope: 0.7
                      },
                      {
                        id: 'robust',
                        name: 'Gravedad Robusta',
                        desc: 'Perfil reforzado',
                        height: 40,
                        crestWidth: 8,
                        baseWidth: 38,
                        upstreamSlope: 0.15,
                        downstreamSlope: 0.6
                      }
                    ].map((shape) => {
                      const scale = unitSystem === 'US' ? 3.28084 : 1.0;
                      const dispH = parseFloat((shape.height * scale).toFixed(1));
                      const dispB = parseFloat((shape.crestWidth * scale).toFixed(1));
                      const active =
                        Math.abs(geometry.height - shape.height * scale) < 3.0 &&
                        Math.abs(geometry.crestWidth - shape.crestWidth * scale) < 1.5 &&
                        Math.abs(geometry.upstreamSlope - shape.upstreamSlope) < 0.08;

                      return (
                        <button
                          key={shape.id}
                          type="button"
                          onClick={() => {
                            onUpdateGeometry({
                              ...geometry,
                              height: parseFloat((shape.height * scale).toFixed(2)),
                              crestWidth: parseFloat((shape.crestWidth * scale).toFixed(2)),
                              baseWidth: parseFloat((shape.baseWidth * scale).toFixed(2)),
                              upstreamSlope: shape.upstreamSlope,
                              downstreamSlope: shape.downstreamSlope,
                            });
                          }}
                          className={`p-2 rounded-lg border text-left transition-all hover:scale-[1.01] cursor-pointer flex flex-col justify-between ${
                            active
                              ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div>
                            <div className={`text-[11px] font-bold ${active ? 'text-indigo-800' : 'text-slate-700'}`}>
                              {shape.name}
                            </div>
                            <div className="text-[9px] text-slate-400 mt-0.5 line-clamp-1">{shape.desc}</div>
                          </div>
                          <div className="text-[8px] font-mono text-indigo-600 font-bold mt-1.5 flex justify-between w-full border-t border-dashed border-slate-100 pt-1">
                            <span>H: {dispH}{u.length}</span>
                            <span>b: {dispB}{u.length}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {geometry.mode === 'parametric' ? (
                <div className="space-y-4">
                  {/* Sliders for parametric dimensions */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-mono text-slate-700">
                      <span>Altura de Presa (H):</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min={unitSystem === 'US' ? 1.0 : 0.2}
                          max={unitSystem === 'US' ? 330 : 100}
                          value={geometry.height}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              handleGeometrySliderChange('height', val);
                            }
                          }}
                          className="w-16 text-right px-1.5 py-0.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <span className="text-slate-400 font-bold text-[10px]">{u.length}</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={unitSystem === 'US' ? 1.0 : 0.2}
                      max={unitSystem === 'US' ? 330 : 100}
                      step="0.01"
                      value={geometry.height}
                      onChange={(e) => handleGeometrySliderChange('height', parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-mono text-slate-700">
                      <span>Ancho Coronamiento (b):</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min={unitSystem === 'US' ? 0.3 : 0.1}
                          max={unitSystem === 'US' ? 65 : 20}
                          value={geometry.crestWidth}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              handleGeometrySliderChange('crestWidth', val);
                            }
                          }}
                          className="w-16 text-right px-1.5 py-0.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <span className="text-slate-400 font-bold text-[10px]">{u.length}</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={unitSystem === 'US' ? 0.3 : 0.1}
                      max={unitSystem === 'US' ? 65 : 20}
                      step="0.01"
                      value={geometry.crestWidth}
                      onChange={(e) => handleGeometrySliderChange('crestWidth', parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-mono text-slate-700">
                      <span>Ancho de Base (B):</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min={unitSystem === 'US' ? 1.0 : 0.2}
                          max={unitSystem === 'US' ? 330 : 100}
                          value={geometry.baseWidth}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              handleGeometrySliderChange('baseWidth', val);
                            }
                          }}
                          className="w-16 text-right px-1.5 py-0.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <span className="text-slate-400 font-bold text-[10px]">{u.length}</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={unitSystem === 'US' ? 1.0 : 0.2}
                      max={unitSystem === 'US' ? 330 : 100}
                      step="0.01"
                      value={geometry.baseWidth}
                      onChange={(e) => handleGeometrySliderChange('baseWidth', parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />

                    {/* Auto-suggest minimum baseWidth tool */}
                    {geometry.mode === 'parametric' && (
                      <div className="mt-2.5 p-2 bg-gradient-to-r from-indigo-50 to-slate-50 border border-indigo-100/80 rounded-lg space-y-1 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-[9px] font-bold text-indigo-900 uppercase tracking-wider">
                            <Sparkles className="w-3 h-3 text-indigo-600 animate-pulse" />
                            <span>Diseño Inteligente (FOS = 1.5)</span>
                          </div>
                        </div>
                        {minBaseWidthForFOS !== null ? (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] text-slate-600 leading-tight">
                              Base mínima requerida: <strong className="text-indigo-700">{minBaseWidthForFOS.toFixed(1)} m</strong>
                            </p>
                            <button
                              type="button"
                              onClick={() => handleApplySuggestedBaseWidth(minBaseWidthForFOS)}
                              disabled={Math.abs(geometry.baseWidth - minBaseWidthForFOS) < 0.1}
                              className="px-2 py-0.5 bg-indigo-600 text-white font-bold text-[9px] rounded hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all shadow-sm flex items-center gap-0.5 cursor-pointer"
                            >
                              <Check className="w-2.5 h-2.5" /> Aplicar
                            </button>
                          </div>
                        ) : (
                          <p className="text-[9px] text-rose-600 leading-tight">
                            ⚠️ No se puede alcanzar un FOS volcamiento ≥ 1.5 con esta combinación de altura y taludes.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-mono text-slate-700">
                      <span>Talud Aguas Arriba (m):</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="0.5"
                          value={geometry.upstreamSlope}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              handleGeometrySliderChange('upstreamSlope', val);
                            }
                          }}
                          className="w-16 text-right px-1.5 py-0.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.01"
                      value={geometry.upstreamSlope}
                      onChange={(e) => handleGeometrySliderChange('upstreamSlope', parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="text-[9px] text-gray-400 italic">Inclinación de la cara mojada (H:V)</div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-mono text-slate-700">
                      <span>Talud Aguas Abajo (n):</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1.2"
                          value={geometry.downstreamSlope}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              handleGeometrySliderChange('downstreamSlope', val);
                            }
                          }}
                          className="w-16 text-right px-1.5 py-0.5 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1.2"
                      step="0.01"
                      value={geometry.downstreamSlope}
                      onChange={(e) => handleGeometrySliderChange('downstreamSlope', parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="text-[9px] text-gray-400 italic">Inclinación de la cara seca (H:V)</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg space-y-1.5">
                    <div className="flex gap-2 text-indigo-800 font-semibold text-[11px] items-center">
                      <Info className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Instrucciones de Dibujo Libre</span>
                    </div>
                    <p className="text-[10px] text-indigo-700 leading-relaxed">
                      Haz clic en cualquier parte del lienzo para <strong>crear nuevos vértices de forma inteligente</strong> a lo largo del perímetro.
                      Arrastra los nodos para deformar libremente la presa, o edita sus coordenadas numéricas exactas abajo.
                    </p>
                  </div>

                  {/* TABLA DE COORDENADAS PARA EDICIÓN EXACTA */}
                  <div className="border border-slate-100 rounded-lg overflow-hidden">
                    <div className="bg-slate-100 px-2.5 py-1.5 border-b border-slate-200 text-[10px] font-bold text-slate-700 uppercase tracking-wider flex justify-between items-center">
                      <span>Lista de Vértices e Inclinación</span>
                      <span className="text-[9px] text-gray-400 capitalize">Modo libre activo</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-[10.5px]">
                      {geometry.points.map((p, index) => {
                        const angleInfo = getVertexAngleInfo(index, geometry.points);
                        return (
                          <div key={p.id} className="p-2 hover:bg-slate-50/50 flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-600 w-16 truncate">
                                {p.handleType === 'heel' ? '📍 Talón' : p.handleType === 'toe' ? '📍 Puntera' : `Nudo ${index + 1}`}
                              </span>
                              <div className="flex gap-1.5 items-center">
                                <span className="text-[9.5px] text-gray-400 font-mono">X:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={parseFloat(p.x.toFixed(3))}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val)) {
                                      const updated = geometry.points.map(pt => pt.id === p.id ? { ...pt, x: Math.max(0, val) } : pt);
                                      onUpdateGeometry({ ...geometry, points: updated, mode: 'free' });
                                    }
                                  }}
                                  className="w-13 px-1 py-0.5 border border-gray-200 rounded font-mono text-center text-slate-800 text-[10px] focus:border-indigo-500 focus:outline-none"
                                />
                                <span className="text-[9.5px] text-gray-400 font-mono ml-0.5">Y:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  disabled={p.handleType === 'heel' || p.handleType === 'toe'}
                                  value={parseFloat(p.y.toFixed(3))}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val)) {
                                      const updated = geometry.points.map(pt => pt.id === p.id ? { ...pt, y: Math.max(0, val) } : pt);
                                      onUpdateGeometry({ ...geometry, points: updated, mode: 'free' });
                                    }
                                  }}
                                  className="w-13 px-1 py-0.5 border border-gray-200 rounded font-mono text-center text-slate-800 text-[10px] focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-gray-400"
                                />
                              </div>
                              {geometry.points.length > 3 && p.handleType !== 'heel' && p.handleType !== 'toe' ? (
                                <button
                                  onClick={() => {
                                    const filtered = geometry.points.filter(pt => pt.id !== p.id);
                                    onUpdateGeometry({ ...geometry, points: filtered, mode: 'free' });
                                  }}
                                  title="Borrar nodo"
                                  className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <div className="w-6" />
                              )}
                            </div>

                            {/* Identificación de Ángulo y Longitud del Segmento */}
                            {angleInfo && (
                              <div className="bg-slate-50/80 rounded p-1 px-1.5 text-[9px] text-slate-500 flex flex-wrap gap-x-2 gap-y-1 items-center border border-slate-100">
                                <div className="flex items-center gap-1">
                                  <span className="font-semibold text-indigo-600">📐 Dist:</span>
                                  <input
                                    type="number"
                                    step="0.05"
                                    value={parseFloat(angleInfo.distToPrev.toFixed(2))}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      if (!isNaN(val) && val > 0) {
                                        handleUpdatePointPolar(p.id, val, null);
                                      }
                                    }}
                                    className="w-11 px-0.5 border border-gray-200 rounded font-mono text-center bg-white text-slate-800 text-[9px] focus:border-indigo-500 focus:outline-none"
                                  />
                                  <span className="text-gray-400">{u.length}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="font-semibold text-indigo-600">Talud/Incl:</span>
                                  <input
                                    type="number"
                                    step="1"
                                    value={Math.round(angleInfo.angleToPrev)}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      if (!isNaN(val)) {
                                        handleUpdatePointPolar(p.id, null, val);
                                      }
                                    }}
                                    className="w-10 px-0.5 border border-gray-200 rounded font-mono text-center bg-white text-slate-800 text-[9px] focus:border-indigo-500 focus:outline-none"
                                  />
                                  <span className="text-gray-400">°</span>
                                </div>
                                {angleInfo.internalAngle > 0 && (
                                  <div className="flex items-center gap-0.5 ml-auto text-amber-600 font-semibold bg-amber-50 px-1 py-0.2 rounded border border-amber-100/50" title="Ángulo interno en este vértice">
                                    <span>Int:</span>
                                    <span>{angleInfo.internalAngle.toFixed(1)}°</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>



                  <button
                    type="button"
                    onClick={handleAddVertexSmart}
                    className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-750 text-white font-bold text-[11px] py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                  >
                    <Plus className="w-4 h-4 bg-white/20 p-0.5 rounded-full" />
                    <span>AÑADIR VÉRTICE (SPLIT DE SEGMENTO)</span>
                  </button>
                  
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={undoLastNode}
                      disabled={!geometry.points.some(p => p.handleType === 'free')}
                      className="bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 border border-indigo-200 text-indigo-700 font-semibold text-[11px] py-2 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                      title="Deshacer el último nodo dibujado"
                    >
                      <Undo className="w-3.5 h-3.5" />
                      <span>Deshacer</span>
                    </button>
                    <button
                      onClick={clearFreeDrawing}
                      className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-semibold text-[11px] py-2 px-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      title="Borrar todo el diseño libre"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Limpiar</span>
                    </button>
                    <button
                      onClick={resetToParametric}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold text-[11px] py-2 px-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      title="Volver a la geometría paramétrica controlada por deslizadores"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Paramétrico</span>
                    </button>
                  </div>
                </div>
              )}
              
              {/* Botón de Confirmación de Geometría para el flujo secuencial */}
              <div className="pt-3 border-t border-slate-100 flex flex-col gap-1.5">
                <button
                  onClick={() => onSetGeometryConfirmed(!geometryConfirmed)}
                  className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                    geometryConfirmed
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-emerald-500/20'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-500/20 animate-pulse'
                  }`}
                >
                  {geometryConfirmed ? (
                    <>
                      <Unlock className="w-4 h-4" />
                      <span>Geometría Confirmada (Modificar)</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirmar Geometría y Desbloquear Parámetros</span>
                    </>
                  )}
                </button>
                <p className="text-[9px] text-slate-400 text-center italic">
                  {geometryConfirmed
                    ? 'Parámetros desbloqueados. Puede modificar los niveles de agua y propiedades de materiales.'
                    : 'Debe confirmar la geometría para desbloquear los paneles de agua, materiales y subpresión.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 3: WATER LEVELS */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('water')}
            className="w-full bg-slate-50 hover:bg-slate-100 px-4 py-3 flex items-center justify-between font-medium text-xs text-slate-700 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Waves className="w-4 h-4 text-blue-500" />
              <span>Niveles de Agua (Hidrostática)</span>
            </div>
            {openSection === 'water' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {openSection === 'water' && (
            <div className="p-4 bg-white border-t border-gray-100 space-y-4 relative min-h-[140px]">
              {!geometryConfirmed && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-[1px] z-20 flex flex-col items-center justify-center p-4 text-center">
                  <div className="bg-amber-50 text-amber-600 p-2 rounded-full mb-2 border border-amber-200 shadow-sm animate-pulse">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-0.5">Parámetros Bloqueados</h4>
                  <p className="text-[10px] text-slate-500 max-w-[260px] leading-snug">
                    Por favor, confirme primero la sección transversal en <b>"Geometría y Perfil de la Presa"</b> para habilitar estos parámetros.
                  </p>
                </div>
              )}
              {(() => {
                const maxH = geometry.points.reduce((max, p) => p.y > max ? p.y : max, 0);
                const percentUp = maxH > 0 ? (waterUpstream / maxH) * 100 : 0;
                const percentDown = maxH > 0 ? (waterDownstream / maxH) * 100 : 0;

                return (
                  <>
                    {/* Aguas Arriba (hu) */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono text-slate-700">
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          Aguas Arriba (hu):
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({percentUp.toFixed(0)}% de la presa)
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max={Math.max(unitSystem === 'US' ? 330 : 100, maxH * 1.5)}
                          step="0.1"
                          value={waterUpstream}
                          onChange={(e) => onUpdateWater(parseFloat(e.target.value) || 0, waterDownstream)}
                          className="flex-1 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <div className="flex items-center border border-gray-200 rounded-lg bg-slate-50 px-2 py-1 w-28 shadow-sm">
                          <input
                            type="number"
                            min="0"
                            max={Math.max(unitSystem === 'US' ? 990 : 300, maxH * 5)}
                            step="0.1"
                            value={waterUpstream}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              onUpdateWater(isNaN(val) ? 0 : val, waterDownstream);
                            }}
                            className="w-full text-right bg-transparent text-xs font-bold text-blue-700 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400 font-bold ml-1">{u.length}</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-gray-400 leading-tight">
                        Nivel de agua en embalse. Arrastre en el lienzo o digite libremente aquí su valor.
                      </div>
                    </div>

                    {/* Aguas Abajo (hd) */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-mono text-slate-700">
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                          Aguas Abajo (hd):
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({percentDown.toFixed(0)}% de la presa)
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max={Math.max(unitSystem === 'US' ? 330 : 100, maxH * 1.5)}
                          step="0.1"
                          value={waterDownstream}
                          onChange={(e) => onUpdateWater(waterUpstream, parseFloat(e.target.value) || 0)}
                          className="flex-1 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-teal-600"
                        />
                        <div className="flex items-center border border-gray-200 rounded-lg bg-slate-50 px-2 py-1 w-28 shadow-sm">
                          <input
                            type="number"
                            min="0"
                            max={Math.max(unitSystem === 'US' ? 990 : 300, maxH * 5)}
                            step="0.1"
                            value={waterDownstream}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              onUpdateWater(waterUpstream, isNaN(val) ? 0 : val);
                            }}
                            className="w-full text-right bg-transparent text-xs font-bold text-teal-700 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400 font-bold ml-1">{u.length}</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-gray-400 leading-tight">
                        Nivel de agua de restitución (aguas abajo). Arrastre en el lienzo o digite libremente aquí su valor.
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* SECTION 5: MATERIAL PROPERTIES */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('materials')}
            className="w-full bg-slate-50 hover:bg-slate-100 px-4 py-3 flex items-center justify-between font-medium text-xs text-slate-700 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-emerald-500" />
              <span>Propiedades de Materiales e Hipótesis</span>
            </div>
            {openSection === 'materials' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {openSection === 'materials' && (
            <div className="p-4 bg-white border-t border-gray-100 space-y-4 relative min-h-[140px]">
              {!geometryConfirmed && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-[1px] z-20 flex flex-col items-center justify-center p-4 text-center">
                  <div className="bg-amber-50 text-amber-600 p-2 rounded-full mb-2 border border-amber-200 shadow-sm animate-pulse">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider mb-0.5">Parámetros Bloqueados</h4>
                  <p className="text-[10px] text-slate-500 max-w-[260px] leading-snug">
                    Por favor, confirme primero la sección transversal en <b>"Geometría y Perfil de la Presa"</b> para habilitar estos parámetros.
                  </p>
                </div>
              )}
              {/* Longitud / Espesor de la presa */}
              <div className="space-y-1 bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100/30">
                <div className="flex justify-between text-xs font-mono text-slate-700">
                  <span>Longitud Total Presa (L):</span>
                  <span className="font-bold text-indigo-700">{(materials.damLength ?? (unitSystem === 'US' ? 160.0 : 50.0)).toFixed(0)} {u.length}</span>
                </div>
                <input
                  type="range"
                  min={unitSystem === 'US' ? 15 : 5}
                  max={unitSystem === 'US' ? 1600 : 500}
                  step={unitSystem === 'US' ? 15 : 5}
                  value={materials.damLength ?? (unitSystem === 'US' ? 160.0 : 50.0)}
                  onChange={(e) => handleMaterialChange('damLength', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="text-[9px] text-indigo-700 font-semibold italic">
                  Considera la dimensión transversal (3D) para reportar pesos y fuerzas de la estructura completa.
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs font-mono text-slate-700">
                  <span>Peso Específico Concreto (γc):</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step={unitSystem === 'US' ? '1' : '0.1'}
                      min={unitSystem === 'US' ? 90 : (unitSystem === 'ST' ? 1.0 : 10)}
                      max={unitSystem === 'US' ? 250 : (unitSystem === 'ST' ? 4.0 : 40)}
                      value={materials.gammaConcrete}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) handleMaterialChange('gammaConcrete', val);
                      }}
                      className="w-16 px-1 py-0.5 border border-gray-200 rounded text-right font-mono text-[11px] text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                    <span className="text-slate-400 text-[10px] font-bold">{u.density}</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={unitSystem === 'US' ? 100 : (unitSystem === 'ST' ? 1.5 : 15)}
                  max={unitSystem === 'US' ? 220 : (unitSystem === 'ST' ? 3.5 : 35)}
                  step={unitSystem === 'US' ? '1' : '0.1'}
                  value={materials.gammaConcrete}
                  onChange={(e) => handleMaterialChange('gammaConcrete', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-800"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-mono text-slate-700">
                  <span>Peso Específico Agua (γw):</span>
                  <span className="font-bold text-blue-600">{materials.gammaWater.toFixed(unitSystem === 'US' ? 1 : 2)} {u.density}</span>
                </div>
                <input
                  type="range"
                  min={unitSystem === 'US' ? 60.0 : (unitSystem === 'ST' ? 0.98 : 9.8)}
                  max={unitSystem === 'US' ? 64.0 : (unitSystem === 'ST' ? 1.02 : 10.2)}
                  step={unitSystem === 'US' ? 0.1 : 0.01}
                  value={materials.gammaWater}
                  onChange={(e) => handleMaterialChange('gammaWater', parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* Sección desplegable para parámetros geotécnicos */}
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50 mt-2">
                <button
                  type="button"
                  onClick={() => setOpenGeotech(!openGeotech)}
                  className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-emerald-600" />
                    Parámetros Geotécnicos de Cimentación
                  </span>
                  {openGeotech ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                
                {openGeotech && (
                  <div className="p-3 bg-white space-y-3.5 border-t border-slate-200">
                    {/* Fricción base (μ) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono text-slate-600">
                        <span>Fricción Base (μ):</span>
                        <span className="font-bold text-emerald-600">{materials.frictionCoeff.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="1.0"
                        step="0.01"
                        value={materials.frictionCoeff}
                        onChange={(e) => handleMaterialChange('frictionCoeff', parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                      />
                    </div>

                    {/* Cohesión (c) */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[11px] font-mono text-slate-600">
                        <span>Cohesión de la Base (c):</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            value={materials.cohesion}
                            onChange={(e) => handleMaterialChange('cohesion', parseFloat(e.target.value) || 0)}
                            className="w-14 px-1 py-0.5 border border-gray-200 rounded text-right font-mono text-[10px] text-slate-800 focus:outline-none"
                          />
                          <span className="text-slate-400 text-[9px]">{u.cohesion}</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={unitSystem === 'US' ? 20 : (unitSystem === 'ST' ? 100 : 1000)}
                        step="1"
                        value={materials.cohesion}
                        onChange={(e) => handleMaterialChange('cohesion', parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-600"
                      />
                    </div>

                    {/* Capacidad Admisible (q_admisible) */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[11px] font-mono text-slate-600">
                        <span>Capacidad Admisible (q_adm):</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="100"
                            max="10000"
                            value={materials.allowableBearing}
                            onChange={(e) => handleMaterialChange('allowableBearing', parseFloat(e.target.value) || 0)}
                            className="w-16 px-1 py-0.5 border border-gray-200 rounded text-right font-mono text-[10px] text-slate-800 focus:outline-none"
                          />
                          <span className="text-slate-400 text-[9px]">{u.stress}</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={unitSystem === 'US' ? 10 : (unitSystem === 'ST' ? 100 : 500)}
                        max={unitSystem === 'US' ? 200 : (unitSystem === 'ST' ? 1000 : 8000)}
                        step="50"
                        value={materials.allowableBearing}
                        onChange={(e) => handleMaterialChange('allowableBearing', parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-600"
                      />
                    </div>

                    {/* Coeficiente de subpresión (k) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono text-slate-600">
                        <span>Factor de Subpresión (k):</span>
                        <span className="font-bold text-amber-600">{(materials.upliftAreaFactor ?? 1.0).toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={materials.upliftAreaFactor ?? 1.0}
                        onChange={(e) => handleMaterialChange('upliftAreaFactor', parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                      <div className="text-[8px] text-gray-400 leading-tight">
                        Ajusta proporcionalmente los vectores de subpresión (porosidad/área efectiva).
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

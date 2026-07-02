/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Point2D, MaterialProperties, DrainageGallery, DamGeometry, StabilityResults } from './types';
import { performStabilityAnalysis, generateParametricPoints, DAM_PRESETS } from './utils/physics';
import { UnitSystem, UNIT_CONFIGS, convertState } from './utils/units';
import DamCanvas from './components/DamCanvas';
import ControlPanel from './components/ControlPanel';
import ResultsPanel from './components/ResultsPanel';
import { Anchor, Shield, HelpCircle, Layers, Check, AlertTriangle, Cpu, Undo, Redo, Lock, Unlock, Settings, Waves, Activity } from 'lucide-react';

export default function App() {
  // Splash Screen and Navigation Flow states
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [geometryConfirmed, setGeometryConfirmed] = useState<boolean>(false);
  const [upstreamSide, setUpstreamSide] = useState<'left' | 'right'>(() => {
    const saved = localStorage.getItem('upstreamSide');
    return (saved as 'left' | 'right') || 'left';
  });

  useEffect(() => {
    localStorage.setItem('upstreamSide', upstreamSide);
  }, [upstreamSide]);

  // Unit System state definition
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(() => {
    const saved = localStorage.getItem('unitSystem');
    return (saved as UnitSystem) || 'SI';
  });

  // 1. Initial State Definitions
  const [showAnalysis, setShowAnalysis] = useState<boolean>(() => {
    const saved = localStorage.getItem('showAnalysis');
    return saved ? JSON.parse(saved) : false;
  });

  const [materials, setMaterials] = useState<MaterialProperties>(() => {
    const saved = localStorage.getItem('materials');
    return saved ? JSON.parse(saved) : {
      gammaConcrete: 23, // 2300 kgf/m³ -> 23 kN/m³ in S.I.
      gammaWater: 10,    // 1000 kgf/m³ -> 10 kN/m³ in S.I.
      frictionCoeff: 0.55,
      cohesion: 0,
      allowableBearing: 3000,
      allowableTension: 0,
      targetFOSOverturning: 1.5,
      targetFOSSliding: 1.5,
      damLength: 50,
      groutCurtainActive: false,
      groutCurtainEfficiency: 0.5,
      upliftAreaFactor: 1.0,
      soilResistanceBase: 0,
    };
  });

  const [waterUpstream, setWaterUpstream] = useState<number>(() => {
    const saved = localStorage.getItem('waterUpstream');
    return saved ? JSON.parse(saved) : 25;
  });

  const [waterDownstream, setWaterDownstream] = useState<number>(() => {
    const saved = localStorage.getItem('waterDownstream');
    return saved ? JSON.parse(saved) : 3;
  });

  const [waterUpstreamPercent, setWaterUpstreamPercent] = useState<number>(() => {
    const saved = localStorage.getItem('waterUpstreamPercent');
    return saved ? JSON.parse(saved) : 83.3;
  });

  const [waterDownstreamPercent, setWaterDownstreamPercent] = useState<number>(() => {
    const saved = localStorage.getItem('waterDownstreamPercent');
    return saved ? JSON.parse(saved) : 10.0;
  });

  const [snapToGrid, setSnapToGrid] = useState<boolean>(() => {
    const saved = localStorage.getItem('snapToGrid');
    return saved ? JSON.parse(saved) : true;
  });

  const [drainage, setDrainage] = useState<DrainageGallery>(() => {
    const saved = localStorage.getItem('drainage');
    return saved ? JSON.parse(saved) : {
      active: false,
      locationFraction: 0.25,
      efficiency: 0.33,
    };
  });

  // Initial geometry: parametric 30m dam at absolute origin (0,0)
  const [geometry, setGeometry] = useState<DamGeometry>(() => {
    const saved = localStorage.getItem('geometry');
    return saved ? JSON.parse(saved) : {
      mode: 'parametric',
      height: 30,
      crestWidth: 6,
      baseWidth: 26,
      upstreamSlope: 0,
      downstreamSlope: 0.67, // (26 - 6) / 30
      points: generateParametricPoints(30, 6, 26, 0, 0.67, 0),
    };
  });

  // Undo and Redo History Stacks
  const [history, setHistory] = useState<DamGeometry[]>([]);
  const [redoStack, setRedoStack] = useState<DamGeometry[]>([]);
  const [projectKey, setProjectKey] = useState<number>(0);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  // 1b. Synchronization Effects with Local Storage to avoid refresh data loss
  useEffect(() => {
    localStorage.setItem('unitSystem', unitSystem);
  }, [unitSystem]);

  const handleUnitSystemChange = (nextSystem: UnitSystem) => {
    if (nextSystem === unitSystem) return;
    
    // Convert current states
    const converted = convertState(
      unitSystem,
      nextSystem,
      materials,
      geometry,
      waterUpstream,
      waterDownstream
    );
    
    // Apply converted states
    setMaterials(converted.materials);
    setGeometry(converted.geometry);
    setWaterUpstream(converted.waterUpstream);
    setWaterDownstream(converted.waterDownstream);
    
    // Set new unit system
    setUnitSystem(nextSystem);
    setShowAnalysis(false);
  };

  useEffect(() => {
    localStorage.setItem('materials', JSON.stringify(materials));
  }, [materials]);

  useEffect(() => {
    localStorage.setItem('waterUpstream', JSON.stringify(waterUpstream));
  }, [waterUpstream]);

  useEffect(() => {
    localStorage.setItem('waterDownstream', JSON.stringify(waterDownstream));
  }, [waterDownstream]);

  useEffect(() => {
    localStorage.setItem('waterUpstreamPercent', JSON.stringify(waterUpstreamPercent));
  }, [waterUpstreamPercent]);

  useEffect(() => {
    localStorage.setItem('waterDownstreamPercent', JSON.stringify(waterDownstreamPercent));
  }, [waterDownstreamPercent]);

  useEffect(() => {
    localStorage.setItem('snapToGrid', JSON.stringify(snapToGrid));
  }, [snapToGrid]);

  useEffect(() => {
    localStorage.setItem('drainage', JSON.stringify(drainage));
  }, [drainage]);

  useEffect(() => {
    localStorage.setItem('geometry', JSON.stringify(geometry));
  }, [geometry]);

  useEffect(() => {
    localStorage.setItem('showAnalysis', JSON.stringify(showAnalysis));
  }, [showAnalysis]);

  // Alerta de confirmación para evitar que el usuario pierda sus cálculos al cerrar/recargar la pestaña por accidente
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Botón de nuevo proyecto para vaciar y restablecer al origen
  const handleNewProject = () => {
    setShowResetConfirm(true);
  };

  const executeResetProject = () => {
    setGeometryConfirmed(false);
    setMaterials({
      gammaConcrete: 23,
      gammaWater: 10,
      frictionCoeff: 0.55,
      cohesion: 0,
      allowableBearing: 3000,
      allowableTension: 0,
      targetFOSOverturning: 1.5,
      targetFOSSliding: 1.5,
      damLength: 50,
      groutCurtainActive: false,
      groutCurtainEfficiency: 0.5,
      upliftAreaFactor: 1.0,
      soilResistanceBase: 0,
    });
    setWaterUpstream(25);
    setWaterDownstream(3);
    setWaterUpstreamPercent(83.3);
    setWaterDownstreamPercent(10.0);
    setSnapToGrid(true);
    setDrainage({
      active: false,
      locationFraction: 0.25,
      efficiency: 0.33,
    });
    const defaultGeom: DamGeometry = {
      mode: 'parametric',
      height: 30,
      crestWidth: 6,
      baseWidth: 26,
      upstreamSlope: 0,
      downstreamSlope: 0.67,
      points: generateParametricPoints(30, 6, 26, 0, 0.67, 0),
    };
    setGeometry(defaultGeom);
    setHistory([]);
    setRedoStack([]);
    setProjectKey(prev => prev + 1);
    setShowAnalysis(false);

    // Clear saved storage values to reset state entirely
    localStorage.clear();
    setShowResetConfirm(false);
  };

  // Push new state to history if different
  const commitGeometryWithHistory = (nextGeometry: DamGeometry, isDragMove: boolean = false) => {
    if (!isDragMove) {
      const isPointsDifferent = JSON.stringify(geometry.points) !== JSON.stringify(nextGeometry.points);
      const isModeDifferent = geometry.mode !== nextGeometry.mode;
      const isPropsDifferent = 
        geometry.height !== nextGeometry.height || 
        geometry.baseWidth !== nextGeometry.baseWidth || 
        geometry.crestWidth !== nextGeometry.crestWidth;

      if (isPointsDifferent || isModeDifferent || isPropsDifferent) {
        setHistory(prev => [...prev, geometry]);
        setRedoStack([]); // Clear redo stack on new action
      }
    }
    setGeometry(nextGeometry);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    const remaining = history.slice(0, -1);

    setHistory(remaining);
    setRedoStack(prev => [geometry, ...prev]);
    setGeometry(previous);
    setShowAnalysis(false);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    const remaining = redoStack.slice(1);

    setRedoStack(remaining);
    setHistory(prev => [...prev, geometry]);
    setGeometry(next);
    setShowAnalysis(false);
  };

  // Keyboard listener for Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keys when typing in input fields
      const activeEl = document.activeElement;
      if (
        activeEl && 
        (activeEl.tagName === 'INPUT' || 
         activeEl.tagName === 'TEXTAREA' || 
         activeEl.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      // Check for Ctrl+Z or Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      }
      // Check for Ctrl+Y or Cmd+Y
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }

      // Check for 'R' or 'r' to reset geometry to initial base standard shape
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const defaultGeom: DamGeometry = {
          mode: 'parametric',
          height: 30,
          crestWidth: 6,
          baseWidth: 26,
          upstreamSlope: 0,
          downstreamSlope: 0.67,
          points: generateParametricPoints(30, 6, 26, 0, 0.67, 0),
        };
        // Save current to history for undoability
        setHistory(prev => [...prev, geometry]);
        setRedoStack([]);
        setGeometry(defaultGeom);
        setProjectKey(prev => prev + 1);
        setShowAnalysis(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [geometry, history, redoStack]);

  // Automatically adjust water levels when dam's max height is updated (e.g. via height sliders or dragging)
  const maxHeight = geometry.points.reduce((max, p) => p.y > max ? p.y : max, 0);

  useEffect(() => {
    if (maxHeight > 0) {
      const computedUp = (waterUpstreamPercent / 100) * maxHeight;
      const computedDown = (waterDownstreamPercent / 100) * maxHeight;
      setWaterUpstream(parseFloat(Math.min(maxHeight * 1.05, computedUp).toFixed(2)));
      setWaterDownstream(parseFloat(Math.min(maxHeight * 0.9, computedDown).toFixed(2)));
    }
  }, [maxHeight, waterUpstreamPercent, waterDownstreamPercent]);

  // 2. Synchronization of geometry when state shifts
  // When we are in parametric mode and sliders change, we regenerate points
  const handleUpdateGeometry = (newGeometry: DamGeometry) => {
    setShowAnalysis(false);
    if (newGeometry.mode === 'parametric') {
      const generatedPoints = generateParametricPoints(
        newGeometry.height,
        newGeometry.crestWidth,
        newGeometry.baseWidth,
        newGeometry.upstreamSlope,
        newGeometry.downstreamSlope
      );
      commitGeometryWithHistory({
        ...newGeometry,
        points: generatedPoints,
      });
    } else {
      commitGeometryWithHistory(newGeometry);
    }
  };

  // When vertices are dragged directly on the canvas, we update them
  const handleCanvasPointsUpdate = (newPoints: Point2D[], forceFreeMode?: boolean, isDragMove?: boolean) => {
    setShowAnalysis(false);
    if (geometry.mode === 'parametric' && !forceFreeMode && newPoints.length === 4) {
      // In parametric mode, dragging nodes must back-calculate sliders
      // Heel is fixed at (0, 0), find points by their handle ID
      const heel = newPoints.find(p => p.id === 'heel') || { x: 0, y: 0 };
      const toe = newPoints.find(p => p.id === 'toe') || { x: 26, y: 0 };
      const crestLeft = newPoints.find(p => p.id === 'crest-left') || { x: 0, y: 30 };
      const crestRight = newPoints.find(p => p.id === 'crest-right') || { x: 6, y: 30 };

      const baseWidth = Math.max(2, toe.x - heel.x);
      const height = Math.max(1, crestLeft.y); // assume left and right crest have same height
      const upstreamSlope = Math.max(0, (crestLeft.x - heel.x) / height);
      const crestWidth = Math.max(0.5, crestRight.x - crestLeft.x);
      const downstreamSlope = Math.max(0, (toe.x - crestRight.x) / height);

      const updatedGeometry: DamGeometry = {
        mode: 'parametric',
        height,
        crestWidth,
        baseWidth,
        upstreamSlope,
        downstreamSlope,
        points: newPoints.map(p => {
          // ensure height is uniform for crest handles
          if (p.id === 'crest-left' || p.id === 'crest-right') {
            return { ...p, y: height };
          }
          return p;
        }),
      };
      commitGeometryWithHistory(updatedGeometry, isDragMove);
    } else {
      // In free-drawing mode, points are updated directly
      commitGeometryWithHistory({
        ...geometry,
        mode: 'free',
        points: newPoints,
      }, isDragMove);
    }
  };

  const handleUpdateWater = (upstream: number, downstream: number) => {
    setShowAnalysis(false);
    setWaterUpstream(upstream);
    setWaterDownstream(downstream);
    if (maxHeight > 0) {
      setWaterUpstreamPercent(parseFloat(((upstream / maxHeight) * 100).toFixed(1)));
      setWaterDownstreamPercent(parseFloat(((downstream / maxHeight) * 100).toFixed(1)));
    }
  };

  const handleUpdateMaterials = (newMats: MaterialProperties) => {
    setShowAnalysis(false);
    setMaterials(newMats);
  };

  const handleUpdateDrainage = (newDrain: DrainageGallery) => {
    setShowAnalysis(false);
    setDrainage(newDrain);
  };

  // 3. Applying standard presets
  const handleApplyPreset = (idx: number) => {
    if (!window.confirm("¿Está seguro de que desea aplicar esta plantilla predeterminada? Se perderán todas sus modificaciones de geometría y parámetros actuales.")) {
      return;
    }
    setShowAnalysis(false);
    const preset = DAM_PRESETS[idx];
    if (!preset) return;

    setWaterUpstream(preset.waterUpstream);
    setWaterDownstream(preset.waterDownstream);

    const presetGeom = preset.geometry;
    const height = presetGeom.height || 30;
    const crestWidth = presetGeom.crestWidth || 6;
    const baseWidth = presetGeom.baseWidth || 26;
    const upstreamSlope = presetGeom.upstreamSlope || 0;
    const downstreamSlope = presetGeom.downstreamSlope || 0.67;

    setGeometry({
      mode: 'parametric',
      height,
      crestWidth,
      baseWidth,
      upstreamSlope,
      downstreamSlope,
      points: generateParametricPoints(height, crestWidth, baseWidth, upstreamSlope, downstreamSlope, 0),
    });
  };

  // 4. Run Physics/Stability Calculations
  const results: StabilityResults = performStabilityAnalysis(
    geometry,
    materials,
    waterUpstream,
    waterDownstream,
    drainage,
    unitSystem
  );

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-6 text-white overflow-y-auto">
        {/* Decorative Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30"></div>
        
        <div className="relative max-w-3xl w-full flex flex-col items-center text-center space-y-8 z-10 my-auto">
          {/* Institutional Header */}
          <div className="space-y-3">
            <div className="flex justify-center gap-6 items-center">
              <img 
                src="https://upload.wikimedia.org/wikipedia/commons/9/92/Escudo_UNCP.png" 
                alt="Escudo UNCP" 
                className="h-16 w-auto object-contain drop-shadow-[0_0_15px_rgba(251,191,36,0.3)]"
                referrerPolicy="no-referrer"
              />
              <img 
                src="https://civil.uncp.edu.pe/wp-content/uploads/2025/06/logos-civil.png" 
                alt="Facultad de Ingeniería Civil" 
                className="h-16 w-auto object-contain bg-white/10 rounded-xl p-1.5 border border-white/20"
                referrerPolicy="no-referrer"
              />
            </div>
            <p className="text-amber-400 font-extrabold tracking-widest text-xs uppercase mt-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              Universidad Nacional del Centro del Perú
            </p>
            <p className="text-slate-300 font-bold tracking-wider text-xs uppercase">
              Facultad de Ingeniería Civil • Cátedra de Mecánica de Fluidos
            </p>
          </div>

          {/* Divider */}
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent"></div>

          {/* Project Title */}
          <div className="space-y-3">
            <h1 
              style={{ fontFamily: "'Cinzel', Georgia, serif" }}
              className="text-4xl sm:text-6xl font-black tracking-widest bg-clip-text text-transparent bg-gradient-to-b from-white via-slate-100 to-slate-400 drop-shadow-[0_2px_10px_rgba(255,255,255,0.15)]"
            >
              PRESAESTABLE
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm font-semibold tracking-widest uppercase max-w-xl mx-auto leading-relaxed">
              Software Especializado de Análisis Multicriterio de Estabilidad y Esfuerzos en Presas de Gravedad
            </p>
          </div>

          {/* Author Card */}
          <div className="bg-slate-900/90 border border-slate-800 p-4.5 rounded-2xl max-w-md w-full shadow-2xl backdrop-blur-md">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">AUTOR DEL SOFTWARE</div>
            <div className="text-slate-200 font-extrabold text-sm tracking-wide mt-1">Cristiam Yair Valerio Anaya</div>
            <div className="text-[10px] text-amber-500/80 font-mono mt-0.5">Facultad de Ingeniería Civil - UNCP</div>
          </div>

          {/* CTA Button */}
          <div className="pt-4">
            <button
              onClick={() => {
                setShowSplash(false);
              }}
              className="group relative px-8 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs tracking-widest uppercase rounded-xl shadow-[0_4px_20px_rgba(245,158,11,0.3)] hover:shadow-[0_4px_30px_rgba(245,158,11,0.5)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex items-center gap-2 mx-auto"
            >
              <span>Iniciar Nuevo Proyecto</span>
              <span className="text-sm group-hover:translate-x-1 transition-transform">→</span>
            </button>
            <p className="text-[10px] text-slate-500 mt-2.5 font-mono">
              Presione para acceder al entorno de diseño bidimensional
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="absolute bottom-4 text-[9px] text-slate-600 font-mono">
          PRESAESTABLE V1.2 • HUANCAYO, PERÚ • 2026
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* 1. Academic Institutional Header Banner */}
      <header className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b-2 border-amber-500 text-white px-6 py-5 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-xl">
        {/* Left Logo: Yellow and Green UNCP Crest */}
        <div className="flex items-center justify-center sm:justify-start w-full sm:w-1/4">
          <img 
            src="https://upload.wikimedia.org/wikipedia/commons/9/92/Escudo_UNCP.png" 
            alt="Escudo UNCP" 
            className="h-16 w-auto object-contain hover:scale-105 transition-transform duration-250 drop-shadow-[0_2px_8px_rgba(255,255,255,0.1)]"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Center: Course Title and Faculty Subtitle */}
        <div className="text-center flex-1 py-1 sm:py-0">
          <h1 
            style={{ fontFamily: "'Cinzel', Georgia, serif" }}
            className="font-extrabold text-2xl md:text-3xl tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-white to-amber-300 drop-shadow-md"
          >
            MECÁNICA DE FLUIDOS
          </h1>
          <p 
            style={{ fontFamily: "'Montserrat', sans-serif" }}
            className="text-xs md:text-sm text-slate-300 font-bold tracking-widest uppercase mt-2"
          >
            Facultad de Ingeniería Civil - UNCP
          </p>
        </div>

        {/* Right Logo: Red and White Faculty of Civil Engineering Crest */}
        <div className="flex items-center justify-center sm:justify-end w-full sm:w-1/4">
          <img 
            src="https://civil.uncp.edu.pe/wp-content/uploads/2025/06/logos-civil.png" 
            alt="Facultad de Ingeniería Civil" 
            className="h-16 w-auto object-contain hover:scale-105 transition-transform duration-250 bg-white/5 rounded-xl p-1.5 border border-white/10 drop-shadow-[0_2px_8px_rgba(255,255,255,0.1)]"
            referrerPolicy="no-referrer"
          />
        </div>
      </header>

      {/* 1.1 Utility Control & Quick Status Subheader */}
      <div className="bg-slate-800 border-b border-slate-700 text-white px-6 py-2.5 flex flex-wrap justify-between items-center gap-3 shadow-inner">
        <div className="flex items-center gap-2">
          <div className="bg-amber-500/10 p-1.5 rounded-lg text-amber-500 border border-amber-500/20">
            <Cpu className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <span className="font-bold text-xs tracking-wider uppercase text-slate-300">PRESAESTABLE</span>
            <span className="text-[10px] text-slate-500 font-mono ml-2 hidden sm:inline">• Análisis de Estabilidad de Presas</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleNewProject}
            className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs py-1.5 px-3.5 rounded-xl shadow-md hover:shadow-indigo-500/20 transition-all flex items-center gap-1.5 border border-indigo-500/30 cursor-pointer"
          >
            <span>📁 Crear nuevo proyecto</span>
          </button>

          {/* Live Quick Status in Header */}
          <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-bold uppercase tracking-wider shadow-sm transition-all ${
            results.passesAll
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${results.passesAll ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            <span>ESTADO: {results.passesAll ? 'ESTABLE (CUMPLE)' : 'INSUFICIENTE (FALLA)'}</span>
          </div>
        </div>
      </div>

      {/* Sistema de Unidades Selector */}
      <div className="max-w-[1780px] mx-auto w-full px-4 md:px-6 pt-5" id="unit-system-selector-banner">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📐</span>
            <div>
              <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">SISTEMA DE UNIDADES DEL PROYECTO</h2>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Afecta dimensiones, fuerzas, esfuerzos y todas las memorias de cálculo</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
            {(['SI', 'ST', 'US'] as UnitSystem[]).map((sys) => {
              const active = unitSystem === sys;
              const config = UNIT_CONFIGS[sys];
              return (
                <button
                  key={sys}
                  onClick={() => handleUnitSystemChange(sys)}
                  className={`flex-1 md:flex-initial text-left px-4 py-2 rounded-xl border transition-all cursor-pointer ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-md shadow-indigo-600/15'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-[9.5px] font-extrabold tracking-widest uppercase opacity-95">
                    {sys === 'SI' ? 'Sistema Internacional' : sys === 'ST' ? 'Sistema Técnico' : 'Sistema Inglés'}
                  </div>
                  <div className="text-[8.5px] font-mono mt-0.5 opacity-80">
                    Longitud: {config.length} | Carga: {config.force} | Esfuerzo: {config.stress}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Main Content Split Panel */}
      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-[1780px] mx-auto w-full">
        {/* Left Side: Interative Drafting Canvas & Real-time Force vector overlay (8 cols for maximum canvas space) */}
        <div className="lg:col-span-8 flex flex-col gap-4 h-[calc(100vh-120px)] lg:h-[calc(100vh-110px)] min-h-[680px]">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Sección Transversal Bidimensional</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Lienzo vectorial interactivo en metros o pies. Escala automática.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Undo / Redo Buttons */}
                <div className="flex border border-gray-200 rounded-lg p-0.5 bg-slate-50 gap-0.5">
                  <button
                    onClick={handleUndo}
                    disabled={history.length === 0}
                    title="Deshacer (Ctrl + Z)"
                    className="p-1.5 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                  >
                    <Undo className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={redoStack.length === 0}
                    title="Rehacer (Ctrl + Y)"
                    className="p-1.5 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                  >
                    <Redo className="w-3.5 h-3.5" />
                  </button>
                </div>

                <span className={`px-2 py-1.5 rounded text-[10px] font-bold ${
                  geometry.mode === 'parametric' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  Modo: {geometry.mode === 'parametric' ? 'Paramétrico' : 'Dibujo Libre'}
                </span>
              </div>
            </div>

            {/* Canvas Component */}
            <div className="flex-1 flex items-center justify-center">
              <DamCanvas
                key={projectKey}
                geometry={geometry}
                materials={materials}
                waterUpstream={waterUpstream}
                waterDownstream={waterDownstream}
                drainage={drainage}
                results={results}
                snapToGrid={snapToGrid}
                showAnalysis={showAnalysis}
                onUpdateGeometry={handleCanvasPointsUpdate}
                onUpdateWater={handleUpdateWater}
                unitSystem={unitSystem}
                upstreamSide={upstreamSide}
                onSetUpstreamSide={setUpstreamSide}
              />
            </div>
          </div>
        </div>

        {/* Right Side: Parameters & Results (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-5 h-[calc(100vh-120px)] lg:h-[calc(100vh-110px)] min-h-[680px] overflow-y-auto pr-1">
          <ControlPanel
            geometry={geometry}
            materials={materials}
            waterUpstream={waterUpstream}
            waterDownstream={waterDownstream}
            drainage={drainage}
            snapToGrid={snapToGrid}
            onUpdateGeometry={handleUpdateGeometry}
            onUpdateMaterials={handleUpdateMaterials}
            onUpdateWater={handleUpdateWater}
            onUpdateDrainage={handleUpdateDrainage}
            onSetSnapToGrid={setSnapToGrid}
            onApplyPreset={handleApplyPreset}
            unitSystem={unitSystem}
            geometryConfirmed={geometryConfirmed}
            onSetGeometryConfirmed={setGeometryConfirmed}
          />
          
          <ResultsPanel
            geometry={geometry}
            results={results}
            materials={materials}
            waterUpstream={waterUpstream}
            waterDownstream={waterDownstream}
            showAnalysis={showAnalysis}
            onRunAnalysis={() => setShowAnalysis(!showAnalysis)}
            unitSystem={unitSystem}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-3 text-center text-[10.5px] text-gray-400 font-medium">
        <span>PRESAESTABLE • Análisis de Estabilidad del Cuerpo Rígido • Concreto de Gravedad</span>
      </footer>

      {showResetConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4" id="reset-confirm-modal">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm">
                📁
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 text-sm">¿Crear Nuevo Proyecto?</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Esta acción eliminará de forma irreversible todas las modificaciones, vaciará el lienzo actual y restablecerá los parámetros de la presa al estado inicial estándar.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-3.5 py-1.5 border border-gray-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                id="btn-cancel-reset"
              >
                Cancelar
              </button>
              <button
                onClick={executeResetProject}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
                id="btn-confirm-reset"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

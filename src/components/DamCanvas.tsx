/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { Point2D, MaterialProperties, DrainageGallery, StabilityResults, DamGeometry } from '../types';
import { orientCCW } from '../utils/physics';
import { ZoomIn, ZoomOut, Maximize2, Ruler } from 'lucide-react';
import { UnitSystem, UNIT_CONFIGS } from '../utils/units';

interface DamCanvasProps {
  key?: number | string;
  geometry: DamGeometry;
  materials: MaterialProperties;
  waterUpstream: number;
  waterDownstream: number;
  drainage: DrainageGallery;
  results: StabilityResults;
  snapToGrid: boolean;
  showAnalysis: boolean;
  onUpdateGeometry: (points: Point2D[], forceFreeMode?: boolean, isDragMove?: boolean) => void;
  onUpdateWater: (upstream: number, downstream: number) => void;
  unitSystem: UnitSystem;
  upstreamSide: 'left' | 'right';
  onSetUpstreamSide: (side: 'left' | 'right') => void;
}

export default function DamCanvas({
  geometry,
  materials,
  waterUpstream,
  waterDownstream,
  drainage,
  results,
  snapToGrid,
  showAnalysis,
  onUpdateGeometry,
  onUpdateWater,
  unitSystem,
  upstreamSide,
  onSetUpstreamSide,
}: DamCanvasProps) {
  const u = UNIT_CONFIGS[unitSystem];
  const svgRef = useRef<SVGSVGElement>(null);
  const justDraggedRef = useRef<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  const [activeDrag, setActiveDrag] = useState<{
    type: 'vertex' | 'water-up' | 'water-down' | 'pan';
    id?: string;
  } | null>(null);

  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number; screenX: number; screenY: number } | null>(null);
  const [newVertexX, setNewVertexX] = useState<string>('');
  const [newVertexY, setNewVertexY] = useState<string>('');
  const [showInsertPanel, setShowInsertPanel] = useState<boolean>(false);
  const [userSnapSize, setUserSnapSize] = useState<number>(0.001);
  const [enableManualCoords, setEnableManualCoords] = useState<boolean>(false);
  const [relDist, setRelDist] = useState<string>('');
  const [relAngle, setRelAngle] = useState<string>('');

  // States for right-triangle polar move calculator
  const [useTrigCalcPolar, setUseTrigCalcPolar] = useState<boolean>(false);
  const [trigKnownTypePolar, setTrigKnownTypePolar] = useState<'h' | 'dx' | 'dy'>('dx');
  const [trigValuePolar, setTrigValuePolar] = useState<string>('5');

  useEffect(() => {
    if (useTrigCalcPolar) {
      const angleVal = parseFloat(relAngle);
      const val = parseFloat(trigValuePolar);
      if (!isNaN(angleVal) && !isNaN(val) && val > 0) {
        const angleRad = angleVal * (Math.PI / 180);
        let distance = 0;
        if (trigKnownTypePolar === 'h') {
          distance = val;
        } else if (trigKnownTypePolar === 'dx') {
          const absCos = Math.abs(Math.cos(angleRad));
          if (absCos > 0.0001) {
            distance = val / absCos;
          }
        } else if (trigKnownTypePolar === 'dy') {
          const absSin = Math.abs(Math.sin(angleRad));
          if (absSin > 0.0001) {
            distance = val / absSin;
          }
        }
        if (distance > 0) {
          setRelDist(distance.toFixed(3));
        }
      }
    }
  }, [useTrigCalcPolar, trigKnownTypePolar, trigValuePolar, relAngle]);

  const dragStartCoordRef = useRef<{ x: number; y: number } | null>(null);
  
  // Custom manual measurement tool and vector legend states
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<Point2D[]>([]);
  const [legendCollapsed, setLegendCollapsed] = useState<boolean>(false);
  const [activeSnapPoint, setActiveSnapPoint] = useState<{ x: number; y: number; type: string; label: string } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMeasuring(false);
        setMeasurePoints([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const netVerticalForce = results.netVerticalForce;

  // Find the currently dragged vertex (if any)
  const draggedVertex = activeDrag?.type === 'vertex' && activeDrag.id
    ? geometry.points.find(p => p.id === activeDrag.id)
    : null;

  const selectedPoint = geometry.points.find(p => p.id === selectedPointId);

  const handleManualInsertVertex = () => {
    const xVal = parseFloat(newVertexX);
    const yVal = parseFloat(newVertexY);
    if (isNaN(xVal) || isNaN(yVal)) {
      alert("Por favor introduce valores numéricos válidos.");
      return;
    }

    const newPoint: Point2D = {
      id: `free-${Date.now()}`,
      x: Math.max(0, xVal),
      y: Math.max(0, yVal),
      isHandle: true,
      handleType: 'free'
    };

    // Helper to calculate distance from point to segment
    const getDistanceToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
      let t = ((px - x1) * dx + (py - y1) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
    };

    let minDistance = Infinity;
    let insertIndex = geometry.points.length;

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
    onUpdateGeometry(updatedPoints, true);
    setNewVertexX('');
    setNewVertexY('');
    setSelectedPointId(newPoint.id);
  };

  // Find the coordinate limits to calculate scale
  let allXs = geometry.points.map(p => p.x);
  let allYs = geometry.points.map(p => p.y);
  
  const minX_dam = Math.min(0, ...allXs);
  const maxX_dam = Math.max(...allXs);
  const maxY_dam = Math.max(...allYs, waterUpstream, waterDownstream, 1);

  // Dynamic grid interval and snap size based on maximum dam dimension
  const maxDim = Math.max(maxX_dam - minX_dam, maxY_dam);
  let gridInterval = 5;
  let gridSnapSize = 1;
  if (maxDim <= 3) {
    gridInterval = 0.5;
    gridSnapSize = 0.1;
  } else if (maxDim <= 8) {
    gridInterval = 1;
    gridSnapSize = 0.2;
  } else if (maxDim <= 20) {
    gridInterval = 2;
    gridSnapSize = 0.5;
  } else if (maxDim <= 60) {
    gridInterval = 5;
    gridSnapSize = 1;
  } else {
    gridInterval = 10;
    gridSnapSize = 2;
  }

  const marginX = Math.max(0.5, (maxX_dam - minX_dam) * 0.22);
  const minX = minX_dam - marginX;
  const maxX = maxX_dam + marginX;

  const bottomMargin = Math.max(1.5, maxY_dam * 0.65);
  const topMargin = Math.max(0.3, maxY_dam * 0.15);
  const minY = -bottomMargin; // Extra room below for stresses and uplift
  const maxY = maxY_dam + topMargin;

  const worldWidth = maxX - minX;
  const worldHeight = maxY - minY;

  // Screen dimensions
  const viewWidth = 700;
  const viewHeight = 600; // Increased to 600 for generous vertical spacing

  // Scale factors
  const scaleX = viewWidth / worldWidth;
  const scaleY = viewHeight / worldHeight;
  const scale = Math.min(scaleX, scaleY) * 0.95; // Use uniform scale with margin

  const cx = viewWidth / 2;
  const cy = viewHeight / 2;

  // Translate world coordinates to SVG screen coordinates with zoom and pan
  const toScreenX = (x: number) => {
    const centerShift = (viewWidth - worldWidth * scale) / 2;
    const originalScreenX = centerShift + (x - minX) * scale;
    const sx = cx + (originalScreenX - cx) * zoom + pan.x;
    return upstreamSide === 'right' ? viewWidth - sx : sx;
  };

  const toScreenY = (y: number) => {
    // Invert Y axis for screen (0 is top, viewHeight is bottom)
    const centerShift = (viewHeight - worldHeight * scale) / 2;
    // Leave some space at the very bottom for stress diagrams
    const originalScreenY = viewHeight - centerShift - (y - minY) * scale - 20;
    return cy + (originalScreenY - cy) * zoom + pan.y;
  };

  // Translate screen coordinates to world coordinates (with inverse zoom and pan)
  const toWorldX = (screenX: number) => {
    const actualScreenX = upstreamSide === 'right' ? viewWidth - screenX : screenX;
    const originalScreenX = cx + (actualScreenX - cx - pan.x) / zoom;
    const centerShift = (viewWidth - worldWidth * scale) / 2;
    return minX + (originalScreenX - centerShift) / scale;
  };

  const toWorldY = (screenY: number) => {
    const originalScreenY = cy + (screenY - cy - pan.y) / zoom;
    const centerShift = (viewHeight - worldHeight * scale) / 2;
    return minY + (viewHeight - 20 - centerShift - originalScreenY) / scale;
  };

  // Grid lines generator
  const gridLines: number[] = [];
  const startGridX = Math.floor(minX / gridInterval) * gridInterval;
  const endGridX = Math.ceil(maxX / gridInterval) * gridInterval;
  const startGridY = Math.floor(minY / gridInterval) * gridInterval;
  const endGridY = Math.ceil(maxY / gridInterval) * gridInterval;

  const handlePointerDown = (
    e: React.PointerEvent,
    type: 'vertex' | 'water-up' | 'water-down' | 'pan',
    id?: string
  ) => {
    e.preventDefault();
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch (err) {}
    setActiveDrag({ type, id });
    justDraggedRef.current = false;

    if (type === 'vertex' && id) {
      setSelectedPointId(id);
      const v = geometry.points.find(p => p.id === id);
      if (v) {
        dragStartCoordRef.current = { x: v.x, y: v.y };
      }
    }

    if (type === 'pan') {
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const screenX = ((e.clientX - rect.left) / rect.width) * viewWidth;
    const screenY = ((e.clientY - rect.top) / rect.height) * viewHeight;
    
    let worldX = toWorldX(screenX);
    let worldY = toWorldY(screenY);

    // Dynamic Snapping logic for both hover and active drag (so dragging snaps exactly!)
    const snapCandidates: { x: number; y: number; type: 'vertex' | 'midpoint' | 'measure-A' | 'origin'; label: string }[] = [];
    
    // 1. All vertices (extreme points), except the one being dragged
    geometry.points.forEach(p => {
      if (activeDrag?.type === 'vertex' && activeDrag.id === p.id) {
        return; // Don't snap to itself during drag!
      }
      let label = 'Vértice';
      if (p.handleType === 'heel') label = 'Talón (Base Izq.)';
      else if (p.handleType === 'toe') label = 'Puntera (Base Der.)';
      else if (p.handleType === 'crest-left') label = 'Coronación Izq.';
      else if (p.handleType === 'crest-right') label = 'Coronación Der.';
      snapCandidates.push({ x: p.x, y: p.y, type: 'vertex', label });
    });

    // 2. Midpoints of the polygon segments (puntos medios)
    const sortedPoints = orientCCW(geometry.points);
    for (let i = 0; i < sortedPoints.length; i++) {
      const p1 = sortedPoints[i];
      const p2 = sortedPoints[(i + 1) % sortedPoints.length];
      
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      snapCandidates.push({ x: midX, y: midY, type: 'midpoint', label: 'Punto Medio' });
    }

    // 3. Origen (0,0)
    snapCandidates.push({ x: 0, y: 0, type: 'origin', label: 'Origen (0,0)' });

    // 4. Origen de medida A (if we already have 1 point)
    if (measurePoints.length === 1) {
      snapCandidates.push({ x: measurePoints[0].x, y: measurePoints[0].y, type: 'measure-A', label: 'Origen Medida A' });
    }

    let bestSnap: typeof snapCandidates[0] | null = null;
    let minSnapDist = Infinity;
    const snapThreshold = 18; // screen pixels for magnetic snapping

    snapCandidates.forEach(cand => {
      const candScreenX = toScreenX(cand.x);
      const candScreenY = toScreenY(cand.y);
      const d = Math.sqrt(Math.pow(screenX - candScreenX, 2) + Math.pow(screenY - candScreenY, 2));
      if (d < minSnapDist) {
        minSnapDist = d;
        bestSnap = cand;
      }
    });

    let snappedX = worldX;
    let snappedY = worldY;

    if (bestSnap && minSnapDist <= snapThreshold) {
      snappedX = bestSnap.x;
      snappedY = bestSnap.y;
      setActiveSnapPoint(bestSnap);
    } else {
      setActiveSnapPoint(null);
      // Fallback to grid snapping
      if (snapToGrid) {
        snappedX = Math.round(worldX / userSnapSize) * userSnapSize;
        snappedY = Math.round(worldY / userSnapSize) * userSnapSize;
      }
    }

    // Set high-precision hover coordinates (keeps crosshair perfectly aligned)
    setHoverCoords({
      x: Number(snappedX.toFixed(3)),
      y: Number(snappedY.toFixed(3)),
      screenX: toScreenX(snappedX),
      screenY: toScreenY(snappedY),
    });

    if (!activeDrag) return;
    
    // We are actively dragging
    justDraggedRef.current = true;

    if (activeDrag.type === 'pan') {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({ x: dx, y: dy });
      return;
    }
    
    if (activeDrag.type === 'vertex' && activeDrag.id) {
      const updatedPoints = geometry.points.map(p => {
        if (p.id === activeDrag.id) {
          // Keep heel and toe on the baseline (y = 0)
          if (p.handleType === 'heel' || p.handleType === 'toe') {
            return { ...p, x: snappedX, y: 0 };
          }
          // Limit heights and values to positive safe bounds
          return { ...p, x: Math.max(0, snappedX), y: Math.max(0.1, snappedY) };
        }
        return p;
      });
      onUpdateGeometry(updatedPoints, false, true);
    } else if (activeDrag.type === 'water-up') {
      const hMax = geometry.points.reduce((max, p) => p.y > max ? p.y : max, 0);
      const hUp = Math.max(0, Math.min(hMax * 1.5, snappedY));
      onUpdateWater(hUp, waterDownstream);
    } else if (activeDrag.type === 'water-down') {
      const hMax = geometry.points.reduce((max, p) => p.y > max ? p.y : max, 0);
      const hDown = Math.max(0, Math.min(hMax * 1.5, snappedY));
      onUpdateWater(waterUpstream, hDown);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDrag) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch (err) {
        // Safe fallback in case releasePointerCapture fails on some elements
      }
      // If we finished dragging a vertex, trigger a final update to commit the final location to history
      if (activeDrag.type === 'vertex') {
        onUpdateGeometry(geometry.points, false, false);
      }
      
      // Retain the just-dragged flag for a brief moment to swallow the subsequent click event
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 100);
      
      setActiveDrag(null);
      dragStartCoordRef.current = null;
    }
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement;
    // We initiate panning if clicked on the background SVG or grid lines or simple layout texts
    const isBackground = target.id === 'dam-design-canvas' || target.tagName === 'svg' || target.getAttribute('stroke') === '#e2e8f0' || target.tagName === 'text';
    if (isBackground) {
      handlePointerDown(e, 'pan');
    }
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * viewWidth;
    const mouseY = ((e.clientY - rect.top) / rect.height) * viewHeight;

    const zoomFactor = 1.12;
    const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    const clampedZoom = Math.max(0.15, Math.min(25, nextZoom));

    if (clampedZoom === zoom) return;

    const originalX = cx + (mouseX - cx - pan.x) / zoom;
    const originalY = cy + (mouseY - cy - pan.y) / zoom;

    const nextPanX = mouseX - cx - (originalX - cx) * clampedZoom;
    const nextPanY = mouseY - cy - (originalY - cy) * clampedZoom;

    setZoom(clampedZoom);
    setPan({ x: nextPanX, y: nextPanY });
  };

  // Add vertex in free draw mode (auto-transitions to free drawing)
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (activeDrag) return;
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    if (!svgRef.current) return;

    // Measurement tool click interceptor
    if (isMeasuring && hoverCoords) {
      const worldX = hoverCoords.x;
      const worldY = hoverCoords.y;

      const newPt: Point2D = {
        id: `measure-${Date.now()}`,
        x: worldX,
        y: worldY,
        isHandle: false,
        handleType: 'free'
      };

      if (measurePoints.length === 0 || measurePoints.length >= 2) {
        setMeasurePoints([newPt]);
      } else {
        setMeasurePoints([...measurePoints, newPt]);
      }
      return;
    }

    // Only allow clicking directly on the SVG background itself (id="dam-design-canvas") or a grid line to add a point
    // This prevents accidental vertex additions when clicking on the water, the dam, or labels
    const target = e.target as SVGElement;
    const isBackground = target.id === 'dam-design-canvas' || target.tagName === 'svg' || target.getAttribute('stroke') === '#e2e8f0';
    if (!isBackground) {
      return;
    }

    // Deselect if clicking on empty background
    setSelectedPointId(null);

    // Block point creation if the manual coordinates panel (+ Coordenadas) is not open
    if (!showInsertPanel) {
      return;
    }

    const rect = svgRef.current.getBoundingClientRect();
    const screenX = ((e.clientX - rect.left) / rect.width) * viewWidth;
    const screenY = ((e.clientY - rect.top) / rect.height) * viewHeight;
    
    let worldX = hoverCoords ? hoverCoords.x : toWorldX(screenX);
    let worldY = hoverCoords ? hoverCoords.y : toWorldY(screenY);

    if (!hoverCoords && snapToGrid) {
      worldX = Math.round(worldX / userSnapSize) * userSnapSize;
      worldY = Math.round(worldY / userSnapSize) * userSnapSize;
    }

    // Don't add if clicking close to an existing point
    const threshold = 1.5; // meters
    const tooClose = geometry.points.some(p => {
      const dist = Math.sqrt(Math.pow(p.x - worldX, 2) + Math.pow(p.y - worldY, 2));
      return dist < threshold;
    });

    if (tooClose) return;

    // Create a new point
    const newPoint: Point2D = {
      id: `free-${Date.now()}`,
      x: Math.max(0, worldX),
      y: Math.max(0.1, worldY),
      isHandle: true,
      handleType: 'free'
    };

    // Helper to calculate distance from point to segment
    const getDistanceToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
      let t = ((px - x1) * dx + (py - y1) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
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
    
    // Pass true to force switching to free drawing mode
    onUpdateGeometry(updatedPoints, true);
    
    // Select the newly added point
    setSelectedPointId(newPoint.id);
  };

  // Delete node and auto-transition to free drawing if not already
  const handleDeleteNode = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (geometry.points.length <= 3) {
      alert("La presa debe tener al menos 3 vértices para formar un polígono.");
      return;
    }
    const filtered = geometry.points.filter(p => p.id !== id);
    onUpdateGeometry(filtered, true);
  };

  // Closed dam polygon path string
  const sortedPoints = orientCCW(geometry.points);
  const damPathString = sortedPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toScreenX(p.x)} ${toScreenY(p.y)}`).join(' ') + ' Z';

  // Base segment line
  const screenHeelX = toScreenX(results.heelX);
  const screenToeX = toScreenX(results.toeX);
  const screenBaseY = toScreenY(0);

  // 1. EXTRACT THE UPPER PERIMETER OF THE DAM (excluding the bottom base segment)
  const heelIdx = sortedPoints.findIndex(p => p.handleType === 'heel' || (Math.abs(p.y) < 0.1 && Math.abs(p.x - results.heelX) < 0.1));
  const toeIdx = sortedPoints.findIndex(p => p.handleType === 'toe' || (Math.abs(p.y) < 0.1 && Math.abs(p.x - results.toeX) < 0.1));

  let upperPerimeter: Point2D[] = [];

  if (heelIdx !== -1 && toeIdx !== -1) {
    const path1: Point2D[] = [];
    let idx = heelIdx;
    while (idx !== toeIdx) {
      path1.push(sortedPoints[idx]);
      idx = (idx + 1) % sortedPoints.length;
    }
    path1.push(sortedPoints[toeIdx]);

    const path2: Point2D[] = [];
    idx = heelIdx;
    while (idx !== toeIdx) {
      path2.push(sortedPoints[idx]);
      idx = (idx - 1 + sortedPoints.length) % sortedPoints.length;
    }
    path2.push(sortedPoints[toeIdx]);

    const maxPath1Y = Math.max(...path1.map(p => p.y));
    const maxPath2Y = Math.max(...path2.map(p => p.y));

    if (maxPath1Y > maxPath2Y) {
      upperPerimeter = path1;
    } else {
      upperPerimeter = path2;
    }
  } else {
    upperPerimeter = sortedPoints;
  }

  // 2. COMPUTE CREST LEFT & RIGHT VERTEX INDICES FOR ROBUST SEGMENT CLASSIFICATION
  let highestY = -Infinity;
  upperPerimeter.forEach(p => { if (p.y > highestY) highestY = p.y; });
  
  // Find all indices of points in upperPerimeter that are at the crest level
  const crestIndices: number[] = [];
  upperPerimeter.forEach((p, idx) => {
    if (Math.abs(p.y - highestY) < 0.15) {
      crestIndices.push(idx);
    }
  });

  const firstCrestIdx = crestIndices.length > 0 ? Math.min(...crestIndices) : Math.floor(upperPerimeter.length / 3);
  const lastCrestIdx = crestIndices.length > 0 ? Math.max(...crestIndices) : Math.floor(2 * upperPerimeter.length / 3);

  // 3. GENERATE WET SEGMENTS LIST
  interface WetSegment {
    p1: Point2D;
    p2: Point2D;
  }

  const getWetSegmentsList = (waterL: number, isUpstream: boolean): WetSegment[] => {
    if (waterL <= 0 || upperPerimeter.length < 2) return [];
    const list: WetSegment[] = [];

    for (let i = 0; i < upperPerimeter.length - 1; i++) {
      const p1 = upperPerimeter[i];
      const p2 = upperPerimeter[i + 1];

      // Robust index-based classification
      const isSegUpstream = i < firstCrestIdx;
      const isSegDownstream = i >= lastCrestIdx;

      if (isUpstream && !isSegUpstream) continue;
      if (!isUpstream && !isSegDownstream) continue;

      const y1 = p1.y;
      const y2 = p2.y;

      if (y1 <= waterL && y2 <= waterL) {
        list.push({ p1, p2 });
      } else if (y1 < waterL && y2 > waterL) {
        const t = (waterL - y1) / (y2 - y1);
        const intersectX = p1.x + t * (p2.x - p1.x);
        list.push({
          p1,
          p2: { id: `wet-int-${i}`, x: intersectX, y: waterL }
        });
      } else if (y1 > waterL && y2 <= waterL) {
        const t = (waterL - y1) / (y2 - y1);
        const intersectX = p1.x + t * (p2.x - p1.x);
        list.push({
          p1: { id: `wet-int-${i}`, x: intersectX, y: waterL },
          p2
        });
      }
    }
    return list;
  };

  const wetUpstreamSegments = getWetSegmentsList(waterUpstream, true);
  const wetDownstreamSegments = getWetSegmentsList(waterDownstream, false);

  // 4. GENERATE WATER BODY SVG PATHS PRECISELY ADAPTED TO SLOPES
  let waterUpPath = '';
  if (wetUpstreamSegments.length > 0) {
    const startX = minX - 5;
    const heel: Point2D = { id: 'temp-heel', x: results.heelX, y: 0 };
    const pointsList: Point2D[] = [];
    pointsList.push(heel);
    
    wetUpstreamSegments.forEach(seg => {
      if (Math.abs(seg.p1.x - heel.x) > 1e-3 || Math.abs(seg.p1.y - heel.y) > 1e-3) {
        pointsList.push(seg.p1);
      }
      pointsList.push(seg.p2);
    });

    const wetTop = pointsList[pointsList.length - 1];

    waterUpPath = `
      M ${toScreenX(startX)} ${toScreenY(0)}
      ${pointsList.map(p => `L ${toScreenX(p.x)} ${toScreenY(p.y)}`).join(' ')}
      L ${toScreenX(startX)} ${toScreenY(wetTop.y)}
      Z
    `;
  }

  let waterDownPath = '';
  if (wetDownstreamSegments.length > 0) {
    const endX = maxX + 5;
    const toe: Point2D = { id: 'temp-toe', x: results.toeX, y: 0 };
    const pointsList: Point2D[] = [];
    
    wetDownstreamSegments.forEach(seg => {
      pointsList.push(seg.p1);
      pointsList.push(seg.p2);
    });
    pointsList.push(toe);

    const wetTop = pointsList[0];

    waterDownPath = `
      M ${toScreenX(wetTop.x)} ${toScreenY(wetTop.y)}
      ${pointsList.map(p => `L ${toScreenX(p.x)} ${toScreenY(p.y)}`).join(' ')}
      L ${toScreenX(endX)} ${toScreenY(0)}
      L ${toScreenX(endX)} ${toScreenY(wetTop.y)}
      Z
    `;
  }

  const handleApplyPolarMove = () => {
    if (!selectedPoint) return;
    const r = parseFloat(relDist);
    const theta = parseFloat(relAngle);
    if (isNaN(r) || isNaN(theta)) {
      alert("Por favor introduce valores numéricos válidos para distancia y ángulo.");
      return;
    }
    const rad = (theta * Math.PI) / 180;
    const dx = r * Math.cos(rad);
    const dy = r * Math.sin(rad);
    const nextX = selectedPoint.x + dx;
    const nextY = selectedPoint.y + dy;

    const updated = geometry.points.map(pt => {
      if (pt.id === selectedPoint.id) {
        if (pt.handleType === 'heel' || pt.handleType === 'toe') {
          return { ...pt, x: Math.max(0, nextX), y: 0 };
        }
        return { ...pt, x: Math.max(0, nextX), y: Math.max(0.1, nextY) };
      }
      return pt;
    });

    onUpdateGeometry(updated, false, false);
    setRelDist('');
    setRelAngle('');
  };

  return (
    <div className="relative w-full border border-gray-200 bg-slate-50 rounded-xl overflow-hidden shadow-inner select-none animate-fade-in">
      {/* PANEL FLOTANTE DE COORDENADAS PRECISAS */}
      {(selectedPoint || showInsertPanel) && (
        <div className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-md p-3 rounded-xl border border-gray-200 shadow-md w-[280px] sm:w-[310px] text-xs transition-all">
          
          {/* Checkbox selector explicitly enabling manual input as per requirements */}
          <div className="flex items-center gap-2 pb-1.5 mb-2 border-b border-gray-150">
            <input
              type="checkbox"
              id="allow-manual-coords"
              checked={enableManualCoords}
              onChange={(e) => setEnableManualCoords(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer accent-indigo-600"
            />
            <label htmlFor="allow-manual-coords" className="text-[10px] font-bold text-indigo-700 cursor-pointer select-none">
              🔓 Añadir más coordenadas (Entrada Manual)
            </label>
          </div>

          {!enableManualCoords && (
            <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded px-2 py-1 mb-2 text-[9px] font-semibold">
              🔒 Entrada numérica bloqueada. Activa "Añadir más coordenadas" arriba para habilitar.
            </div>
          )}

          {selectedPoint ? (
            // MODE 1: EDIT EXISTING NODE
            <div className="space-y-2">
              <div className="flex justify-between items-center border-b border-gray-150 pb-1.5">
                <span className="font-bold text-slate-800 flex items-center gap-1">
                  ✏️ Editar Vértice: <span className="text-indigo-600 font-mono text-[10px]">{selectedPoint.handleType === 'heel' ? 'Talón' : selectedPoint.handleType === 'toe' ? 'Puntera' : selectedPoint.handleType === 'crest-left' ? 'Corona Izq' : selectedPoint.handleType === 'crest-right' ? 'Corona Der' : 'Nodo Libre'}</span>
                </span>
                <button
                  onClick={() => setSelectedPointId(null)}
                  className="text-gray-400 hover:text-gray-600 font-bold px-1 rounded hover:bg-slate-100 transition-colors"
                  title="Cerrar edición"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">X (Distancia, m)</label>
                  <div className={`flex items-center gap-1 bg-slate-50 border border-gray-200 rounded px-1.5 py-0.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 ${!enableManualCoords ? 'opacity-50' : ''}`}>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!enableManualCoords}
                      value={parseFloat(selectedPoint.x.toFixed(3))}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          const updated = geometry.points.map(pt => pt.id === selectedPoint.id ? { ...pt, x: Math.max(0, val) } : pt);
                          onUpdateGeometry(updated, false, true);
                        }
                      }}
                      className="w-full bg-transparent font-mono text-[11px] font-bold text-slate-800 outline-none disabled:cursor-not-allowed"
                    />
                    <span className="text-[9px] text-gray-400">m</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Y (Altura, m)</label>
                  <div className={`flex items-center gap-1 bg-slate-50 border border-gray-200 rounded px-1.5 py-0.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 ${(!enableManualCoords || selectedPoint.handleType === 'heel' || selectedPoint.handleType === 'toe') ? 'opacity-50' : ''}`}>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!enableManualCoords || selectedPoint.handleType === 'heel' || selectedPoint.handleType === 'toe'}
                      value={parseFloat(selectedPoint.y.toFixed(3))}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          const updated = geometry.points.map(pt => pt.id === selectedPoint.id ? { ...pt, y: Math.max(0, val) } : pt);
                          onUpdateGeometry(updated, false, true);
                        }
                      }}
                      className="w-full bg-transparent font-mono text-[11px] font-bold text-slate-800 outline-none disabled:text-gray-400 disabled:cursor-not-allowed"
                    />
                    <span className="text-[9px] text-gray-400">m</span>
                  </div>
                </div>
              </div>

              {/* Dynamic AutoCAD Relative Polar Input */}
              <div className="mt-2.5 pt-2 border-t border-gray-150">
                <span className="font-bold text-slate-700 text-[10px] block mb-1">📐 Desplazamiento Polar (Precisión AutoCAD)</span>
                <div className="grid grid-cols-2 gap-2 mb-1.5">
                  <div>
                    <label className="text-[9px] font-semibold text-gray-500 block mb-0.5">Distancia (r, m)</label>
                    <div className={`flex items-center gap-1 bg-slate-50 border border-gray-200 rounded px-1.5 py-0.5 focus-within:border-indigo-500 ${!enableManualCoords ? 'opacity-50' : ''}`}>
                      <input
                        type="number"
                        step="0.1"
                        disabled={!enableManualCoords}
                        value={relDist}
                        onChange={(e) => setRelDist(e.target.value)}
                        placeholder="Ej. 5.0"
                        className="w-full bg-transparent font-mono text-[10px] text-slate-800 outline-none disabled:cursor-not-allowed"
                      />
                      <span className="text-[9px] text-gray-400">m</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-semibold text-gray-500 block mb-0.5">Ángulo (θ, °)</label>
                    <div className={`flex items-center gap-1 bg-slate-50 border border-gray-200 rounded px-1.5 py-0.5 focus-within:border-indigo-500 ${!enableManualCoords ? 'opacity-50' : ''}`}>
                      <input
                        type="number"
                        step="5"
                        disabled={!enableManualCoords}
                        value={relAngle}
                        onChange={(e) => setRelAngle(e.target.value)}
                        placeholder="Ej. 45"
                        className="w-full bg-transparent font-mono text-[10px] text-slate-800 outline-none disabled:cursor-not-allowed"
                      />
                      <span className="text-[9px] text-gray-400">°</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleApplyPolarMove}
                  disabled={!enableManualCoords || !relDist || !relAngle}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-[9px] py-1 px-1.5 rounded transition-colors disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer"
                >
                  Aplicar Desplazamiento Polar
                </button>
              </div>

              <div className="flex justify-between items-center pt-1 text-[9px] text-gray-400">
                <span>Ingresa valores con decimales.</span>
                {geometry.points.length > 3 && selectedPoint.handleType !== 'heel' && selectedPoint.handleType !== 'toe' && (
                  <button
                    onClick={() => {
                      const filtered = geometry.points.filter(pt => pt.id !== selectedPoint.id);
                      onUpdateGeometry(filtered, true);
                      setSelectedPointId(null);
                    }}
                    className="text-red-500 hover:text-red-700 hover:underline font-bold"
                  >
                    Eliminar vértice
                  </button>
                )}
              </div>
            </div>
          ) : (
            // MODE 2: INSERT NEW PRECISION NODE
            <div className="space-y-2">
              <div className="flex justify-between items-center border-b border-gray-150 pb-1.5">
                <span className="font-bold text-slate-800 flex items-center gap-1">
                  ➕ Insertar Vértice Preciso
                </span>
                <button
                  onClick={() => setShowInsertPanel(false)}
                  className="text-gray-400 hover:text-gray-600 font-bold px-1 rounded hover:bg-slate-100 transition-colors"
                  title="Cerrar panel"
                >
                  ✕
                </button>
              </div>
              <p className="text-[9.5px] text-gray-500 leading-tight">
                Introduce coordenadas X e Y para añadir un vértice de forma exacta en metros:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">X (Distancia, m)</label>
                  <div className={`flex items-center gap-1 bg-slate-50 border border-gray-200 rounded px-1.5 py-0.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 ${!enableManualCoords ? 'opacity-50' : ''}`}>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!enableManualCoords}
                      placeholder="Ej. 12.50"
                      value={newVertexX}
                      onChange={(e) => setNewVertexX(e.target.value)}
                      className="w-full bg-transparent font-mono text-[11px] text-slate-800 outline-none disabled:cursor-not-allowed"
                    />
                    <span className="text-[9px] text-gray-400">m</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 block mb-0.5">Y (Altura, m)</label>
                  <div className={`flex items-center gap-1 bg-slate-50 border border-gray-200 rounded px-1.5 py-0.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 ${!enableManualCoords ? 'opacity-50' : ''}`}>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!enableManualCoords}
                      placeholder="Ej. 8.35"
                      value={newVertexY}
                      onChange={(e) => setNewVertexY(e.target.value)}
                      className="w-full bg-transparent font-mono text-[11px] text-slate-800 outline-none disabled:cursor-not-allowed"
                    />
                    <span className="text-[9px] text-gray-400">m</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleManualInsertVertex}
                disabled={!enableManualCoords}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-[10px] py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
              >
                Insertar Nodo en Coordenadas
              </button>
            </div>
          )}
        </div>
      )}

      {!showAnalysis && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-indigo-600/90 text-white backdrop-blur px-4 py-2 rounded-xl shadow-lg border border-indigo-500/50 text-[11px] font-medium flex items-center gap-2 max-w-[90%] text-center animate-fade-in pointer-events-none">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <span>✍️ <strong>Modo de Diseño Activo:</strong> Arrastra nodos o haz clic para añadir. Haz clic en <strong>"Ejecutar Análisis"</strong> a la derecha para ver fuerzas y resultados.</span>
        </div>
      )}

      <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm text-xs font-mono text-gray-600 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-gray-500 font-bold uppercase">Aguas Arriba:</span>
          <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200">
            <button
              onClick={() => onSetUpstreamSide('left')}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-all ${
                upstreamSide === 'left' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Izquierda
            </button>
            <button
              onClick={() => onSetUpstreamSide('right')}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-all ${
                upstreamSide === 'right' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Derecha
            </button>
          </div>
        </div>
      </div>



      <div className="absolute top-3 right-3 z-10 flex gap-1.5 items-center">
        {/* Controles de Zoom */}
        <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur px-2.5 py-1 rounded-lg border border-gray-200 shadow-sm text-xs font-mono font-medium">
          <button
            onClick={() => {
              const nextZoom = Math.min(25, zoom * 1.25);
              setPan(p => ({ x: p.x * (nextZoom / zoom), y: p.y * (nextZoom / zoom) }));
              setZoom(nextZoom);
            }}
            className="p-1 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 transition-colors flex items-center justify-center cursor-pointer"
            title="Aumentar Zoom"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          
          <span className="min-w-[40px] text-center font-bold text-slate-700 text-[11px]">
            {Math.round(zoom * 100)}%
          </span>
          
          <button
            onClick={() => {
              const nextZoom = Math.max(0.15, zoom / 1.25);
              setPan(p => ({ x: p.x * (nextZoom / zoom), y: p.y * (nextZoom / zoom) }));
              setZoom(nextZoom);
            }}
            className="p-1 hover:bg-slate-100 rounded text-slate-700 hover:text-indigo-600 transition-colors flex items-center justify-center cursor-pointer"
            title="Disminuir Zoom"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-3.5 bg-gray-200 mx-0.5"></div>

          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded transition-colors flex items-center gap-1 cursor-pointer"
            title="Centrar vista y restablecer escala automática"
          >
            <Maximize2 className="w-2.5 h-2.5" />
            Centrar Vista
          </button>
        </div>

        {/* Botón de Medición Manual */}
        <button
          onClick={() => {
            setIsMeasuring(prev => !prev);
            setMeasurePoints([]);
          }}
          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
            isMeasuring 
              ? 'bg-amber-500 text-white border-amber-600 shadow-sm hover:bg-amber-600 animate-pulse' 
              : 'bg-white/95 hover:bg-slate-50 text-slate-700 border-gray-200 shadow-sm'
          }`}
          title="Herramienta de medición manual (Haz clic en dos puntos para medir)"
        >
          <Ruler className="w-3 h-3" />
          <span>{isMeasuring ? 'Medición Activa' : 'Medición Manual'}</span>
        </button>

        {/* Botón para abrir el panel de coordenadas manuales */}
        <button
          onClick={() => setShowInsertPanel(prev => !prev)}
          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            showInsertPanel 
              ? 'bg-indigo-600 text-white shadow-sm' 
              : 'bg-white/95 hover:bg-slate-50 text-slate-700 border border-gray-200 shadow-sm'
          }`}
          title="Insertar nuevo nodo ingresando coordenadas exactas en metros"
        >
          <span>➕ Coordenadas</span>
        </button>

        {/* Selector de precisión de Snap milimétrica/centimétrica/métrica */}
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur p-1 rounded-lg border border-gray-200 shadow-sm text-[10px]">
          <span className="px-1 text-gray-500 font-medium font-sans">Snap:</span>
          {[1.0, 0.1, 0.01, 0.001].map((sz) => (
            <button
              key={sz}
              onClick={() => {
                setUserSnapSize(sz);
              }}
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors font-bold cursor-pointer ${
                userSnapSize === sz && snapToGrid
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-slate-100'
              }`}
              title={`Ajustar cursor a pasos de ${sz * 1000} mm`}
            >
              {sz === 0.001 ? '1mm' : sz === 0.01 ? '1cm' : sz === 0.1 ? '10cm' : '1m'}
            </button>
          ))}
        </div>

        <span className="bg-white/95 backdrop-blur px-2 py-1.5 rounded-lg border border-gray-200 text-[10px] font-mono text-gray-500 shadow-sm">
          Retícula: {gridSnapSize}m {snapToGrid ? `⚡ Snap (${userSnapSize === 0.001 ? '1mm' : userSnapSize === 0.01 ? '1cm' : userSnapSize === 0.1 ? '10cm' : '1m'})` : ''}
        </span>
      </div>

      <svg
        ref={svgRef}
        id="dam-design-canvas"
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        className={`w-full h-auto cursor-${activeDrag?.type === 'pan' ? 'grabbing' : (hoverCoords ? 'none' : 'crosshair')} block`}
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHoverCoords(null)}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="concrete-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9ca3af" />
            <stop offset="60%" stopColor="#d1d5db" />
            <stop offset="100%" stopColor="#6b7280" />
          </linearGradient>
          <linearGradient id="water-up-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.75" />
          </linearGradient>
          <linearGradient id="water-down-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0d9488" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0f766e" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="uplift-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ea580c" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#c2410c" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="stress-comp-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#047857" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="stress-tens-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#b91c1c" stopOpacity="0.05" />
          </linearGradient>
          
          {/* Arrow markers */}
          <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
          <marker id="arrow-red" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
          </marker>
          <marker id="arrow-blue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
          </marker>
          <marker id="arrow-orange" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ea580c" />
          </marker>
        </defs>

        {/* 1. GRID LINES */}
        <g stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="1,4">
          {/* Vertical Grid Lines */}
          {Array.from({ length: Math.ceil((endGridX - startGridX) / gridInterval) + 1 }).map((_, i) => {
            const xVal = Number((startGridX + i * gridInterval).toFixed(2));
            const xPos = toScreenX(xVal);
            return (
              <g key={`v-grid-${xVal}`}>
                <line x1={xPos} y1={0} x2={xPos} y2={viewHeight} />
                <text x={xPos + 2} y={viewHeight - 5} fill="#94a3b8" fontSize="8" fontFamily="monospace">
                  {xVal}m
                </text>
              </g>
            );
          })}
          {/* Horizontal Grid Lines */}
          {Array.from({ length: Math.ceil((endGridY - startGridY) / gridInterval) + 1 }).map((_, i) => {
            const yVal = Number((startGridY + i * gridInterval).toFixed(2));
            if (yVal < 0) return null; // Keep it clean below the ground
            const yPos = toScreenY(yVal);
            return (
              <g key={`h-grid-${yVal}`}>
                <line x1={0} y1={yPos} x2={viewWidth} y2={yPos} />
                <text x={5} y={yPos - 2} fill="#94a3b8" fontSize="8" fontFamily="monospace">
                  {yVal}m
                </text>
              </g>
            );
          })}
        </g>

        {/* Ground Line */}
        <line
          x1={0}
          y1={screenBaseY}
          x2={viewWidth}
          y2={screenBaseY}
          stroke="#475569"
          strokeWidth="2.5"
        />

        {/* 2. WATER BODIES (Background) */}
        {waterUpstream > 0 && (
          <path
            d={waterUpPath}
            fill="url(#water-up-gradient)"
            stroke="#2563eb"
            strokeWidth="1.5"
            strokeDasharray="2,2"
          />
        )}
        {waterDownstream > 0 && (
          <path
            d={waterDownPath}
            fill="url(#water-down-gradient)"
            stroke="#0d9488"
            strokeWidth="1.5"
            strokeDasharray="2,2"
          />
        )}

        {/* HYDROSTATIC PRESSURE DIAGRAMS (ADAPTED TO SLOPES) */}
        {showAnalysis && (
          <g id="hydrostatic-pressure-diagrams" opacity="0.85">
            {(() => {
              const maxP = Math.max(1, waterUpstream * materials.gammaWater, waterDownstream * materials.gammaWater);
              const worldPressureScale = 8.0 / maxP; // Maps max pressure to 8 meters in world units

              const renderSegs = (segs: WetSegment[], isUpstream: boolean, color: string, fillGradient: string, waterL: number) => {
                return segs.map((seg, idx) => {
                  const { p1, p2 } = seg;
                  const dx = p2.x - p1.x;
                  const dy = p2.y - p1.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  if (len < 1e-3) return null;

                  // Inward normal
                  let nx = dy / len;
                  let ny = -dx / len;

                  if (isUpstream) {
                    if (nx < 0) { nx = -nx; ny = -ny; }
                  } else {
                    if (nx > 0) { nx = -nx; ny = -ny; }
                  }

                  const p1_press = Math.max(0, waterL - p1.y) * materials.gammaWater;
                  const p2_press = Math.max(0, waterL - p2.y) * materials.gammaWater;

                  const p1_outer = {
                    x: p1.x - nx * p1_press * worldPressureScale,
                    y: p1.y - ny * p1_press * worldPressureScale
                  };
                  const p2_outer = {
                    x: p2.x - nx * p2_press * worldPressureScale,
                    y: p2.y - ny * p2_press * worldPressureScale
                  };

                  const s1_x = toScreenX(p1.x);
                  const s1_y = toScreenY(p1.y);
                  const s2_x = toScreenX(p2.x);
                  const s2_y = toScreenY(p2.y);
                  const o1_x = toScreenX(p1_outer.x);
                  const o1_y = toScreenY(p1_outer.y);
                  const o2_x = toScreenX(p2_outer.x);
                  const o2_y = toScreenY(p2_outer.y);

                  const polyD = `M ${s1_x} ${s1_y} L ${o1_x} ${o1_y} L ${o2_x} ${o2_y} L ${s2_x} ${s2_y} Z`;

                  // Draw arrows pointing into the dam face
                  const numArrows = len > 4 ? 3 : (len > 1.5 ? 2 : 1);
                  const arrowFractions = numArrows === 3 ? [0.2, 0.5, 0.8] : (numArrows === 2 ? [0.3, 0.7] : [0.5]);

                  const arrows = arrowFractions.map((f, aIdx) => {
                    const cx = p1.x + f * dx;
                    const cy = p1.y + f * dy;
                    const cPress = Math.max(0, waterL - cy) * materials.gammaWater;
                    if (cPress < 0.1) return null;

                    const outer_x = cx - nx * cPress * worldPressureScale;
                    const outer_y = cy - ny * cPress * worldPressureScale;

                    return (
                      <line
                        key={`hydro-arrow-${isUpstream ? 'up' : 'down'}-${idx}-${aIdx}`}
                        x1={toScreenX(outer_x)}
                        y1={toScreenY(outer_y)}
                        x2={toScreenX(cx)}
                        y2={toScreenY(cy)}
                        stroke={color}
                        strokeWidth="1.8"
                        markerEnd="url(#arrow)"
                      />
                    );
                  });

                  return (
                    <g key={`hydro-seg-${isUpstream ? 'up' : 'down'}-${idx}`}>
                      {/* Shaded pressure region */}
                      <path d={polyD} fill={fillGradient} stroke={color} strokeWidth="1.8" strokeOpacity="0.9" />
                      
                      {/* Arrows */}
                      {arrows}

                      {/* Labels */}
                      {idx === 0 && p1_press > 1.0 && (
                        <g>
                          <text
                            x={o1_x + (isUpstream ? -10 : 10)}
                            y={o1_y + 3}
                            textAnchor={isUpstream ? 'end' : 'start'}
                            fill={color}
                            fontSize="9.5"
                            fontWeight="black"
                            stroke="#ffffff"
                            strokeWidth="3.5"
                            paintOrder="stroke"
                            strokeLinejoin="round"
                            className="font-mono"
                          >
                            {p1_press.toFixed(1)} kPa
                          </text>
                        </g>
                      )}
                      {idx === segs.length - 1 && p2_press > 1.0 && (
                        <g>
                          <text
                            x={o2_x + (isUpstream ? -10 : 10)}
                            y={o2_y + 3}
                            textAnchor={isUpstream ? 'end' : 'start'}
                            fill={color}
                            fontSize="9.5"
                            fontWeight="black"
                            stroke="#ffffff"
                            strokeWidth="3.5"
                            paintOrder="stroke"
                            strokeLinejoin="round"
                            className="font-mono"
                          >
                            {p2_press.toFixed(1)} kPa
                          </text>
                        </g>
                      )}
                    </g>
                  );
                });
              };

              return (
                <>
                  {wetUpstreamSegments.length > 0 && renderSegs(wetUpstreamSegments, true, '#2563eb', 'url(#water-up-gradient)', waterUpstream)}
                  {wetDownstreamSegments.length > 0 && renderSegs(wetDownstreamSegments, false, '#0d9488', 'url(#water-down-gradient)', waterDownstream)}
                </>
              );
            })()}
          </g>
        )}

        {/* 3. CONCRETE DAM BODY */}
        <path
          d={damPathString}
          fill="url(#concrete-gradient)"
          stroke="#374151"
          strokeWidth="2"
          filter="drop-shadow(0px 4px 6px rgba(0,0,0,0.1))"
        />

        {/* 3.1 GALERÍA DE INSPECCIÓN INTERNA (HUECO) */}
        {materials.galleryActive && 
         materials.galleryWidth && materials.galleryWidth > 0 && 
         materials.galleryHeight && materials.galleryHeight > 0 && (
          <g id="gallery-hueco-visual">
            <rect
              x={toScreenX(results.heelX + (materials.galleryX ?? (results.baseWidth * 0.2)))}
              y={toScreenY((materials.galleryY ?? 2.0) + materials.galleryHeight)}
              width={Math.abs(toScreenX(results.heelX + (materials.galleryX ?? (results.baseWidth * 0.2)) + materials.galleryWidth) - toScreenX(results.heelX + (materials.galleryX ?? (results.baseWidth * 0.2))))}
              height={Math.abs(toScreenY(materials.galleryY ?? 2.0) - toScreenY((materials.galleryY ?? 2.0) + materials.galleryHeight))}
              fill="#1e293b" // slate-800
              stroke="#e2e8f0" // slate-200 border
              strokeWidth="1.5"
              strokeDasharray="2,2"
              rx="2"
            />
            <text
              x={toScreenX(results.heelX + (materials.galleryX ?? (results.baseWidth * 0.2)) + materials.galleryWidth / 2)}
              y={toScreenY((materials.galleryY ?? 2.0) + materials.galleryHeight / 2) + 3}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="7.5"
              fontWeight="bold"
              className="font-sans pointer-events-none select-none"
            >
              G.I.
            </text>
          </g>
        )}

        {/* 4. SUBPRESIÓN (Uplift distribution block below the base) */}
        {showAnalysis && results.baseWidth > 0 && results.upliftProfile && results.upliftProfile.length > 0 && (
          <g>
            {/* Draw Uplift Piecewise Polygon under ground */}
            {(() => {
              // Find the maximum potential pressure based on the dam height to scale consistently
              const hMax = geometry.points.reduce((max, pt) => pt.y > max ? pt.y : max, 0);
              const refMaxPressure = Math.max(1, hMax * materials.gammaWater);
              const maxVisualOffset = 45; // Max height in pixels of the uplift diagram when full
              
              // Map profile points to screen coordinates
              const mappedPoints = results.upliftProfile.map(p => {
                const screenX = toScreenX(results.heelX + p.x);
                // Scale pressure consistently with height
                const visualPressureOffset = (p.pressure / refMaxPressure) * maxVisualOffset;
                const screenY = screenBaseY + 15 + visualPressureOffset; // offset to 15px below the dam base
                return {
                  ...p,
                  screenX,
                  screenY
                };
              });

              // Create SVG path starting flat at screenBaseY + 15
              const pathD = `
                M ${screenHeelX} ${screenBaseY + 15}
                ${mappedPoints.map(p => `L ${p.screenX} ${p.screenY}`).join(' ')}
                L ${screenToeX} ${screenBaseY + 15}
                Z
              `;

              return (
                <>
                  <path d={pathD} fill="url(#uplift-gradient)" stroke="#ea580c" strokeWidth="2.5" />
                  
                  {/* Upward acting force arrows at each profile point */}
                  <g stroke="#ea580c" strokeWidth="1.8" markerEnd="url(#arrow-orange)">
                    {mappedPoints.map((p, idx) => (
                      <line 
                        key={`uplift-arrow-${idx}`}
                        x1={p.screenX} 
                        y1={p.screenY} 
                        x2={p.screenX} 
                        y2={screenBaseY + 11} // arrow tip pointing to just below the dam base
                      />
                    ))}
                  </g>

                  {/* Labels for subpresión at each profile point */}
                  {mappedPoints.map((p, idx) => {
                    const isEnd = idx === 0 || idx === mappedPoints.length - 1;
                    const textAnchor = idx === 0 ? 'end' : (idx === mappedPoints.length - 1 ? 'start' : 'middle');
                    const textXOffset = idx === 0 ? -6 : (idx === mappedPoints.length - 1 ? 6 : 0);
                    // Shift middle labels down to avoid overlaps
                    const textYOffset = isEnd ? 14 : 26;
                    
                    return (
                      <g key={`uplift-lbl-${idx}`}>
                        {!isEnd && (
                          <line 
                            x1={p.screenX} 
                            y1={p.screenY} 
                            x2={p.screenX} 
                            y2={p.screenY + textYOffset - 8} 
                            stroke="#ea580c" 
                            strokeWidth="0.5" 
                            strokeDasharray="1,1" 
                          />
                        )}
                        <text 
                          x={p.screenX + textXOffset} 
                          y={p.screenY + textYOffset} 
                          textAnchor={textAnchor} 
                          fill="#c2410c" 
                          fontSize="10" 
                          fontWeight="black"
                          stroke="#ffffff"
                          strokeWidth="3.5"
                          paintOrder="stroke"
                          strokeLinejoin="round"
                        >
                          {p.pressure.toFixed(1)} kPa
                        </text>
                        <text 
                          x={p.screenX + textXOffset} 
                          y={p.screenY + textYOffset + 9} 
                          textAnchor={textAnchor} 
                          fill="#7c2d12" 
                          fontSize="8" 
                          fontWeight="bold"
                          stroke="#ffffff"
                          strokeWidth="2.5"
                          paintOrder="stroke"
                          strokeLinejoin="round"
                          className="font-mono"
                        >
                          {p.label}
                        </text>
                      </g>
                    );
                  })}

                  <text 
                    x={(screenHeelX + screenToeX) / 2} 
                    y={screenBaseY + 102} 
                    textAnchor="middle" 
                    fill="#c2410c" 
                    fontSize="10.5" 
                    fontWeight="black" 
                    stroke="#ffffff"
                    strokeWidth="3.5"
                    paintOrder="stroke"
                    strokeLinejoin="round"
                    className="italic uppercase tracking-wider"
                  >
                    Diagrama de Subpresión (100% expuesto)
                  </text>
                </>
              );
            })()}
          </g>
        )}

        {/* 5. DIAGRAMA DE ESFUERZOS EN LA BASE (Foundation Stresses - Bottom Section) - REMOVED PER USER REQUEST */}

        {/* 6. FORCE VECTORS (Overlay on top of dam) */}
        {showAnalysis && results.forces.map((f, i) => {
          // Proportionally scale arrows depending on magnitude
          const maxForce = Math.max(...results.forces.map(fo => Math.abs(fo.fx) + Math.abs(fo.fy)));
          const forceLength = 15 + (Math.abs(f.fx || f.fy) / maxForce) * 45;

          const startX = toScreenX(f.mx);
          const startY = toScreenY(f.my);
          
          let endX = startX;
          let endY = startY;

          let textAnchor = 'middle';
          let dx = 0;
          let dy = 0;

          if (f.fx !== 0) {
            // Horizontal force
            endX = startX + (f.fx > 0 ? forceLength : -forceLength);
            textAnchor = f.fx > 0 ? 'end' : 'start';
            dy = -6;
            dx = f.fx > 0 ? -10 : 10;
          } else if (f.fy !== 0) {
            // Vertical force
            endY = startY + (f.fy > 0 ? forceLength : -forceLength);
            
            // Avoid vertical clutter: shift labels horizontally
            if (f.name.includes('Subpresión') || f.name.includes('Uplift')) {
              dx = 18; // shift to the right
              textAnchor = 'start';
              dy = -15; // slightly higher than base line
            } else if (f.name.includes('Peso Propio')) {
              dx = -18; // shift to the left
              textAnchor = 'end';
              dy = 4;
            } else if (f.name.includes('Aguas Arriba')) {
              dx = -18; // shift left
              textAnchor = 'end';
              dy = 4;
            } else if (f.name.includes('Aguas Abajo')) {
              dx = 18; // shift right
              textAnchor = 'start';
              dy = 4;
            } else {
              dy = f.fy > 0 ? -8 : 12;
            }
          }

          // Don't clutter if force is tiny
          if (Math.abs(f.fx || f.fy) < 2) return null;

          return (
            <g key={`force-${i}-${f.name}`}>
              {/* Force Arrow */}
              <line
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={f.color}
                strokeWidth="2.5"
                markerEnd="url(#arrow)"
              />
              {/* Force Label */}
              <text
                x={(startX + endX) / 2 + dx}
                y={(startY + endY) / 2 + dy}
                fill={f.color}
                fontSize="10"
                fontWeight="black"
                textAnchor={textAnchor}
                stroke="#ffffff"
                strokeWidth="3.5"
                paintOrder="stroke"
                strokeLinejoin="round"
              >
                {f.name.split(' ')[0]}: {Math.abs(f.fx || f.fy).toFixed(0)} kN
              </text>
            </g>
          );
        })}

        {/* 7. INTERACTIVE WATER CONTROL HANDLES */}
        {/* Upstream water level slider handle */}
        <g className="group cursor-ns-resize">
          <line
            x1={toScreenX(minX - 5)}
            y1={toScreenY(waterUpstream)}
            x2={screenHeelX}
            y2={toScreenY(waterUpstream)}
            stroke="#2563eb"
            strokeWidth="3"
            opacity="0.8"
          />
          <circle
            cx={toScreenX(minX - 3)}
            cy={toScreenY(waterUpstream)}
            r="7"
            fill="#2563eb"
            stroke="#ffffff"
            strokeWidth="2"
            className="transition-transform group-hover:scale-125 cursor-ns-resize"
            onPointerDown={(e) => handlePointerDown(e, 'water-up')}
          />
          <text
            x={toScreenX(minX - 3)}
            y={toScreenY(waterUpstream) - 10}
            textAnchor="middle"
            fill="#1d4ed8"
            fontSize="10"
            fontWeight="black"
            stroke="#ffffff"
            strokeWidth="3.5"
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            hu = {waterUpstream.toFixed(1)}m
          </text>
        </g>

        {/* Downstream water level slider handle */}
        <g className="group cursor-ns-resize">
          <line
            x1={screenToeX}
            y1={toScreenY(waterDownstream)}
            x2={toScreenX(maxX + 5)}
            y2={toScreenY(waterDownstream)}
            stroke="#0d9488"
            strokeWidth="3"
            opacity="0.8"
          />
          <circle
            cx={toScreenX(maxX + 3)}
            cy={toScreenY(waterDownstream)}
            r="7"
            fill="#0d9488"
            stroke="#ffffff"
            strokeWidth="2"
            className="transition-transform group-hover:scale-125 cursor-ns-resize"
            onPointerDown={(e) => handlePointerDown(e, 'water-down')}
          />
          <text
            x={toScreenX(maxX + 3)}
            y={toScreenY(waterDownstream) - 10}
            textAnchor="middle"
            fill="#0f766e"
            fontSize="10"
            fontWeight="black"
            stroke="#ffffff"
            strokeWidth="3.5"
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            hd = {waterDownstream.toFixed(1)}m
          </text>
        </g>

        {/* Centroid indicator of the dam */}
        <g>
          <circle cx={toScreenX(results.centroid.x)} cy={toScreenY(results.centroid.y)} r="5" fill="#374151" stroke="#ffffff" strokeWidth="1.5" />
          <circle cx={toScreenX(results.centroid.x)} cy={toScreenY(results.centroid.y)} r="1" fill="#ffffff" />
          <text 
            x={toScreenX(results.centroid.x) + 8} 
            y={toScreenY(results.centroid.y) + 3} 
            fill="#374151" 
            fontSize="9" 
            fontWeight="black"
            stroke="#ffffff"
            strokeWidth="3.5"
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            C.G. ({results.centroid.x.toFixed(1)}, {results.centroid.y.toFixed(1)})
          </text>
        </g>

        {/* 8. INTERACTIVE GEOMETRY VERTEX HANDLES */}
        {geometry.points.map((p) => {
          const isSelected = activeDrag?.type === 'vertex' && activeDrag.id === p.id;
          
          let labelText = '';
          if (p.handleType === 'heel') labelText = `Talón (x: ${p.x.toFixed(3)}, y: ${p.y.toFixed(3)})`;
          else if (p.handleType === 'toe') labelText = `Puntera (x: ${p.x.toFixed(3)}, y: ${p.y.toFixed(3)})`;
          else if (p.handleType === 'crest-left') labelText = `Coronamiento Izq. (x: ${p.x.toFixed(3)}, y: ${p.y.toFixed(3)})`;
          else if (p.handleType === 'crest-right') labelText = `Coronamiento Der. (x: ${p.x.toFixed(3)}, y: ${p.y.toFixed(3)})`;
          else labelText = `Nodo (x: ${p.x.toFixed(3)}, y: ${p.y.toFixed(3)})`;

          // Dynamic tooltip rectangle width based on label text length
          const charCount = labelText.length;
          const rectWidth = charCount * 5.2 + 10;

          return (
            <g key={`handle-${p.id}`} className="group cursor-move">
              <circle
                cx={toScreenX(p.x)}
                cy={toScreenY(p.y)}
                r={isSelected ? "9" : "7"}
                fill={p.handleType === 'heel' || p.handleType === 'toe' ? "#1e293b" : "#4f46e5"}
                stroke="#ffffff"
                strokeWidth="2.5"
                className="transition-all group-hover:r-9 shadow group-hover:fill-indigo-600"
                onPointerDown={(e) => handlePointerDown(e, 'vertex', p.id)}
              />
              
              {/* Tooltip text with a background rect to make it 100% readable */}
              <g
                className={`pointer-events-none transition-opacity duration-150 ${
                  isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <rect
                  x={toScreenX(p.x) - rectWidth / 2}
                  y={toScreenY(p.y) - 24}
                  width={rectWidth}
                  height="15"
                  rx="3.5"
                  fill="#1e1b4b"
                  stroke="#4f46e5"
                  strokeWidth="0.5"
                  opacity="0.95"
                />
                <text
                  x={toScreenX(p.x)}
                  y={toScreenY(p.y) - 13}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="8.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {labelText}
                </text>
              </g>
              
              {/* Delete button overlay for any custom or intermediate vertices (except heel and toe base boundaries) */}
              {p.handleType !== 'heel' && p.handleType !== 'toe' && (
                <foreignObject
                  x={toScreenX(p.x) - 18}
                  y={toScreenY(p.y) + 8}
                  width="36"
                  height="16"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <button
                    onClick={(e) => handleDeleteNode(p.id, e)}
                    className="w-full bg-red-500 hover:bg-red-600 text-[8px] text-white font-bold py-0.5 px-1 rounded shadow cursor-pointer text-center leading-none"
                    style={{ fontSize: '7.5px' }}
                  >
                    Quitar
                  </button>
                </foreignObject>
              )}
            </g>
          );
        })}

        {/* 9. REAL-TIME ENGINEERING DRAG HUD */}
        {draggedVertex && (
          <g id="dragging-hud" className="pointer-events-none">
            {/* Horizontal projection line */}
            <line
              x1={toScreenX(minX - 5)}
              y1={toScreenY(draggedVertex.y)}
              x2={toScreenX(draggedVertex.x)}
              y2={toScreenY(draggedVertex.y)}
              stroke="#4f46e5"
              strokeWidth="1.5"
              strokeDasharray="4,4"
              opacity="0.85"
            />
            {/* Vertical projection line to ground (y=0) */}
            <line
              x1={toScreenX(draggedVertex.x)}
              y1={toScreenY(0)}
              x2={toScreenX(draggedVertex.x)}
              y2={toScreenY(draggedVertex.y)}
              stroke="#4f46e5"
              strokeWidth="1.5"
              strokeDasharray="4,4"
              opacity="0.85"
            />
            
            {/* Horizontal dimension tag (Height H on left axis) */}
            <rect
              x={toScreenX(minX - 5) + 5}
              y={toScreenY(draggedVertex.y) - 10}
              width="62"
              height="18"
              rx="4"
              fill="#4f46e5"
              filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.15))"
            />
            <text
              x={toScreenX(minX - 5) + 36}
              y={toScreenY(draggedVertex.y) + 2}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="9"
              fontWeight="bold"
              fontFamily="monospace"
            >
              H = {draggedVertex.y.toFixed(3)}m
            </text>

            {/* Vertical dimension tag (Distance X on horizontal ground) */}
            <rect
              x={toScreenX(draggedVertex.x) - 31}
              y={toScreenY(0) + 5}
              width="62"
              height="18"
              rx="4"
              fill="#4f46e5"
              filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.15))"
            />
            <text
              x={toScreenX(draggedVertex.x)}
              y={toScreenY(0) + 17}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="9"
              fontWeight="bold"
              fontFamily="monospace"
            >
              X = {draggedVertex.x.toFixed(3)}m
            </text>

            {/* High-visibility primary elevation badge floating directly over the dragged vertex */}
            <g transform={`translate(${toScreenX(draggedVertex.x)}, ${toScreenY(draggedVertex.y) - 30})`}>
              <rect
                x="-60"
                y="-24"
                width="120"
                height="28"
                rx="6"
                fill="#1e1b4b"
                stroke="#6366f1"
                strokeWidth="2"
                filter="drop-shadow(0px 4px 8px rgba(0,0,0,0.25))"
              />
              {/* Mini tag header */}
              <text
                x="0"
                y="-15"
                textAnchor="middle"
                fill="#a5b4fc"
                fontSize="7.5"
                fontWeight="bold"
                className="uppercase tracking-wider"
              >
                Altura de Vértice
              </text>
              <text
                x="0"
                y="-3"
                textAnchor="middle"
                fill="#f8fafc"
                fontSize="11"
                fontWeight="bold"
              >
                H = <tspan fill="#38bdf8" fontWeight="black">{draggedVertex.y.toFixed(3)} m</tspan>
              </text>
            </g>
          </g>
        )}

        {/* Real-time Hover Coordinates Crosshairs and Badge */}
        {hoverCoords && (
          <g className="pointer-events-none">
            {/* Horizontal dashed guide */}
            <line
              x1={0}
              y1={hoverCoords.screenY}
              x2={viewWidth}
              y2={hoverCoords.screenY}
              stroke={activeSnapPoint ? "#f59e0b" : "#6366f1"}
              strokeWidth="0.75"
              strokeDasharray="2,3"
              opacity={activeSnapPoint ? "0.6" : "0.4"}
            />
            {/* Vertical dashed guide */}
            <line
              x1={hoverCoords.screenX}
              y1={0}
              x2={hoverCoords.screenX}
              y2={viewHeight}
              stroke={activeSnapPoint ? "#f59e0b" : "#6366f1"}
              strokeWidth="0.75"
              strokeDasharray="2,3"
              opacity={activeSnapPoint ? "0.6" : "0.4"}
            />

            {/* Custom High-Precision Crosshair Cursor */}
            {activeSnapPoint ? (
              <g stroke="#f59e0b" strokeWidth="1.5" fill="none">
                {/* Visual snap shape depending on type */}
                {activeSnapPoint.type === 'vertex' && (
                  // Square for Endpoint / Vertex
                  <rect
                    x={hoverCoords.screenX - 5}
                    y={hoverCoords.screenY - 5}
                    width="10"
                    height="10"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    fill="rgba(245, 158, 11, 0.15)"
                  />
                )}
                {activeSnapPoint.type === 'midpoint' && (
                  // Triangle for Midpoint (AutoCAD style)
                  <polygon
                    points={`${hoverCoords.screenX},${hoverCoords.screenY - 6} ${hoverCoords.screenX - 6},${hoverCoords.screenY + 4} ${hoverCoords.screenX + 6},${hoverCoords.screenY + 4}`}
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    fill="rgba(245, 158, 11, 0.15)"
                  />
                )}
                {activeSnapPoint.type === 'origin' && (
                  // Diamond for Origin
                  <polygon
                    points={`${hoverCoords.screenX},${hoverCoords.screenY - 6} ${hoverCoords.screenX + 6},${hoverCoords.screenY} ${hoverCoords.screenX},${hoverCoords.screenY + 6} ${hoverCoords.screenX - 6},${hoverCoords.screenY}`}
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    fill="rgba(245, 158, 11, 0.15)"
                  />
                )}
                {activeSnapPoint.type === 'measure-A' && (
                  // Circle with inner cross for Measurement A
                  <g>
                    <circle cx={hoverCoords.screenX} cy={hoverCoords.screenY} r="6" stroke="#f59e0b" strokeWidth="1.5" fill="rgba(245, 158, 11, 0.15)" />
                    <line x1={hoverCoords.screenX - 8} y1={hoverCoords.screenY} x2={hoverCoords.screenX + 8} y2={hoverCoords.screenY} stroke="#f59e0b" strokeWidth="1" />
                    <line x1={hoverCoords.screenX} y1={hoverCoords.screenY - 8} x2={hoverCoords.screenX} y2={hoverCoords.screenY + 8} stroke="#f59e0b" strokeWidth="1" />
                  </g>
                )}
                
                {/* Mini center point and cross */}
                <circle cx={hoverCoords.screenX} cy={hoverCoords.screenY} r="1.5" fill="#f59e0b" stroke="none" />
                <line x1={hoverCoords.screenX - 12} y1={hoverCoords.screenY} x2={hoverCoords.screenX + 12} y2={hoverCoords.screenY} stroke="#f59e0b" strokeWidth="0.8" />
                <line x1={hoverCoords.screenX} y1={hoverCoords.screenY - 12} x2={hoverCoords.screenX} y2={hoverCoords.screenY + 12} stroke="#f59e0b" strokeWidth="0.8" />
              </g>
            ) : (
              // Normal Grid/Free Crosshair cursor (Blue)
              <g stroke="#4f46e5" strokeWidth="1.2" fill="none">
                <circle cx={hoverCoords.screenX} cy={hoverCoords.screenY} r="4" stroke="#4f46e5" strokeWidth="1" />
                <circle cx={hoverCoords.screenX} cy={hoverCoords.screenY} r="1" fill="#4f46e5" stroke="none" />
                <line x1={hoverCoords.screenX - 10} y1={hoverCoords.screenY} x2={hoverCoords.screenX + 10} y2={hoverCoords.screenY} />
                <line x1={hoverCoords.screenX} y1={hoverCoords.screenY - 10} x2={hoverCoords.screenX} y2={hoverCoords.screenY + 10} />
              </g>
            )}

            {/* Hover tooltip text box */}
            {(() => {
              const snapLabel = activeSnapPoint ? `🧲 [${activeSnapPoint.label}] ` : '';
              const labelText = `${snapLabel}X: ${hoverCoords.x.toFixed(3)}m, Y: ${hoverCoords.y.toFixed(3)}m`;
              const charCount = labelText.length;
              const rectWidth = charCount * 5.2 + 12;
              
              let tx = hoverCoords.screenX + 12;
              let ty = hoverCoords.screenY - 12;
              if (tx + rectWidth > viewWidth - 10) {
                tx = hoverCoords.screenX - rectWidth - 12;
              }
              if (ty < 20) {
                ty = hoverCoords.screenY + 18;
              }

              return (
                <g>
                  <rect
                    x={tx}
                    y={ty - 11}
                    width={rectWidth}
                    height="15"
                    rx="4"
                    fill={activeSnapPoint ? "#d97706" : "#4f46e5"}
                    opacity="0.95"
                    stroke="#ffffff"
                    strokeWidth="0.75"
                  />
                  <text
                    x={tx + rectWidth / 2}
                    y={ty}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="8"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {labelText}
                  </text>
                </g>
              );
            })()}

            {/* AutoCAD Style Dynamic displacement HUD */}
            {(() => {
              if (activeDrag?.type === 'vertex' && dragStartCoordRef.current) {
                const start = dragStartCoordRef.current;
                const dx = hoverCoords.x - start.x;
                const dy = hoverCoords.y - start.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                if (angle < 0) angle += 360;
                
                let tx = hoverCoords.screenX + 20;
                let ty = hoverCoords.screenY + 25;
                if (tx + 125 > viewWidth - 10) {
                  tx = hoverCoords.screenX - 125 - 20;
                }
                if (ty + 34 > viewHeight - 10) {
                  ty = hoverCoords.screenY - 34 - 25;
                }

                return (
                  <g transform={`translate(${tx}, ${ty})`}>
                    <rect
                      x="0"
                      y="0"
                      width="125"
                      height="34"
                      rx="6"
                      fill="#0f172a"
                      opacity="0.95"
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                    />
                    <text x="8" y="13" fill="#94a3b8" fontSize="8" fontWeight="bold">DIST. REAL:</text>
                    <text x="8" y="25" fill="#38bdf8" fontSize="10" fontWeight="bold" fontFamily="monospace">
                      {dist.toFixed(2)}m
                    </text>
                    <text x="75" y="13" fill="#94a3b8" fontSize="8" fontWeight="bold">ANGULO:</text>
                    <text x="75" y="25" fill="#f59e0b" fontSize="10" fontWeight="bold" fontFamily="monospace">
                      {angle.toFixed(1)}°
                    </text>
                  </g>
                );
              }
              return null;
            })()}
          </g>
        )}

        {/* MANUAL MEASUREMENT GRAPHICS LAYER */}
        {isMeasuring && (
          <g id="measurement-layer" className="pointer-events-none">
            {/* Draw first point */}
            {measurePoints.length >= 1 && (() => {
              const p1ScreenX = toScreenX(measurePoints[0].x);
              const p1ScreenY = toScreenY(measurePoints[0].y);
              return (
                <g>
                  {/* Outer glowing pulse */}
                  <circle
                    cx={p1ScreenX}
                    cy={p1ScreenY}
                    r="8"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    opacity="0.6"
                    className="animate-ping"
                  />
                  {/* Crosshair circle */}
                  <circle
                    cx={p1ScreenX}
                    cy={p1ScreenY}
                    r="5"
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                  {/* Crosshair lines */}
                  <line x1={p1ScreenX - 8} y1={p1ScreenY} x2={p1ScreenX + 8} y2={p1ScreenY} stroke="#ffffff" strokeWidth="1" />
                  <line x1={p1ScreenX} y1={p1ScreenY - 8} x2={p1ScreenX} y2={p1ScreenY + 8} stroke="#ffffff" strokeWidth="1" />
                  
                  {/* Small Label 'A' */}
                  <rect
                    x={p1ScreenX + 8}
                    y={p1ScreenY - 18}
                    width="12"
                    height="12"
                    rx="2"
                    fill="#f59e0b"
                  />
                  <text
                    x={p1ScreenX + 14}
                    y={p1ScreenY - 9}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="8"
                    fontWeight="bold"
                  >
                    A
                  </text>
                </g>
              );
            })()}

            {/* Draw live line to cursor or solid line to second point */}
            {measurePoints.length === 1 && hoverCoords && (() => {
              const p1ScreenX = toScreenX(measurePoints[0].x);
              const p1ScreenY = toScreenY(measurePoints[0].y);
              const p2ScreenX = hoverCoords.screenX;
              const p2ScreenY = hoverCoords.screenY;

              const dist = Math.sqrt(Math.pow(hoverCoords.x - measurePoints[0].x, 2) + Math.pow(hoverCoords.y - measurePoints[0].y, 2));
              const dx = Math.abs(hoverCoords.x - measurePoints[0].x);
              const dy = Math.abs(hoverCoords.y - measurePoints[0].y);

              const midX = (p1ScreenX + p2ScreenX) / 2;
              const midY = (p1ScreenY + p2ScreenY) / 2;

              return (
                <g>
                  {/* Dashed orange connection line */}
                  <line
                    x1={p1ScreenX}
                    y1={p1ScreenY}
                    x2={p2ScreenX}
                    y2={p2ScreenY}
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeDasharray="4,4"
                  />

                  {/* Dot under mouse cursor */}
                  <circle
                    cx={p2ScreenX}
                    cy={p2ScreenY}
                    r="4"
                    fill="#f59e0b"
                    opacity="0.8"
                  />

                  {/* Midpoint Distance Badge */}
                  <g>
                    <rect
                      x={midX - 55}
                      y={midY - 22}
                      width="110"
                      height="34"
                      rx="6"
                      fill="#1e293b"
                      opacity="0.95"
                      stroke="#f59e0b"
                      strokeWidth="1"
                    />
                    <text
                      x={midX}
                      y={midY - 11}
                      textAnchor="middle"
                      fill="#fba518"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      D: {dist.toFixed(3)} m
                    </text>
                    <text
                      x={midX}
                      y={midY - 1}
                      textAnchor="middle"
                      fill="#cbd5e1"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      ΔX: {dx.toFixed(3)} m
                    </text>
                    <text
                      x={midX}
                      y={midY + 8}
                      textAnchor="middle"
                      fill="#cbd5e1"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      ΔY: {dy.toFixed(3)} m
                    </text>
                  </g>
                </g>
              );
            })()}

            {/* Draw completed measurement line to point 2 */}
            {measurePoints.length === 2 && (() => {
              const p1ScreenX = toScreenX(measurePoints[0].x);
              const p1ScreenY = toScreenY(measurePoints[0].y);
              const p2ScreenX = toScreenX(measurePoints[1].x);
              const p2ScreenY = toScreenY(measurePoints[1].y);

              const dist = Math.sqrt(Math.pow(measurePoints[1].x - measurePoints[0].x, 2) + Math.pow(measurePoints[1].y - measurePoints[0].y, 2));
              const dx = Math.abs(measurePoints[1].x - measurePoints[0].x);
              const dy = Math.abs(measurePoints[1].y - measurePoints[0].y);

              const midX = (p1ScreenX + p2ScreenX) / 2;
              const midY = (p1ScreenY + p2ScreenY) / 2;

              return (
                <g>
                  {/* Solid orange connection line */}
                  <line
                    x1={p1ScreenX}
                    y1={p1ScreenY}
                    x2={p2ScreenX}
                    y2={p2ScreenY}
                    stroke="#d97706"
                    strokeWidth="2.5"
                  />

                  {/* Second point crosshair */}
                  <g>
                    {/* Outer glowing pulse */}
                    <circle
                      cx={p2ScreenX}
                      cy={p2ScreenY}
                      r="8"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                      opacity="0.6"
                    />
                    {/* Crosshair circle */}
                    <circle
                      cx={p2ScreenX}
                      cy={p2ScreenY}
                      r="5"
                      fill="#f59e0b"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    {/* Crosshair lines */}
                    <line x1={p2ScreenX - 8} y1={p2ScreenY} x2={p2ScreenX + 8} y2={p2ScreenY} stroke="#ffffff" strokeWidth="1" />
                    <line x1={p2ScreenX} y1={p2ScreenY - 8} x2={p2ScreenX} y2={p2ScreenY + 8} stroke="#ffffff" strokeWidth="1" />
                    
                    {/* Small Label 'B' */}
                    <rect
                      x={p2ScreenX + 8}
                      y={p2ScreenY - 18}
                      width="12"
                      height="12"
                      rx="2"
                      fill="#f59e0b"
                    />
                    <text
                      x={p2ScreenX + 14}
                      y={p2ScreenY - 9}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="8"
                      fontWeight="bold"
                    >
                      B
                    </text>
                  </g>

                  {/* Midpoint Distance Badge */}
                  <g>
                    <rect
                      x={midX - 55}
                      y={midY - 22}
                      width="110"
                      height="34"
                      rx="6"
                      fill="#1e293b"
                      stroke="#d97706"
                      strokeWidth="1.5"
                    />
                    <text
                      x={midX}
                      y={midY - 11}
                      textAnchor="middle"
                      fill="#fbbf24"
                      fontSize="9.5"
                      fontWeight="black"
                      fontFamily="monospace"
                    >
                      L: {dist.toFixed(3)} {u.length}
                    </text>
                    <text
                      x={midX}
                      y={midY - 1}
                      textAnchor="middle"
                      fill="#cbd5e1"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      ΔX: {dx.toFixed(3)} {u.length}
                    </text>
                    <text
                      x={midX}
                      y={midY + 8}
                      textAnchor="middle"
                      fill="#cbd5e1"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      ΔY: {dy.toFixed(3)} {u.length}
                    </text>
                  </g>
                </g>
              );
            })()}
          </g>
        )}
      </svg>

      {/* POPUP FLOTANTE DE COORDENADAS Y DESPLAZAMIENTO POLAR (Cerca del Punto Seleccionado) */}
      {selectedPoint && (
        <div 
          className="absolute z-30 bg-slate-950/95 text-white backdrop-blur-md p-3 rounded-xl border border-indigo-500/50 shadow-2xl w-60 text-[10.5px] transition-all pointer-events-auto"
          style={{
            left: `${toScreenX(selectedPoint.x)}px`,
            top: `${toScreenY(selectedPoint.y) - 16}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {/* Triángulo indicador apuntando al nodo */}
          <div 
            className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-t-[6px] border-t-slate-950/95 border-x-[6px] border-x-transparent"
          />
          
          <div className="flex justify-between items-center border-b border-slate-800 pb-1.5 mb-1.5">
            <span className="font-bold text-indigo-400 flex items-center gap-1">
              ✏️ Vértice Seleccionado
            </span>
            <button
              onClick={() => setSelectedPointId(null)}
              className="text-slate-400 hover:text-white font-bold px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cerrar"
            >
              ✕
            </button>
          </div>

          {/* Coordenadas Absolutas */}
          <div className="grid grid-cols-2 gap-1.5 mb-2 pb-1.5 border-b border-slate-900">
            <div>
              <label className="text-[9px] font-semibold text-slate-400 block mb-0.5">X Absoluto ({u.length})</label>
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5">
                <input
                  type="number"
                  step="0.01"
                  value={parseFloat(selectedPoint.x.toFixed(3))}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      const updated = geometry.points.map(pt => pt.id === selectedPoint.id ? { ...pt, x: Math.max(0, val) } : pt);
                      onUpdateGeometry(updated, false, true);
                    }
                  }}
                  className="w-full bg-transparent font-mono text-[10px] font-bold text-white outline-none"
                />
                <span className="text-[8px] text-slate-500">{u.length}</span>
              </div>
            </div>
            <div>
              <label className="text-[9px] font-semibold text-slate-400 block mb-0.5">Y Absoluto ({u.length})</label>
              <div className={`flex items-center gap-1 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 ${
                (selectedPoint.handleType === 'heel' || selectedPoint.handleType === 'toe') ? 'opacity-40' : ''
              }`}>
                <input
                  type="number"
                  step="0.01"
                  disabled={selectedPoint.handleType === 'heel' || selectedPoint.handleType === 'toe'}
                  value={parseFloat(selectedPoint.y.toFixed(3))}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      const updated = geometry.points.map(pt => pt.id === selectedPoint.id ? { ...pt, y: Math.max(0, val) } : pt);
                      onUpdateGeometry(updated, false, true);
                    }
                  }}
                  className="w-full bg-transparent font-mono text-[10px] font-bold text-white outline-none disabled:cursor-not-allowed"
                />
                <span className="text-[8px] text-slate-500">{u.length}</span>
              </div>
            </div>
          </div>

          {/* Detalles de Ángulo/Inclinación Identificados */}
          {(() => {
            const idx = geometry.points.findIndex(pt => pt.id === selectedPoint.id);
            if (idx === -1) return null;
            const p = selectedPoint;
            const pPrev = idx > 0 ? geometry.points[idx - 1] : null;
            const pNext = idx < geometry.points.length - 1 ? geometry.points[idx + 1] : null;

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

            if (!pPrev && !pNext) return null;

            return (
              <div className="mb-2 pb-1.5 border-b border-slate-900 grid grid-cols-2 gap-1 bg-slate-900/40 p-1.5 rounded text-[9px] text-slate-400 font-mono">
                {pPrev && (
                  <>
                    <div>
                      <span className="text-indigo-400 font-semibold">Dist:</span> {distToPrev.toFixed(2)} {u.length}
                    </div>
                    <div>
                      <span className="text-indigo-400 font-semibold">Incl:</span> {angleToPrev.toFixed(1)}°
                    </div>
                  </>
                )}
                {internalAngle > 0 && (
                  <div className="col-span-2 text-center text-amber-400 font-semibold mt-0.5 pt-0.5 border-t border-slate-800/40">
                    📐 Ángulo Interno: {internalAngle.toFixed(1)}°
                  </div>
                )}
              </div>
            );
          })()}

          {/* Desplazamiento Polar */}
          <div className="space-y-1.5">
            <span className="font-semibold text-slate-300 text-[9px] block">📐 Desplazamiento Polar (r @ θ)</span>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-[8.5px] font-medium text-slate-400 block mb-0.5">
                  {useTrigCalcPolar ? `Dist. Calc (${u.length})` : `Distancia (${u.length})`}
                </label>
                <input
                  type="number"
                  step="0.1"
                  disabled={useTrigCalcPolar}
                  value={relDist}
                  onChange={(e) => setRelDist(e.target.value)}
                  placeholder="Ej. 3.0"
                  className="w-full bg-slate-900 border border-slate-800 disabled:opacity-75 disabled:text-indigo-400 disabled:font-bold rounded px-1.5 py-0.5 font-mono text-[9.5px] text-white outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[8.5px] font-medium text-slate-400 block mb-0.5">Ángulo (°)</label>
                <input
                  type="number"
                  step="5"
                  value={relAngle}
                  onChange={(e) => setRelAngle(e.target.value)}
                  placeholder="Ej. 45"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-[9.5px] text-white outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* TRIGONOMETRIC HELPER IN DARK THEME */}
            <div className="space-y-1 mt-1 border-t border-slate-800/40 pt-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  id="useTrigCalcPolar"
                  checked={useTrigCalcPolar}
                  onChange={(e) => setUseTrigCalcPolar(e.target.checked)}
                  className="w-3.5 h-3.5 text-indigo-600 border-slate-800 bg-slate-900 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="useTrigCalcPolar" className="text-[8.5px] font-bold text-slate-400 select-none cursor-pointer flex items-center gap-1">
                  📐 Calcular por Triángulo Rectángulo
                </label>
              </div>

              {useTrigCalcPolar && (
                <div className="bg-slate-900/60 rounded p-1.5 border border-slate-800 space-y-1 animate-fade-in text-[8.5px]">
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="text-[8px] font-semibold text-slate-500 block mb-0.5">Dato conocido:</label>
                      <select
                        value={trigKnownTypePolar}
                        onChange={(e) => setTrigKnownTypePolar(e.target.value as 'h' | 'dx' | 'dy')}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-1 py-0.5 font-sans text-slate-300 text-[8.5px] focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="dx">Cateto Horiz. (ΔX)</option>
                        <option value="dy">Cateto Vert. (ΔY)</option>
                        <option value="h">Hipotenusa (H)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[8px] font-semibold text-slate-500 block mb-0.5">Valor del lado ({u.length}):</label>
                      <input
                        type="number"
                        step="0.1"
                        value={trigValuePolar}
                        onChange={(e) => setTrigValuePolar(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 font-mono text-[8.5px] text-white focus:outline-none focus:border-indigo-500"
                        placeholder="ej. 3.0"
                      />
                    </div>
                  </div>

                  {/* Calculated outputs in dark theme */}
                  {(() => {
                    const angleVal = parseFloat(relAngle);
                    const val = parseFloat(trigValuePolar);
                    if (isNaN(angleVal) || isNaN(val) || val <= 0) return null;
                    
                    const angleRad = angleVal * (Math.PI / 180);
                    const cosVal = Math.cos(angleRad);
                    const sinVal = Math.sin(angleRad);
                    
                    let dist = 0;
                    let dx = 0;
                    let dy = 0;
                    
                    if (trigKnownTypePolar === 'h') {
                      dist = val;
                      dx = Math.abs(val * cosVal);
                      dy = Math.abs(val * sinVal);
                    } else if (trigKnownTypePolar === 'dx') {
                      const absCos = Math.abs(cosVal);
                      if (absCos > 0.0001) {
                        dist = val / absCos;
                        dx = val;
                        dy = Math.abs(dist * sinVal);
                      }
                    } else if (trigKnownTypePolar === 'dy') {
                      const absSin = Math.abs(sinVal);
                      if (absSin > 0.0001) {
                        dist = val / absSin;
                        dy = val;
                        dx = Math.abs(dist * cosVal);
                      }
                    }
                    
                    return (
                      <div className="bg-slate-950 rounded p-1 border border-slate-850 grid grid-cols-3 gap-0.5 text-[8px] font-mono text-slate-400">
                        <div className="flex flex-col items-center border-r border-slate-800">
                           <span className="text-[7px] text-slate-500 uppercase">Hipo (R)</span>
                          <span className="font-bold text-indigo-400 mt-0.5">{dist > 0 ? dist.toFixed(3) : '0.00'} {u.length}</span>
                        </div>
                        <div className="flex flex-col items-center border-r border-slate-800">
                          <span className="text-[7px] text-slate-500 uppercase">Horiz (ΔX)</span>
                          <span className="font-bold text-slate-300 mt-0.5">{dx.toFixed(3)} {u.length}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[7px] text-slate-500 uppercase">Vert (ΔY)</span>
                          <span className="font-bold text-slate-300 mt-0.5">{dy.toFixed(3)} {u.length}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <button
              onClick={handleApplyPolarMove}
              disabled={!relDist || !relAngle}
              className="w-full mt-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-900 disabled:text-slate-600 text-white font-bold text-[9px] py-1 rounded transition-colors cursor-pointer"
            >
              Aplicar Desplazamiento Polar
            </button>
          </div>
        </div>
      )}

      {/* BANNER DE INSTRUCCIONES PARA MEDICIÓN MANUAL */}
      {isMeasuring && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-25 bg-amber-500/95 text-white backdrop-blur-md px-4 py-2 rounded-xl shadow-lg border border-amber-400/50 text-[11px] font-medium flex items-center gap-3 animate-fade-in max-w-[90%] pointer-events-auto">
          <span className="bg-white/20 p-1 rounded-md text-sm">📏</span>
          <div className="text-left">
            <p className="font-bold leading-none mb-0.5">Modo Medición Manual</p>
            <p className="text-[10px] opacity-90 leading-tight">
              {measurePoints.length === 0 
                ? 'Haz clic en el lienzo para colocar el punto de origen (A).' 
                : measurePoints.length === 1 
                  ? 'Haz clic en otro punto para medir la distancia exacta (B).' 
                  : 'Medición realizada. Haz clic de nuevo para reiniciar.'}
            </p>
          </div>
          <button
            onClick={() => {
              setIsMeasuring(false);
              setMeasurePoints([]);
            }}
            className="ml-2 bg-amber-600 hover:bg-amber-700 px-2 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* INDICADOR DE COORDENADAS EN TIEMPO REAL (DISCRETO, FONDO OSCURO HIGH-TECH) */}
      <div className="absolute bottom-4 right-4 z-20 bg-slate-900/95 text-slate-100 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 shadow-md flex items-center gap-3 text-[10.5px] font-mono select-none pointer-events-none transition-all">
        <div className="flex items-center gap-1">
          <span className="text-indigo-400 font-extrabold">X:</span>
          <span>{hoverCoords ? hoverCoords.x.toFixed(3) : '0.000'} m</span>
        </div>
        <div className="w-[1px] h-3 bg-slate-700"></div>
        <div className="flex items-center gap-1">
          <span className="text-indigo-400 font-extrabold">Y:</span>
          <span>{hoverCoords ? hoverCoords.y.toFixed(3) : '0.000'} m</span>
        </div>
        {snapToGrid && (
          <>
            <div className="w-[1px] h-3 bg-slate-700"></div>
            <span className="text-[9px] text-amber-400 font-bold tracking-wider">SNAP ({userSnapSize === 0.001 ? '1mm' : userSnapSize === 0.01 ? '1cm' : userSnapSize === 0.1 ? '10cm' : '1m'})</span>
          </>
        )}
      </div>
      
      <div className="bg-slate-100 border-t border-gray-200 px-4 py-2.5 flex flex-col sm:flex-row gap-2 justify-between items-center text-[10.5px] text-gray-500 font-mono">
        <span>📍 Arrastra los nodos azules para deformar. ¡Haz clic en el lienzo o presiona el botón para añadir vértices a voluntad!</span>
        <span>🌊 Arrastra las esferas de agua para variar los niveles.</span>
      </div>
    </div>
  );
}

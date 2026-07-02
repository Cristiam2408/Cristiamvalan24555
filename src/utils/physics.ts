/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Point2D, MaterialProperties, DrainageGallery, ForceResult, StabilityResults, DamGeometry, GeometricFigure } from '../types';
import { UnitSystem } from './units';

// Computes the signed area of a 2D polygon using the Shoelace formula
export function calculatePolygonArea(points: Point2D[]): number {
  const n = points.length;
  if (n < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return area / 2;
}

// Ensures points are oriented Counter-Clockwise (CCW).
// For Canvas coordinates (y-down), CCW and CW might be inverted,
// but in our physics coordinate system (y-up, x-right), positive area means CCW.
export function orientCCW(points: Point2D[]): Point2D[] {
  const area = calculatePolygonArea(points);
  if (area < 0) {
    return [...points].reverse();
  }
  return points;
}

// Computes the centroid of a 2D polygon
export function calculatePolygonCentroid(points: Point2D[]): { x: number; y: number } {
  const n = points.length;
  if (n < 3) return { x: 0, y: 0 };
  
  // Ensure CCW orientation so Area is positive
  const ccwPoints = orientCCW(points);
  const area = calculatePolygonArea(ccwPoints);
  
  if (Math.abs(area) < 1e-6) {
    // Fallback to average
    let sx = 0, sy = 0;
    points.forEach(p => { sx += p.x; sy += p.y; });
    return { x: sx / n, y: sy / n };
  }
  
  let cx = 0;
  let cy = 0;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const factor = ccwPoints[i].x * ccwPoints[j].y - ccwPoints[j].x * ccwPoints[i].y;
    cx += (ccwPoints[i].x + ccwPoints[j].x) * factor;
    cy += (ccwPoints[i].y + ccwPoints[j].y) * factor;
  }
  
  return {
    x: cx / (6 * area),
    y: cy / (6 * area)
  };
}

// Computes geometric properties of a polygon: Area, Centroid, and Moments of Inertia
export function calculatePolygonInertia(points: Point2D[]): {
  area: number;
  cx: number;
  cy: number;
  Ixx: number;
  Iyy: number;
  I_Gxx: number;
  I_Gyy: number;
} {
  const ccwPoints = orientCCW(points);
  const n = ccwPoints.length;
  if (n < 3) return { area: 0, cx: 0, cy: 0, Ixx: 0, Iyy: 0, I_Gxx: 0, I_Gyy: 0 };

  let areaSum = 0;
  let cxSum = 0;
  let cySum = 0;
  let IxxSum = 0;
  let IyySum = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p1 = ccwPoints[i];
    const p2 = ccwPoints[j];
    
    // cross product factor
    const factor = p1.x * p2.y - p2.x * p1.y;
    areaSum += factor;
    cxSum += (p1.x + p2.x) * factor;
    cySum += (p1.y + p2.y) * factor;

    // second moments about origin
    IxxSum += factor * (p1.y * p1.y + p1.y * p2.y + p2.y * p2.y);
    IyySum += factor * (p1.x * p1.x + p1.x * p2.x + p2.x * p2.x);
  }

  const area = areaSum / 2;
  const absArea = Math.abs(area);
  if (absArea < 1e-6) {
    return { area: 0, cx: 0, cy: 0, Ixx: 0, Iyy: 0, I_Gxx: 0, I_Gyy: 0 };
  }

  const cx = cxSum / (6 * area);
  const cy = cySum / (6 * area);

  // Note: in polygon second moments of area formulas, the sum is divided by 12 (or 36, depending on factor definition)
  // Standard formula: I_xx = (1/12) * sum [ (x_i y_{i+1} - x_{i+1} y_i) * (y_i^2 + y_i y_{i+1} + y_{i+1}^2) ]
  const Ixx = IxxSum / 12;
  const Iyy = IyySum / 12;

  // Parallel axis theorem: I_G = I - A * d^2
  const I_Gxx = Math.abs(Ixx) - absArea * cy * cy;
  const I_Gyy = Math.abs(Iyy) - absArea * cx * cx;

  return {
    area: absArea,
    cx,
    cy,
    Ixx: Math.abs(Ixx),
    Iyy: Math.abs(Iyy),
    I_Gxx: Math.max(0, I_Gxx),
    I_Gyy: Math.max(0, I_Gyy)
  };
}

// Clips a line segment to a horizontal band [0, h] and returns the clipped points
function clipSegmentToHeight(
  x1: number, y1: number,
  x2: number, y2: number,
  h: number
): { x1: number; y1: number; x2: number; y2: number } | null {
  // If both are above h, or both are below 0
  if (y1 > h && y2 > h) return null;
  if (y1 < 0 && y2 < 0) return null;
  
  let cx1 = x1, cy1 = y1;
  let cx2 = x2, cy2 = y2;
  
  // Clip y1 to [0, h]
  if (y1 < 0) {
    if (Math.abs(y2 - y1) < 1e-6) return null;
    const t = (0 - y1) / (y2 - y1);
    cx1 = x1 + t * (x2 - x1);
    cy1 = 0;
  } else if (y1 > h) {
    if (Math.abs(y2 - y1) < 1e-6) return null;
    const t = (h - y1) / (y2 - y1);
    cx1 = x1 + t * (x2 - x1);
    cy1 = h;
  }
  
  // Clip y2 to [0, h]
  if (y2 < 0) {
    if (Math.abs(y2 - y1) < 1e-6) return null;
    const t = (0 - y1) / (y2 - y1);
    cx2 = x1 + t * (x2 - x1);
    cy2 = 0;
  } else if (y2 > h) {
    if (Math.abs(y2 - y1) < 1e-6) return null;
    const t = (h - y1) / (y2 - y1);
    cx2 = x1 + t * (x2 - x1);
    cy2 = h;
  }
  
  return { x1: cx1, y1: cy1, x2: cx2, y2: cy2 };
}

interface WaterForceOnSegment {
  fx: number; // Horizontal force (kN, positive right)
  fy: number; // Vertical force (kN, positive down)
  mx: number; // Center of pressure x (m)
  my: number; // Center of pressure y (m)
}

// Calculates the integrated water force vector (horizontal and vertical) acting on a polygon segment under a given water level
function calculateWaterForceOnSegment(
  x1: number, y1: number,
  x2: number, y2: number,
  h: number,
  gammaW: number
): WaterForceOnSegment | null {
  const clipped = clipSegmentToHeight(x1, y1, x2, y2, h);
  if (!clipped) return null;
  
  const { x1: cx1, y1: cy1, x2: cx2, y2: cy2 } = clipped;
  
  // Pressures at endpoints
  const p1 = gammaW * (h - cy1);
  const p2 = gammaW * (h - cy2);
  
  if (p1 <= 0 && p2 <= 0) return null;
  
  const dx = cx2 - cx1;
  const dy = cy2 - cy1;
  
  // Integrated force components with proper sign mapping (downward is positive, rightward is positive)
  const fx = -dy * (p1 + p2) / 2;
  const fy = -dx * (p1 + p2) / 2;
  
  // Center of pressure (centroid of linear load)
  let t_cp = 0.5;
  if (Math.abs(p1 + p2) > 1e-6) {
    t_cp = (p1 + 2 * p2) / (3 * (p1 + p2));
  }
  
  const mx = cx1 + t_cp * dx;
  const my = cy1 + t_cp * dy;
  
  return { fx, fy, mx, my };
}

// Calculates the vertical water force acting on a polygon segment under a given water level
function calculateVerticalWaterForceSegment(
  x1: number, y1: number,
  x2: number, y2: number,
  h: number,
  gammaW: number,
  isUpstream: boolean
): { fy: number; mx: number } | null {
  const res = calculateWaterForceOnSegment(x1, y1, x2, y2, h, gammaW);
  if (!res) return null;
  return { fy: res.fy, mx: res.mx };
}

function old_calculateVerticalWaterForceSegment(
  x1: number, y1: number,
  x2: number, y2: number,
  h: number,
  gammaW: number,
  isUpstream: boolean
): { fy: number; mx: number } | null {
  const clipped = clipSegmentToHeight(x1, y1, x2, y2, h);
  if (!clipped) return null;
  
  const { x1: cx1, y1: cy1, x2: cx2, y2: cy2 } = clipped;
  const dx = cx2 - cx1;
  
  // We only care about horizontal span
  if (Math.abs(dx) < 1e-5) return null;
  
  // In CCW order:
  // For upstream face, path goes generally down (from crest to heel).
  // Thus x decreases or increases depending on slope.
  // If we sort the segment left-to-right (let xa be leftmost, xb be rightmost):
  const xa = Math.min(cx1, cx2);
  const xb = Math.max(cx1, cx2);
  const ya = cx1 < cx2 ? cy1 : cy2;
  const yb = cx1 < cx2 ? cy2 : cy1;
  
  // The water column is bounded by:
  // Top: y = h
  // Bottom: the sloped segment between (xa, ya) and (xb, yb)
  // Left: x = xa
  // Right: x = xb
  
  // Volume (area of vertical strip)
  const areaStrip = (xb - xa) * (h - (ya + yb) / 2);
  if (areaStrip <= 0) return null;
  
  const fyForce = areaStrip * gammaW; // kN (per meter)
  
  // Centroid of the vertical strip:
  // Strip is Rectangle [xa, xb] x [0, h] MINUS Trapezoid [xa, xb] under the segment.
  const areaRect = (xb - xa) * h;
  const xRect = (xa + xb) / 2;
  
  const areaTrap = (xb - xa) * (ya + yb) / 2;
  // Centroid of trapezoid
  let xTrap = (xa + xb) / 2;
  if (Math.abs(ya + yb) > 1e-6) {
    xTrap = xa + ((xb - xa) / 3) * ((ya + 2 * yb) / (ya + yb));
  }
  
  let xCentroid = xRect;
  if (Math.abs(areaRect - areaTrap) > 1e-6) {
    xCentroid = (areaRect * xRect - areaTrap * xTrap) / (areaRect - areaTrap);
  }
  
  // Determine if this is a downward (stabilizing) or upward (buoyancy) force.
  // In CCW order:
  // Upstream: heel is at the bottom-left, crest is top. CCW path on upstream face goes from top (crest) to bottom (heel).
  // So dy is negative (y decreases).
  // If the face slopes upstream, heel.x < crest.x. So as we go CCW (from crest to heel), x decreases (dx < 0).
  // Since x decreases, the dam is to the right of the water. Water is on top of the slope, pressing DOWN.
  // Generally, any segment where water is ON TOP of the concrete receives a downward force.
  // Let\"s identify the direction of the normal vector.
  // CCW path segment vector: (dx, dy). Outward normal points to (dy, -dx).
  // If the outward normal points upwards (normal.y > 0), then water is pressing DOWN on the concrete.
  // Outward normal.y = -dx.
  // If -dx > 0 => dx < 0, then outward normal points upwards. Wait!
  // Let\"s be physically direct:
  // For upstream water (to the left of the dam):
  // If the dam slopes upstream (heel is left of crest, so face slopes down-left):
  // The water rests on top of this slope. This is a downward force (stabilizing).
  // For downstream water (to the right of the dam):
  // If the dam slopes downstream (toe is right of crest, so face slopes down-right):
  // The water rests on top of this slope. This is a downward force (stabilizing).
  // Let\"s check the slope sign:
  // If we are upstream (x <= crest_left):
  // If a segment goes from top-right to bottom-left (dy < 0, dx < 0, which is standard CCW),
  // the water rests ON the slope. Downward force.
  // If we are downstream (x >= crest_right):
  // If a segment goes from bottom-left to top-right (dy > 0, dx > 0, standard CCW),
  // the water is UNDER the slope? No, downstream CCW path goes from toe to crest, so it goes UP and LEFT (dy > 0, dx < 0).
  // If it goes up and left, the outward normal (dy, -dx) has normal.y = -dx > 0, which means it points upwards. So water is on top of it, pressing DOWN.
  // So indeed, we can determine the direction of the vertical force based on the sign of dx in CCW order!
  // Let\"s verify:
  // If dx < 0 (in CCW), the outward normal has a positive y component, meaning it points upwards.
  // Since the fluid is outside the polygon, the fluid pressure acts opposite to the outward normal, so it presses DOWN (downward vertical force, fy > 0).
  // If dx > 0, the outward normal points downwards, meaning fluid would press UP (buoyancy, fy < 0).
  // This is a mathematically perfect and unified law for hydrostatic pressure!
  // Let\"s use this sign!
  // CCW segment from P1 to P2. dx = x2 - x1.
  // If dx < 0: fluid presses DOWN (fy = +fyForce).
  // If dx > 0: fluid presses UP (fy = -fyForce).
  // This is brilliant and incredibly elegant.
  
  const originalDx = cx2 - cx1;
  const isDownward = originalDx < 0;
  const fy = isDownward ? fyForce : -fyForce;
  
  return {
    fy,
    mx: xCentroid
  };
}

export function performStabilityAnalysis(
  geometry: DamGeometry,
  materials: MaterialProperties,
  waterUpstream: number, // hu
  waterDownstream: number, // hd
  drainage: DrainageGallery,
  unitSystem?: UnitSystem
): StabilityResults {
  let crackedLength = 0;
  const drainageActive = drainage?.active ?? false;
  const drainageLocationFraction = drainage?.locationFraction ?? 0.3;
  const drainageEfficiency = drainage?.efficiency ?? 0.5;

  if (!materials.frictionCoeff || !materials.gammaConcrete || !materials.gammaWater) {
    throw new Error("Faltan propiedades de materiales obligatorias (frictionCoeff, gammaConcrete o gammaWater)");
  }
  const pointsCCW = orientCCW(geometry.points);
  const n = pointsCCW.length;
  
  // Find baseline (y = 0 or lowest points)
  let minY = Infinity;
  pointsCCW.forEach(p => { if (p.y < minY) minY = p.y; });
  
  // Find Heel (leftmost at minY) and Toe (rightmost at minY)
  const baselineTolerance = 0.05; // 5 cm tolerance
  const basePoints = pointsCCW.filter(p => Math.abs(p.y - minY) < baselineTolerance);
  
  let heelX = 0;
  let toeX = 10; // default fallback
  
  if (basePoints.length >= 2) {
    let minX = Infinity;
    let maxX = -Infinity;
    basePoints.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    });
    heelX = minX;
    toeX = maxX;
  } else {
    // Fallback: search across all points
    let minX = Infinity;
    let maxX = -Infinity;
    pointsCCW.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    });
    heelX = minX;
    toeX = maxX;
  }
  
  const B = toeX - heelX;
  
  // Area and Weight of concrete (assuming 1m thick slice) using polygon integration
  const polyInertia = calculatePolygonInertia(pointsCCW);
  const area = polyInertia.area;
  
  // 1.6 Con galería o abertura interna (orificio de inspección, conducto)
  let netArea = area;
  const centroid = { x: polyInertia.cx, y: polyInertia.cy };
  let netCentroidX = centroid.x;
  let netCentroidY = centroid.y;
  let galleryArea = 0;
  let galleryCentroidX = heelX;
  let galleryCentroidY = minY;

  if (materials.galleryActive && 
      materials.galleryWidth && materials.galleryWidth > 0 && 
      materials.galleryHeight && materials.galleryHeight > 0) {
    galleryArea = materials.galleryWidth * materials.galleryHeight;
    galleryCentroidX = heelX + (materials.galleryX ?? (B * 0.2));
    galleryCentroidY = minY + (materials.galleryY ?? (materials.galleryHeight / 2));

    // Subtract gallery from concrete section
    netArea = Math.max(0.1, area - galleryArea);
    netCentroidX = (area * centroid.x - galleryArea * galleryCentroidX) / netArea;
    netCentroidY = (area * centroid.y - galleryArea * galleryCentroidY) / netArea;
  }

  const volume = netArea * 1.0;
  const weight = volume * materials.gammaConcrete;

  // Geometric Figures Decomposition (for educational table and exact procedure breakdown)
  const figures: GeometricFigure[] = [];
  if (geometry.mode === 'parametric') {
    const H_param = geometry.height!;
    const b_param = geometry.crestWidth!;
    const m_param = geometry.upstreamSlope!;
    const n_param = geometry.downstreamSlope!;
    
    const b1 = m_param * H_param;
    const b2 = b_param;
    
    // Upstream Triangle
    if (b1 > 0.01) {
      const a1 = 0.5 * b1 * H_param;
      const w1 = a1 * materials.gammaConcrete;
      const xc1 = (2 / 3) * b1; // distance from heel
      const arm1 = B - xc1;     // distance from toe
      figures.push({
        name: 'Triángulo Aguas Arriba (Cuerpo)',
        shape: 'triangle',
        base: b1,
        height: H_param,
        area: a1,
        weight: w1,
        centroidX: arm1,
        momentAboutToe: w1 * arm1
      });
    }
    
    // Central Rectangle
    if (b2 > 0.01) {
      const a2 = b2 * H_param;
      const w2 = a2 * materials.gammaConcrete;
      const xc2 = b1 + 0.5 * b2; // distance from heel
      const arm2 = B - xc2;      // distance from toe
      figures.push({
        name: 'Rectángulo Central (Cuerpo)',
        shape: 'rectangle',
        base: b2,
        height: H_param,
        area: a2,
        weight: w2,
        centroidX: arm2,
        momentAboutToe: w2 * arm2
      });
    }
    
    // Downstream Triangle
    const b3 = Math.max(0, B - b1 - b2);
    if (b3 > 0.01) {
      const a3 = 0.5 * b3 * H_param;
      const w3 = a3 * materials.gammaConcrete;
      const xc3 = b1 + b2 + (1 / 3) * b3; // distance from heel
      const arm3 = B - xc3;               // distance from toe
      figures.push({
        name: 'Triángulo Aguas Abajo (Cuerpo)',
        shape: 'triangle',
        base: b3,
        height: H_param,
        area: a3,
        weight: w3,
        centroidX: arm3,
        momentAboutToe: w3 * arm3
      });
    }
  } else {
    // Free mode
    figures.push({
      name: 'Polígono Libre (Cuerpo)',
      shape: 'rectangle', // fallback shape
      base: B,
      height: Math.max(1, ...pointsCCW.map(p => p.y)) - minY,
      area: area,
      weight: area * materials.gammaConcrete,
      centroidX: toeX - centroid.x, // distance from toe
      momentAboutToe: (area * materials.gammaConcrete) * (toeX - centroid.x)
    });
  }

  if (materials.galleryActive && galleryArea > 0) {
    figures.push({
      name: 'Galería de Inspección (Sustracción)',
      shape: 'rectangle',
      base: materials.galleryWidth ?? 0,
      height: materials.galleryHeight ?? 0,
      area: -galleryArea,
      weight: -galleryArea * materials.gammaConcrete,
      centroidX: toeX - galleryCentroidX, // distance from toe
      momentAboutToe: -(galleryArea * materials.gammaConcrete) * (toeX - galleryCentroidX)
    });
  }

  // 1. ÁNALISIS A PRESA VACÍA (Cálculo estricto según especificación del usuario)
  let emptyStressHeel = 0;
  let emptyStressToe = 0;
  let emptyStressRedistributed = false;
  let emptyCrackedLength = 0;
  let emptyEccentricity = 0;
  let isWithinMiddleThirdEmpty = true;

  if (weight > 0 && B > 0) {
    // Centroide de la presa desde el talón es netCentroidX - heelX
    const xc_empty = netCentroidX - heelX;
    // Excentricidad e = xc - B/2 (respecto al centro de la base, positivo aguas abajo)
    emptyEccentricity = xc_empty - B / 2;
    isWithinMiddleThirdEmpty = Math.abs(emptyEccentricity) <= B / 6 + 1e-5;

    emptyStressHeel = (weight / B) * (1 - (6 * emptyEccentricity) / B);
    emptyStressToe = (weight / B) * (1 + (6 * emptyEccentricity) / B);
  }

  const emptyDam = {
    weight,
    centroid: { x: netCentroidX - heelX, y: netCentroidY - minY },
    eccentricity: emptyEccentricity,
    isWithinMiddleThird: isWithinMiddleThirdEmpty,
    stressHeel: emptyStressHeel,
    stressToe: emptyStressToe,
    stressRedistributed: emptyStressRedistributed,
    crackedLength: emptyCrackedLength
  };

  // 2. ÁNALISIS A PRESA LLENA (Forces & moments about the toe)
  const forces: ForceResult[] = [];
  
  // Concrete Weight
  forces.push({
    name: materials.galleryActive ? 'Peso Neto Concreto (con Galería)' : 'Peso Propio (Concreto)',
    fx: 0,
    fy: weight,
    mx: netCentroidX,
    my: netCentroidY,
    momentToe: weight * (toeX - netCentroidX),
    type: 'stabilizing',
    color: '#4b5563', // gray-600
    leverArm: Math.abs(toeX - netCentroidX)
  });
  
  // Find Crest start and end
  let highestY = -Infinity;
  pointsCCW.forEach(p => { if (p.y > highestY) highestY = p.y; });
  const crestPoints = pointsCCW.filter(p => Math.abs(p.y - highestY) < 0.1);
  let crestLeftX = heelX + B/3;
  let crestCenterX = heelX + B/2;
  if (crestPoints.length > 0) {
    let minCrestX = Infinity;
    let maxCrestX = -Infinity;
    crestPoints.forEach(p => {
      if (p.x < minCrestX) minCrestX = p.x;
      if (p.x > maxCrestX) maxCrestX = p.x;
    });
    crestLeftX = minCrestX;
    crestCenterX = (minCrestX + maxCrestX) / 2;
  }

  // Integrate water pressure on all inclined segments
  for (let i = 0; i < n; i++) {
    const p1 = pointsCCW[i];
    const p2 = pointsCCW[(i + 1) % n];

    // Skip the base segment
    const esBordeBase = Math.abs(p1.y - minY) < baselineTolerance && Math.abs(p2.y - minY) < baselineTolerance;
    if (esBordeBase) continue;

    const x_mid = (p1.x + p2.x) / 2;

    if (x_mid < crestCenterX) {
      // Upstream water
      const res = calculateWaterForceOnSegment(p1.x, p1.y, p2.x, p2.y, waterUpstream + minY, materials.gammaWater);
      if (res) {
        // Horizontal force
        if (Math.abs(res.fx) > 1e-4) {
          forces.push({
            name: `Empuje Hidrostático (Aguas Arriba)`,
            fx: res.fx,
            fy: 0,
            mx: res.mx,
            my: res.my,
            momentToe: Math.abs(res.fx * (res.my - minY)),
            type: 'overturning',
            color: '#2563eb', // blue-600
            leverArm: Math.abs(res.my - minY)
          });
        }
        // Vertical force
        if (Math.abs(res.fy) > 1e-4) {
          const isDownward = res.fy > 0;
          forces.push({
            name: isDownward ? `Peso del Agua (Aguas Arriba) ▼` : `Empuje de Flotabilidad (Aguas Arriba) ▲`,
            fx: 0,
            fy: res.fy,
            mx: res.mx,
            my: res.my,
            momentToe: Math.abs(res.fy * (toeX - res.mx)),
            type: isDownward ? 'stabilizing' : 'overturning',
            color: '#3b82f6', // lighter blue
            leverArm: Math.abs(toeX - res.mx)
          });
        }
      }
    } else {
      // Downstream water
      const res = calculateWaterForceOnSegment(p1.x, p1.y, p2.x, p2.y, waterDownstream + minY, materials.gammaWater);
      if (res) {
        // Horizontal force
        if (Math.abs(res.fx) > 1e-4) {
          forces.push({
            name: `Empuje Hidrostático (Aguas Abajo)`,
            fx: res.fx,
            fy: 0,
            mx: res.mx,
            my: res.my,
            momentToe: Math.abs(res.fx * (res.my - minY)),
            type: 'stabilizing',
            color: '#0d9488', // teal-600
            leverArm: Math.abs(res.my - minY)
          });
        }
        // Vertical force
        if (Math.abs(res.fy) > 1e-4) {
          const isDownward = res.fy > 0;
          forces.push({
            name: isDownward ? `Peso del Agua (Aguas Abajo) ▼` : `Empuje de Flotabilidad (Aguas Abajo) ▲`,
            fx: 0,
            fy: res.fy,
            mx: res.mx,
            my: res.my,
            momentToe: Math.abs(res.fy * (toeX - res.mx)),
            type: isDownward ? 'stabilizing' : 'overturning',
            color: '#14b8a6', // lighter teal
            leverArm: Math.abs(toeX - res.mx)
          });
        }
      }
    }
  }
  
  // Uplift Force (Subpresión, F_sb) with piecewise linear distribution
  const heelPoint = pointsCCW.reduce((closest, p) => 
    Math.abs(p.x - heelX) < Math.abs(closest.x - heelX) ? p : closest
  , pointsCCW[0]);

  const toePoint = pointsCCW.reduce((closest, p) => 
    Math.abs(p.x - toeX) < Math.abs(closest.x - toeX) ? p : closest
  , pointsCCW[0]);

  const y_heel = heelPoint ? heelPoint.y : minY;
  const y_toe = toePoint ? toePoint.y : minY;

  const H_u = minY + waterUpstream;
  const H_d = minY + waterDownstream;

  const depth_u = Math.max(0, waterUpstream - (heelPoint ? heelPoint.y - minY : 0));
  const depth_d = Math.max(0, waterDownstream - (toePoint ? toePoint.y - minY : 0));

  const k_uplift = materials.upliftAreaFactor ?? 1.0;
  const P_u = materials.gammaWater * depth_u * k_uplift; // kPa at heel
  const P_d = materials.gammaWater * depth_d * k_uplift; // kPa at toe
  const areaFactor = k_uplift; // Coeficiente de subpresión (k)
  
  interface ProfilePoint {
    x: number; // relative to heel
    pressure: number;
    label: string;
  }
  
  const profilePoints: ProfilePoint[] = [];

  const getBaseElevation = (x: number) => {
    if (B <= 1e-5) return y_heel;
    return y_heel + (x / B) * (y_toe - y_heel);
  };
  
  if (B > 0) {
    profilePoints.push({ x: 0, pressure: P_u, label: 'Talón' });
    
    // Grout Curtain point
    const x_curt = Math.min(2.0, 0.08 * B);
    const groutActive = materials.groutCurtainActive ?? false;
    const groutEff = materials.groutCurtainEfficiency ?? 0.5;
    
    const h_normal_curt = H_u - (x_curt / B) * (H_u - H_d);
    const h_curt = groutActive 
      ? Math.max(H_d, h_normal_curt - groutEff * (H_u - H_d)) 
      : h_normal_curt;
    
    const y_curt = getBaseElevation(x_curt);
    const P_curt = materials.gammaWater * Math.max(0, h_curt - y_curt) * k_uplift;
    profilePoints.push({ x: x_curt, pressure: P_curt, label: groutActive ? 'Pantalla' : 'Interm.' });
    
    // Drainage Gallery point
    const drainLocation = drainageLocationFraction * B;
    const x_drain = Math.max(x_curt + 0.1, drainLocation);
    
    const h_normal_drain = h_curt - ((x_drain - x_curt) / (B - x_curt)) * (h_curt - H_d);
    const h_drain = drainageActive
      ? Math.max(H_d, H_d + drainageEfficiency * (h_curt - H_d))
      : h_normal_drain;
    
    const y_drain = getBaseElevation(x_drain);
    const P_drain = materials.gammaWater * Math.max(0, h_drain - y_drain) * k_uplift;
    profilePoints.push({ x: x_drain, pressure: P_drain, label: drainage.active ? 'Galería' : 'Interm.' });
    
    profilePoints.push({ x: B, pressure: P_d, label: 'Puntera' });
  } else {
    profilePoints.push({ x: 0, pressure: 0, label: 'Talón' });
  }
  
  profilePoints.sort((a, b) => a.x - b.x);
  
  let F_sb = 0;
  let sumMomentsRelative = 0;
  
  for (let i = 0; i < profilePoints.length - 1; i++) {
    const pt1 = profilePoints[i];
    const pt2 = profilePoints[i+1];
    const w_i = pt2.x - pt1.x;
    if (w_i <= 1e-5) continue;
    
    const P_avg = 0.5 * (pt1.pressure + pt2.pressure);
    const F_i = P_avg * w_i * areaFactor;
    
    let x_centroid_rel = w_i / 2;
    if (Math.abs(pt1.pressure + pt2.pressure) > 1e-6) {
      x_centroid_rel = (w_i / 3) * ((pt1.pressure + 2 * pt2.pressure) / (pt1.pressure + pt2.pressure));
    }
    const X_i = pt1.x + x_centroid_rel;
    
    F_sb += F_i;
    sumMomentsRelative += F_i * X_i;
  }
  
  const x_sb_rel = F_sb > 0 ? sumMomentsRelative / F_sb : B / 2;
  const x_sb = heelX + x_sb_rel;
  const momentUpliftToe = F_sb * (toeX - x_sb);

  let upliftDiagramType: 'triangular' | 'trapezoidal' | 'rectangular' | 'polygonal_broken' = 'triangular';
  const hasGrout = materials.groutCurtainActive ?? false;
  const hasDrain = drainage.active;
  if (hasGrout || hasDrain) {
    upliftDiagramType = 'polygonal_broken';
  } else if (Math.abs(P_u - P_d) < 1e-4 && P_u > 0) {
    upliftDiagramType = 'rectangular';
  } else if (P_d > 0 && P_u > 0) {
    upliftDiagramType = 'trapezoidal';
  } else {
    upliftDiagramType = 'triangular';
  }
  
  if (F_sb > 0) {
    forces.push({
      name: 'Subpresión (Uplift)',
      fx: 0,
      fy: -F_sb, // acts upwards
      mx: x_sb,
      my: minY,
      momentToe: momentUpliftToe,
      type: 'overturning',
      color: '#ea580c', // orange-600
      leverArm: Math.abs(toeX - x_sb)
    });
  }

  // 2.1 Sismo vertical
  const kv = materials.seismicKv ?? 0;
  if (kv > 0) {
    const F_v_sismo = kv * weight;
    forces.push({
      name: `Sismo Vertical (Efecto de Alivio ↑)`,
      fx: 0,
      fy: -F_v_sismo, // acts upwards
      mx: netCentroidX,
      my: netCentroidY,
      momentToe: F_v_sismo * (toeX - netCentroidX), // overturning
      type: 'overturning',
      color: '#ef4444', // red-500
      leverArm: Math.abs(toeX - netCentroidX)
    });
  }

  // 2.2 Sismo horizontal
  const kh = materials.seismicKh ?? 0;
  if (kh > 0) {
    const F_h_sismo = kh * weight;
    forces.push({
      name: 'Inercia Sísmica Horizontal (Cuerpo)',
      fx: F_h_sismo, // acts to the right
      fy: 0,
      mx: netCentroidX,
      my: netCentroidY,
      momentToe: F_h_sismo * (netCentroidY - minY), // overturning
      type: 'overturning',
      color: '#dc2626', // darker red
      leverArm: Math.abs(netCentroidY - minY)
    });
  }

  // 2.3 Westergaard Hydrodynamic Force
  const westergaardActive = materials.westergaardActive ?? false;
  if (westergaardActive && kh > 0 && waterUpstream > 0) {
    const F_ws = (7 / 12) * kh * materials.gammaWater * Math.pow(waterUpstream, 2);
    const y_ws = minY + 0.4 * waterUpstream;
    forces.push({
      name: 'Empuje Hidrodinámico (Westergaard)',
      fx: F_ws,
      fy: 0,
      mx: heelX,
      my: y_ws,
      momentToe: F_ws * (y_ws - minY),
      type: 'overturning',
      color: '#3b82f6', // blue-500
      leverArm: Math.abs(y_ws - minY)
    });
  }

  // 2.4 Lateral Sediment Force (Empuje del limo)
  const h_limo = materials.sedimentHeight ?? 0;
  if (h_limo > 0) {
    const gamma_limo = materials.sedimentGamma ?? 18.0;
    const Ka = materials.sedimentKa ?? 0.33;
    const F_limo = 0.5 * gamma_limo * Ka * Math.pow(h_limo, 2);
    const y_limo = minY + h_limo / 3;
    forces.push({
      name: 'Empuje Lateral de Sedimentos (Limo)',
      fx: F_limo,
      fy: 0,
      mx: heelX,
      my: y_limo,
      momentToe: F_limo * (y_limo - minY),
      type: 'overturning',
      color: '#78350f', // brown
      leverArm: Math.abs(y_limo - minY)
    });
  }

  // 2.5 Surcharge on Crest (Sobrecarga en corona)
  const q_surcharge = materials.surcharge ?? 0;
  if (q_surcharge > 0) {
    let crestCenterX = heelX + B / 3;
    if (crestPoints.length >= 2) {
      let minCrestX = Infinity;
      let maxCrestX = -Infinity;
      crestPoints.forEach(p => {
        if (p.x < minCrestX) minCrestX = p.x;
        if (p.x > maxCrestX) maxCrestX = p.x;
      });
      crestCenterX = (minCrestX + maxCrestX) / 2;
    } else if (crestPoints.length === 1) {
      crestCenterX = crestPoints[0].x;
    }
    forces.push({
      name: 'Sobrecarga en la Corona (q)',
      fx: 0,
      fy: q_surcharge, // vertical downward (stabilizing)
      mx: crestCenterX,
      my: highestY,
      momentToe: q_surcharge * (toeX - crestCenterX),
      type: 'stabilizing',
      color: '#16a34a', // green-600
      leverArm: Math.abs(toeX - crestCenterX)
    });
  }
  
  // SUM OF FORCES AND MOMENTS
  let sumVerticalStabilizing = 0;
  let sumVerticalOverturning = 0;
  let sumHorizontalStabilizing = 0;
  let sumHorizontalOverturning = 0;
  
  let sumMomentStabilizing = 0;
  let sumMomentOverturning = 0;
  
  forces.forEach(f => {
    if (f.type === 'stabilizing') {
      if (f.fy !== 0) sumVerticalStabilizing += Math.abs(f.fy);
      if (f.fx !== 0) sumHorizontalStabilizing += Math.abs(f.fx);
      sumMomentStabilizing += f.momentToe;
    } else {
      if (f.fy !== 0) sumVerticalOverturning += Math.abs(f.fy);
      if (f.fx !== 0) sumHorizontalOverturning += Math.abs(f.fx);
      sumMomentOverturning += f.momentToe;
    }
  });
  
  // NET FORCES (Calculated algebraically)
  let netVerticalForce = 0;
  forces.forEach(f => {
    netVerticalForce += f.fy; // Downward positive, Upward negative
  });

  let netHorizontalForce = 0;
  forces.forEach(f => {
    netHorizontalForce += f.fx; // Right positive, Left negative
  });
  netHorizontalForce = Math.abs(netHorizontalForce);
  
  // FACTORS OF SAFETY
  const fosOverturning = sumMomentOverturning > 0 
    ? sumMomentStabilizing / sumMomentOverturning 
    : Infinity;
    
  // Sliding FOS (Fricción Simple de Cuerpo Rígido con inyección opcional de σ_R como constante resistente aditiva)
  const F_sigma = (materials.soilResistanceBase && materials.soilResistanceBase > 0)
    ? materials.soilResistanceBase * 100 * B
    : 0;
  
  const slidingResistance = (materials.frictionCoeff * Math.max(0, netVerticalForce)) + F_sigma;
  const fosSliding = netHorizontalForce > 0 
    ? slidingResistance / netHorizontalForce 
    : Infinity;
  
  // FOUNDATION STRESSES (Rigid Body Analysis using Navier's algebraic formula)
  let xR_toe = 0;
  let xR_heel = 0;
  let eccentricity = 0;
  let isWithinMiddleThird = true;
  let stressHeel = 0;
  let stressToe = 0;
  let stressRedistributed = false;

  if (B > 0) {
    const netMoment = sumMomentStabilizing - sumMomentOverturning;
    if (Math.abs(netVerticalForce) > 1e-5) {
      xR_toe = netMoment / netVerticalForce;
      xR_heel = B - xR_toe;
      eccentricity = xR_heel - B / 2; // positive towards toe
      isWithinMiddleThird = Math.abs(eccentricity) <= B / 6 + 1e-5;
      
      stressHeel = (netVerticalForce / B) * (1 - (6 * eccentricity) / B);
      stressToe = (netVerticalForce / B) * (1 + (6 * eccentricity) / B);
    } else {
      eccentricity = Infinity;
      isWithinMiddleThird = false;
      stressHeel = (6 * netMoment) / (B * B);
      stressToe = (-6 * netMoment) / (B * B);
    }
  }

  // Shear stresses calculations for results presentation
  let shearStressHeel = 0;
  let shearStressToe = 0;
  if (B > 0) {
    if (stressRedistributed) {
      const activeLength = B - crackedLength;
      if (activeLength > 0.05) {
        const shearAvg = netHorizontalForce / activeLength;
        if (eccentricity > 0) {
          shearStressHeel = 0;
          shearStressToe = shearAvg;
        } else {
          shearStressHeel = shearAvg;
          shearStressToe = 0;
        }
      }
    } else {
      shearStressHeel = netHorizontalForce / B;
      shearStressToe = netHorizontalForce / B;
    }
  }
  
  // If unitSystem is ST, we convert stresses from kgf/m² to kgf/cm²
  const isST = unitSystem === 'ST';
  
  if (isST) {
    stressHeel /= 10000.0;
    stressToe /= 10000.0;
    shearStressHeel /= 10000.0;
    shearStressToe /= 10000.0;
    
    emptyDam.stressHeel /= 10000.0;
    emptyDam.stressToe /= 10000.0;
    
    profilePoints.forEach(p => {
      p.pressure /= 10000.0;
    });
  }
  
  // VERIFICATIONS
  const passesOverturning = fosOverturning >= materials.targetFOSOverturning;
  const passesSliding = fosSliding >= materials.targetFOSSliding;
  
  let allowableBearing = materials.allowableBearing;
  if (materials.soilResistanceBase && materials.soilResistanceBase > 0) {
    // In SI, soilResistanceBase is in kg/cm² so we multiply by 100 to get kPa
    // In ST, it is already in kgf/cm² so we keep it as is
    // In US, it is converted to ksf
    if (unitSystem === 'SI') {
      allowableBearing = materials.soilResistanceBase * 100;
    } else {
      allowableBearing = materials.soilResistanceBase;
    }
  }

  const passesTension = isWithinMiddleThird || (materials.allowableTension >= 0 && stressHeel >= -materials.allowableTension && stressToe >= -materials.allowableTension);
  const passesCompression = stressHeel <= allowableBearing && stressToe <= allowableBearing;
  const passesAll = passesOverturning && passesSliding && passesTension && passesCompression && netVerticalForce > 0;
  
  return {
    area,
    volume,
    weight,
    centroid,
    baseWidth: B,
    heelX,
    toeX,
    
    figures,
    emptyDam,
    
    forces,
    
    sumVerticalStabilizing,
    sumVerticalOverturning,
    netVerticalForce,
    netHorizontalForce,
    sumHorizontalStabilizing,
    sumHorizontalOverturning,
    
    sumMomentStabilizing,
    sumMomentOverturning,
    
    fosOverturning,
    fosSliding,
    
    eccentricity,
    isWithinMiddleThird,
    
    stressHeel,
    stressToe,
    stressRedistributed,
    crackedLength,
    isStressRedistributed: stressRedistributed,
    shearStressHeel,
    shearStressToe,
    L_crack: crackedLength,
    
    passesOverturning,
    passesSliding,
    passesTension,
    passesCompression,
    passesAll,
    
    damLength: materials.damLength ?? 50.0,
    upliftProfile: profilePoints.map(p => ({
      x: p.x,
      pressure: p.pressure,
      label: p.label
    })),
    upliftDiagramType,
    upliftTotalArea: F_sb,
    upliftCentroidFromHeel: x_sb_rel,
    upliftHeelPressure: isST ? P_u / 10000.0 : P_u,
    upliftToePressure: isST ? P_d / 10000.0 : P_d,
    polygonInertia: {
      Ixx: polyInertia.Ixx,
      Iyy: polyInertia.Iyy,
      I_G: B > 0 ? (1.0 * Math.pow(B, 3)) / 12 : 0, // Base moment of inertia for 1m slice
      I_Gxx: polyInertia.I_Gxx,
      I_Gyy: polyInertia.I_Gyy
    }
  };
}

// Generates points for standard dam geometries based on parametric dimensions
export function generateParametricPoints(
  height: number,
  crestWidth: number,
  baseWidth: number,
  upstreamSlope: number, // m (horizontal / rise)
  downstreamSlope: number, // n (horizontal / rise)
  originX: number = 0
): Point2D[] {
  // We place heel at (originX, 0).
  // Upstream face goes from heel (originX, 0) to crest-left (originX + upstreamSlope * height, height)
  // Crest goes from crest-left to crest-right (originX + upstreamSlope * height + crestWidth, height)
  // Downstream face goes from crest-right to toe (originX + baseWidth, 0)
  // Wait, let\"s verify if geometry is consistent:
  // Is downstream slope n consistent with (baseWidth - upstreamSlope * height - crestWidth) / height?
  // Let\"s make sure that if the user edits n, it adapts baseWidth, or vice versa!
  // It is much safer to let baseWidth be calculated as:
  // baseWidth = upstreamSlope * height + crestWidth + downstreamSlope * height
  // Or we can let them edit baseWidth directly, and we adjust downstreamSlope!
  // Let\"s adjust downstreamSlope dynamically: n = (baseWidth - m * height - b) / height.
  // This is very clean and consistent!
  
  const h = Math.max(1, height);
  const b = Math.max(0.1, crestWidth);
  const m = Math.max(0, upstreamSlope);
  
  // Let\"s calculate base width based on slopes if baseWidth is not active,
  // or use baseWidth directly and calculate slopes.
  // Let\"s assume slopes and height and crest width define the baseWidth:
  const B = m * h + b + downstreamSlope * h;
  
  const heel = { id: 'heel', x: originX, y: 0, isHandle: true, handleType: 'heel' as const };
  const crestLeft = { id: 'crest-left', x: originX + m * h, y: h, isHandle: true, handleType: 'crest-left' as const };
  const crestRight = { id: 'crest-right', x: originX + m * h + b, y: h, isHandle: true, handleType: 'crest-right' as const };
  const toe = { id: 'toe', x: originX + B, y: 0, isHandle: true, handleType: 'toe' as const };
  
  return [heel, toe, crestRight, crestLeft]; // CCW order
}

/**
 * Calculates the minimum baseWidth necessary to meet a target Factor of Safety (FOS) against overturning,
 * keeping the current height, crestWidth, upstreamSlope, materials, water levels, and drainage options.
 */
export function findMinBaseWidthForOvertuningFOS(
  geometry: DamGeometry,
  materials: MaterialProperties,
  waterUpstream: number,
  waterDownstream: number,
  drainage: DrainageGallery,
  targetFOS: number = 1.5
): number | null {
  if (geometry.mode !== 'parametric') return null;

  const H = geometry.height ?? 0;
  const b = geometry.crestWidth ?? 0;
  const m = geometry.upstreamSlope ?? 0;

  // Minimum possible base width when downstreamSlope is 0
  const minB = m * H + b;
  const maxB = 150.0; // Reasonable upper boundary

  // Bisection method to find the precise base width
  let low = minB;
  let high = maxB;
  let bestB: number | null = null;

  // Verify that the maximum possible base width meets the target FOS
  const maxGeom = {
    ...geometry,
    baseWidth: maxB,
    downstreamSlope: H > 0 ? (maxB - m * H - b) / H : 0,
    points: generateParametricPoints(H, b, maxB, m, H > 0 ? (maxB - m * H - b) / H : 0),
  };
  const maxRes = performStabilityAnalysis(maxGeom, materials, waterUpstream, waterDownstream, drainage);
  
  if (maxRes.fosOverturning < targetFOS && maxRes.fosOverturning !== Infinity) {
    // Even at maximum baseWidth of 150m, target FOS is not reached
    return null;
  }

  for (let iter = 0; iter < 40; iter++) {
    const mid = (low + high) / 2;
    const computedN = H > 0 ? (mid - m * H - b) / H : 0;
    const testGeom = {
      ...geometry,
      baseWidth: mid,
      downstreamSlope: Math.max(0, computedN),
      points: generateParametricPoints(H, b, mid, m, Math.max(0, computedN)),
    };
    
    const res = performStabilityAnalysis(testGeom, materials, waterUpstream, waterDownstream, drainage);
    
    // If the FOS is Infinity (i.e. zero overturning moment) or >= targetFOS, it is acceptable
    if (res.fosOverturning >= targetFOS || res.fosOverturning === Infinity || isNaN(res.fosOverturning)) {
      bestB = mid;
      high = mid; // Try to search for a smaller base width
    } else {
      low = mid; // Need a larger base width
    }
  }

  return bestB;
}

// Default presets for the application
export const DAM_PRESETS = [
  {
    name: 'Presa de Gravedad Estándar (30m)',
    description: 'Geometría trapezoidal clásica optimizada con talud de 0.8 en la cara de aguas abajo y cara de aguas arriba vertical.',
    geometry: {
      mode: 'parametric',
      height: 30,
      crestWidth: 6,
      baseWidth: 26,
      upstreamSlope: 0,
      downstreamSlope: 0.67 // (26 - 6) / 30 = 0.67
    },
    waterUpstream: 26,
    waterDownstream: 3
  },
  {
    name: 'Presa de Gravedad Alta (50m)',
    description: 'Presa de gran altura con ligera inclinación en la cara de aguas arriba para mayor estabilidad y talud aguas abajo pronunciado.',
    geometry: {
      mode: 'parametric',
      height: 50,
      crestWidth: 8,
      baseWidth: 44,
      upstreamSlope: 0.1, // m = 0.1 (5m horizontal)
      downstreamSlope: 0.62 // (44 - 5 - 8) / 50 = 0.62
    },
    waterUpstream: 45,
    waterDownstream: 4
  },
  {
    name: 'Perfil Triángulo Puro (Pequeña)',
    description: 'Perfil económico de altura moderada, sin ancho de coronamiento apreciable, cara de aguas abajo con talud 0.8.',
    geometry: {
      mode: 'parametric',
      height: 15,
      crestWidth: 1.5,
      baseWidth: 13.5,
      upstreamSlope: 0,
      downstreamSlope: 0.8
    },
    waterUpstream: 12,
    waterDownstream: 0
  }
];
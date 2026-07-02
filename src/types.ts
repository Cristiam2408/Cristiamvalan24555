/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Point2D {
  id: string;
  x: number; // in meters (relative to canvas origin or heel)
  y: number; // in meters (foundation is at y = 0)
  isHandle?: boolean;
  handleType?: 'heel' | 'toe' | 'crest-left' | 'crest-right' | 'free';
}

export interface MaterialProperties {
  gammaConcrete: number; // kN/m³
  gammaWater: number;    // kN/m³
  frictionCoeff: number; // μ (dimensionless)
  cohesion: number;      // kPa (kN/m²)
  allowableBearing: number; // kPa (allowable compression stress)
  allowableTension: number; // kPa (allowable tension stress, usually 0)
  targetFOSOverturning: number; // default 1.5
  targetFOSSliding: number;     // default 1.5
  
  // 3D parameters and uplift modifications
  damLength: number;             // meters (L, total length perpendicular to 2D plane)
  groutCurtainActive: boolean;   // if true, reduces headwater pressure at curtain location
  groutCurtainEfficiency: number;// e.g. 0.50 (50% reduction)
  upliftAreaFactor: number;      // e.g. 1.0 (Coeficiente de área de subpresión)
  soilResistanceBase?: number;   // kg/cm² (Soil Resistance at Base)

  // Cargas adicionales y galería de inspección (Catálogo de variables)
  seismicKh?: number;             // Coeficiente sísmico horizontal (kh)
  seismicKv?: number;             // Coeficiente sísmico vertical (kv)
  westergaardActive?: boolean;    // Activar presión hidrodinámica de Westergaard
  sedimentHeight?: number;        // Altura de sedimentos (h_limo, m)
  sedimentGamma?: number;         // Peso específico del limo (γ_limo, kN/m³)
  sedimentKa?: number;            // Coeficiente de empuje activo del limo (Ka)
  surcharge?: number;             // Sobrecarga en la corona (q, kN/m)
  
  galleryActive?: boolean;        // Si existe un hueco/galería interna en el cuerpo
  galleryWidth?: number;          // Ancho de la galería (m)
  galleryHeight?: number;         // Alto de la galería (m)
  galleryX?: number;              // Distancia horizontal desde el talón (m)
  galleryY?: number;              // Distancia vertical desde la cimentación (m)
}

export interface DrainageGallery {
  active: boolean;
  locationFraction: number; // 0 to 1 of base width from heel (typically 0.2 to 0.3)
  efficiency: number;       // φ factor (typically 0.33, reduces uplift)
}

export interface DamGeometry {
  mode: 'parametric' | 'free';
  // Parametric dimensions (used to generate points when in parametric mode)
  height: number;       // H (meters)
  crestWidth: number;   // b (meters)
  baseWidth: number;    // B (meters)
  upstreamSlope: number; // m (horizontal run / vertical rise)
  downstreamSlope: number; // n (horizontal run / vertical rise)
  // Vertex list (used directly in free mode, synced in parametric mode)
  points: Point2D[];
  // Dynamic additional vertices that can be appended or modified dynamically
  additionalPoints?: Point2D[];
  // Last modified timestamp
  updatedAt?: number;
}

export interface ForceResult {
  name: string;
  fx: number; // kN (horizontal force, right positive)
  fy: number; // kN (vertical force, down positive)
  mx: number; // m (x-coordinate of action line)
  my: number; // m (y-coordinate of action line)
  momentToe: number; // kN·m (moment about the toe, clockwise is positive? No, let's keep stabilizing vs overturning)
  type: 'stabilizing' | 'overturning';
  color: string;
  leverArm?: number; // m (lever arm about the toe)
}

export interface GeometricFigure {
  name: string;
  shape: 'triangle' | 'rectangle';
  base: number;
  height: number;
  area: number;
  weight: number;
  centroidX: number; // relative to toe (la puntera)
  momentAboutToe: number;
}

export interface StabilityResults {
  area: number;           // m²
  volume: number;         // m³ (per 1m slice)
  weight: number;         // kN
  centroid: { x: number; y: number }; // centroid of dam polygon
  baseWidth: number;      // m (distance between heel and toe)
  heelX: number;          // x coordinate of heel
  toeX: number;           // x coordinate of toe
  
  figures: GeometricFigure[];
  
  forces: ForceResult[];
  
  sumVerticalStabilizing: number; // kN
  sumVerticalOverturning: number;   // kN (uplift is usually treated as vertical overturning or subtracted)
  netVerticalForce: number; // kN
  netHorizontalForce: number; // kN
  sumHorizontalStabilizing: number; // kN
  sumHorizontalOverturning: number; // kN
  
  sumMomentStabilizing: number; // kN·m about toe
  sumMomentOverturning: number; // kN·m about toe
  
  fosOverturning: number; // Factor of Safety against Overturning
  fosSliding: number;     // Factor of Safety against Sliding
  
  eccentricity: number;   // m from base center (positive downstream)
  isWithinMiddleThird: boolean;
  
  stressHeel: number;     // kPa (compression is positive)
  stressToe: number;      // kPa (compression is positive)
  stressRedistributed: boolean; // true if tension occurred and stresses were recalculated
  crackedLength: number;  // m (tension cracked length, if any)
  isStressRedistributed: boolean;
  shearStressHeel: number;
  shearStressToe: number;
  L_crack: number;
  
  passesOverturning: boolean;
  passesSliding: boolean;
  passesTension: boolean;
  passesCompression: boolean;
  passesAll: boolean;

  emptyDam: {
    weight: number;
    centroid: { x: number; y: number };
    eccentricity: number;
    isWithinMiddleThird: boolean;
    stressHeel: number;
    stressToe: number;
    stressRedistributed: boolean;
    crackedLength: number;
  };

  // 3D and detailed uplift results
  damLength: number;
  upliftProfile: { x: number; pressure: number; label: string }[];
  upliftDiagramType?: 'triangular' | 'trapezoidal' | 'rectangular' | 'polygonal_broken';
  upliftTotalArea?: number;
  upliftCentroidFromHeel?: number;
  upliftHeelPressure?: number;
  upliftToePressure?: number;
  polygonInertia?: {
    Ixx: number; // about origin
    Iyy: number; // about origin
    I_G: number;  // centroidal moment of inertia of the base (about centroid z-axis/bending axis)
    I_Gxx: number; // about centroid x-axis
    I_Gyy: number; // about centroid y-axis
  };
}

export interface DamPreset {
  name: string;
  description: string;
  geometry: Partial<DamGeometry>;
  waterUpstream: number;
  waterDownstream: number;
}

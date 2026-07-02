/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaterialProperties, DamGeometry, Point2D } from '../types';

export type UnitSystem = 'SI' | 'ST' | 'US';

export interface UnitConfig {
  systemName: string;
  length: string;      // m or ft
  density: string;     // kN/m³, Ton/m³, pcf
  force: string;       // kN, Ton, kips
  moment: string;      // kN·m, Ton·m, kip·ft
  stress: string;      // kPa, Ton/m², ksf
  cohesion: string;    // kPa, Ton/m², ksf
  linearLoad: string;  // kN/m, Ton/m, kips/ft
}

export const UNIT_CONFIGS: Record<UnitSystem, UnitConfig> = {
  SI: {
    systemName: 'S.I. (Sistema Internacional - m, kN, kPa)',
    length: 'm',
    density: 'kN/m³',
    force: 'kN',
    moment: 'kN·m',
    stress: 'kPa',
    cohesion: 'kPa',
    linearLoad: 'kN/m',
  },
  ST: {
    systemName: 'S.T. (Sistema Técnico - m, kgf, kgf/cm²)',
    length: 'm',
    density: 'kgf/m³',
    force: 'kgf',
    moment: 'kgf·m',
    stress: 'kgf/cm²',
    cohesion: 'kgf/cm²',
    linearLoad: 'kgf/m',
  },
  US: {
    systemName: 'U.S. (Sistema Inglés / Imperial - ft, kips, ksf)',
    length: 'ft',
    density: 'pcf (lb/ft³)',
    force: 'kips',
    moment: 'kip·ft',
    stress: 'ksf (kip/ft²)',
    cohesion: 'ksf',
    linearLoad: 'kips/ft',
  }
};

// Hub-and-spoke multipliers from SI to Target System
const SI_TO_TARGET = {
  SI: {
    length: 1.0,
    density: 1.0,
    force: 1.0,
    moment: 1.0,
    stress: 1.0,
    linearLoad: 1.0,
  },
  ST: {
    length: 1.0,
    density: 100.0,
    force: 100.0,
    moment: 100.0,
    stress: 0.01,
    linearLoad: 100.0,
  },
  US: {
    length: 3.28084,
    density: 6.36588,
    force: 0.224809,
    moment: 0.737562,
    stress: 0.0208854,
    linearLoad: 0.0685218,
  }
};

// Convert value from system A to system B by going through SI
export function convertValue(
  value: number,
  type: 'length' | 'density' | 'force' | 'moment' | 'stress' | 'linearLoad',
  from: UnitSystem,
  to: UnitSystem
): number {
  if (from === to) return value;
  // Step 1: Convert from source system to SI (divide by target multiplier)
  const toSIFactor = SI_TO_TARGET[from][type];
  const valueInSI = value / toSIFactor;
  // Step 2: Convert from SI to target system (multiply by target multiplier)
  const toTargetFactor = SI_TO_TARGET[to][type];
  return valueInSI * toTargetFactor;
}

// Convert entire state block
export function convertState(
  from: UnitSystem,
  to: UnitSystem,
  materials: MaterialProperties,
  geometry: DamGeometry,
  waterUpstream: number,
  waterDownstream: number
): {
  materials: MaterialProperties;
  geometry: DamGeometry;
  waterUpstream: number;
  waterDownstream: number;
} {
  if (from === to) {
    return { materials, geometry, waterUpstream, waterDownstream };
  }

  const convLen = (val: number) => convertValue(val, 'length', from, to);
  const convDens = (val: number) => convertValue(val, 'density', from, to);
  const convStress = (val: number) => convertValue(val, 'stress', from, to);
  const convLinear = (val: number) => convertValue(val, 'linearLoad', from, to);

  // Convert Materials
  const nextMaterials: MaterialProperties = {
    ...materials,
    gammaConcrete: parseFloat(convDens(materials.gammaConcrete).toFixed(2)),
    gammaWater: parseFloat(convDens(materials.gammaWater).toFixed(3)),
    cohesion: parseFloat(convStress(materials.cohesion).toFixed(2)),
    allowableBearing: parseFloat(convStress(materials.allowableBearing).toFixed(2)),
    allowableTension: parseFloat(convStress(materials.allowableTension).toFixed(2)),
    damLength: parseFloat(convLen(materials.damLength).toFixed(2)),
  };

  if (materials.soilResistanceBase !== undefined) {
    nextMaterials.soilResistanceBase = parseFloat(convStress(materials.soilResistanceBase).toFixed(2));
  }

  if (materials.sedimentHeight !== undefined) {
    nextMaterials.sedimentHeight = parseFloat(convLen(materials.sedimentHeight).toFixed(2));
  }
  if (materials.sedimentGamma !== undefined) {
    nextMaterials.sedimentGamma = parseFloat(convDens(materials.sedimentGamma).toFixed(2));
  }
  if (materials.surcharge !== undefined) {
    nextMaterials.surcharge = parseFloat(convLinear(materials.surcharge).toFixed(2));
  }

  if (materials.galleryWidth !== undefined) nextMaterials.galleryWidth = parseFloat(convLen(materials.galleryWidth).toFixed(2));
  if (materials.galleryHeight !== undefined) nextMaterials.galleryHeight = parseFloat(convLen(materials.galleryHeight).toFixed(2));
  if (materials.galleryX !== undefined) nextMaterials.galleryX = parseFloat(convLen(materials.galleryX).toFixed(2));
  if (materials.galleryY !== undefined) nextMaterials.galleryY = parseFloat(convLen(materials.galleryY).toFixed(2));

  // Convert Geometry
  const nextPoints: Point2D[] = geometry.points.map(p => ({
    ...p,
    x: parseFloat(convLen(p.x).toFixed(3)),
    y: parseFloat(convLen(p.y).toFixed(3))
  }));

  const nextAdditionalPoints: Point2D[] | undefined = geometry.additionalPoints
    ? geometry.additionalPoints.map(p => ({
        ...p,
        x: parseFloat(convLen(p.x).toFixed(3)),
        y: parseFloat(convLen(p.y).toFixed(3))
      }))
    : undefined;

  const nextGeometry: DamGeometry = {
    ...geometry,
    height: parseFloat(convLen(geometry.height).toFixed(2)),
    crestWidth: parseFloat(convLen(geometry.crestWidth).toFixed(2)),
    baseWidth: parseFloat(convLen(geometry.baseWidth).toFixed(2)),
    points: nextPoints,
    additionalPoints: nextAdditionalPoints
  };

  // Convert water levels
  const nextWaterUpstream = parseFloat(convLen(waterUpstream).toFixed(2));
  const nextWaterDownstream = parseFloat(convLen(waterDownstream).toFixed(2));

  return {
    materials: nextMaterials,
    geometry: nextGeometry,
    waterUpstream: nextWaterUpstream,
    waterDownstream: nextWaterDownstream
  };
}

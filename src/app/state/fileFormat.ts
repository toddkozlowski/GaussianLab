/**
 * .gaussian file format: a plain-text, human-readable serialization of an
 * AppState table layout, for saving and reloading a table setup.
 *
 * The format is intentionally simple (INI-style sections of `key = value`
 * lines) so that a person can open the file in a text editor and understand
 * the table layout - what's on it and roughly where - without loading it
 * into the app. Every [section] other than [table] and [setup] describes
 * one optical component; its header names the component's kind and label
 * for quick scanning, while an `id =` line inside gives the parser a
 * reference it can use even if two components happen to share a label.
 *
 * Only the persisted, user-authored parts of AppState are written - derived
 * fields (beamPath, propagationResult, cavity eigenmodes, optimiser
 * solutions) are recomputed automatically after loading.
 */

import type {
  AppState,
  CardinalDirection,
  ComponentKind,
  GridStandard,
  MirrorOrientation,
  OpticalComponent,
  Point2d,
  TableConfig,
  TargetMode,
} from './schema';
import { DEFAULT_OPTIMISER_STATE } from './defaultState';

export const GAUSSIAN_FILE_EXTENSION = '.gaussian';
const FORMAT_VERSION = 1;

const CARDINAL_DIRECTIONS: CardinalDirection[] = ['right', 'left', 'up', 'down'];
const MIRROR_ORIENTATIONS: MirrorOrientation[] = [45, 135, 225, 315];
const GRID_STANDARDS: GridStandard[] = ['metric', 'imperial'];

const KIND_ORDER: Record<ComponentKind, number> = {
  source: 0,
  mirror_flat: 1,
  lens_thin: 2,
  cavity_fp: 3,
  target: 4,
  beam_stop: 5,
  custom_object: 6,
};

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

interface Section {
  header: string;
  lines: Array<[string, string]>;
}

function formatBool(value: boolean): string {
  return value ? 'true' : 'false';
}

function formatPoint(point: Point2d): string {
  return `${point.x}, ${point.y}`;
}

function sanitizeHeaderLabel(label: string): string {
  const cleaned = label.replace(/[[\]\r\n]/g, ' ').trim();
  return cleaned || 'unnamed';
}

function renderSection(section: Section): string {
  const lines = [`[${section.header}]`];
  for (const [key, value] of section.lines) {
    lines.push(`${key} = ${value}`);
  }
  return lines.join('\n');
}

function serializeComponent(component: OpticalComponent): Section {
  const base: Array<[string, string]> = [
    ['id', component.id],
    ['label', component.label],
    ['position_mm', formatPoint(component.position)],
    ['locked', formatBool(component.locked)],
  ];
  const header = `${component.kind} ${sanitizeHeaderLabel(component.label)}`;

  switch (component.kind) {
    case 'source':
      return {
        header,
        lines: [
          ...base,
          ['direction', component.direction],
          ['waist_radius_mm', String(component.waistRadius)],
          ['waist_offset_mm', String(component.waistOffset)],
          ['wavelength_nm', String(component.wavelength)],
        ],
      };
    case 'mirror_flat':
      return {
        header,
        lines: [...base, ['orientation_deg', String(component.orientation)]],
      };
    case 'lens_thin':
      return {
        header,
        lines: [
          ...base,
          ['focal_length_mm', String(component.focalLength)],
          ['optimiser_can_move', formatBool(component.optimiserCanMove)],
        ],
      };
    case 'cavity_fp':
      return {
        header,
        lines: [
          ...base,
          ['direction', component.direction],
          ['length_mm', String(component.length)],
          ['r1_mm', String(component.r1)],
          ['r2_mm', String(component.r2)],
          ['show_projection', formatBool(component.showProjection)],
        ],
      };
    case 'target':
      return {
        header,
        lines: [
          ...base,
          ['waist_radius_mm', String(component.waistRadius)],
          ['show_projection', formatBool(component.showProjection)],
        ],
      };
    case 'beam_stop':
      return { header, lines: base };
    case 'custom_object':
      return {
        header,
        lines: [
          ...base,
          ['index_of_refraction', String(component.indexOfRefraction)],
          ['thickness_mm', String(component.thickness)],
        ],
      };
  }
}

function serializeTargetMode(targetMode: TargetMode | null): string {
  if (!targetMode) {
    return 'none';
  }
  if (targetMode.kind === 'cavity') {
    return `cavity, ${targetMode.cavityComponentId}`;
  }
  return `target, ${targetMode.targetComponentId}`;
}

export function serializeAppState(state: AppState): string {
  const lines: string[] = [
    '# GaussianLab table file',
    `# format: gaussian-v${FORMAT_VERSION}`,
    `# saved: ${new Date().toISOString()}`,
    '#',
    '# Plain-text description of an optics table layout - safe to read by eye.',
    '# position_mm is (x, y) in millimetres from the table\'s top-left corner.',
    '',
    renderSection({
      header: 'table',
      lines: [
        ['width_mm', String(state.table.width)],
        ['height_mm', String(state.table.height)],
        ['grid_standard', state.table.gridStandard],
        ['snap_to_grid', formatBool(state.table.snapToGrid)],
        ['axis_capture_threshold_mm', String(state.table.axisCaptureThreshold)],
      ],
    }),
    '',
  ];

  const components = Object.values(state.components).sort((a, b) => {
    const kindDiff = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return kindDiff !== 0 ? kindDiff : a.label.localeCompare(b.label);
  });

  for (const component of components) {
    lines.push(renderSection(serializeComponent(component)));
    lines.push('');
  }

  lines.push(
    renderSection({
      header: 'setup',
      lines: [
        ['source_id', state.sourceId ?? ''],
        ['target_mode', serializeTargetMode(state.targetMode)],
      ],
    }),
    '',
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface ParsedSection {
  kind: string;
  header: string;
  values: Map<string, string>;
}

function parseSections(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      const header = sectionMatch[1].trim();
      const kind = header.split(/\s+/)[0];
      current = { kind, header, values: new Map() };
      sections.push(current);
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1 || !current) {
      continue; // ignore stray/malformed lines rather than fail the whole file
    }
    current.values.set(line.slice(0, eqIndex).trim(), line.slice(eqIndex + 1).trim());
  }

  return sections;
}

function requireNumber(section: ParsedSection, key: string): number {
  const raw = section.values.get(key);
  const value = raw === undefined ? NaN : Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Invalid .gaussian file: [${section.header}] is missing a valid ${key}.`);
  }
  return value;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return value.trim().toLowerCase() === 'true';
}

function parsePoint(section: ParsedSection, key: string): Point2d {
  const raw = section.values.get(key);
  const parts = (raw ?? '').split(',').map((p) => Number(p.trim()));
  if (parts.length !== 2 || parts.some((p) => Number.isNaN(p))) {
    throw new Error(`Invalid .gaussian file: [${section.header}] has an invalid ${key}.`);
  }
  return { x: parts[0], y: parts[1] };
}

function parseDirection(value: string | undefined, fallback: CardinalDirection = 'right'): CardinalDirection {
  return CARDINAL_DIRECTIONS.includes(value as CardinalDirection) ? (value as CardinalDirection) : fallback;
}

function parseOrientation(value: string | undefined): MirrorOrientation {
  const num = Number(value);
  return (MIRROR_ORIENTATIONS as number[]).includes(num) ? (num as MirrorOrientation) : 45;
}

function parseGridStandard(value: string | undefined): GridStandard {
  return GRID_STANDARDS.includes(value as GridStandard) ? (value as GridStandard) : 'metric';
}

function parseComponentSection(section: ParsedSection): OpticalComponent | null {
  const id = section.values.get('id');
  const label = section.values.get('label');
  if (!id || !label) {
    return null;
  }

  const position = parsePoint(section, 'position_mm');
  const locked = parseBool(section.values.get('locked'), false);
  const base = { id, label, position, locked };

  switch (section.kind as ComponentKind) {
    case 'source':
      return {
        ...base,
        kind: 'source',
        direction: parseDirection(section.values.get('direction')),
        waistRadius: requireNumber(section, 'waist_radius_mm'),
        waistOffset: requireNumber(section, 'waist_offset_mm'),
        wavelength: requireNumber(section, 'wavelength_nm'),
      };
    case 'mirror_flat':
      return {
        ...base,
        kind: 'mirror_flat',
        orientation: parseOrientation(section.values.get('orientation_deg')),
      };
    case 'lens_thin':
      return {
        ...base,
        kind: 'lens_thin',
        focalLength: requireNumber(section, 'focal_length_mm'),
        optimiserCanMove: parseBool(section.values.get('optimiser_can_move'), true),
        sensitivity: null,
      };
    case 'cavity_fp':
      return {
        ...base,
        kind: 'cavity_fp',
        direction: parseDirection(section.values.get('direction')),
        length: requireNumber(section, 'length_mm'),
        r1: requireNumber(section, 'r1_mm'),
        r2: requireNumber(section, 'r2_mm'),
        eigenmode: null,
        showProjection: parseBool(section.values.get('show_projection'), false),
      };
    case 'target':
      return {
        ...base,
        kind: 'target',
        waistRadius: requireNumber(section, 'waist_radius_mm'),
        showProjection: parseBool(section.values.get('show_projection'), false),
      };
    case 'beam_stop':
      return { ...base, kind: 'beam_stop' };
    case 'custom_object':
      return {
        ...base,
        kind: 'custom_object',
        indexOfRefraction: requireNumber(section, 'index_of_refraction'),
        thickness: requireNumber(section, 'thickness_mm'),
      };
    default:
      return null; // e.g. [table]/[setup], or an unrecognised section kind
  }
}

function parseTargetMode(raw: string | undefined, components: Record<string, OpticalComponent>): TargetMode | null {
  if (!raw || raw.trim() === 'none') {
    return null;
  }

  const [kindRaw, idRaw] = raw.split(',').map((part) => part.trim());
  const component = idRaw ? components[idRaw] : undefined;

  if (kindRaw === 'cavity' && component?.kind === 'cavity_fp') {
    return { kind: 'cavity', cavityComponentId: component.id };
  }
  if (kindRaw === 'target' && component?.kind === 'target') {
    return { kind: 'target', targetComponentId: component.id };
  }
  return null;
}

export function parseAppState(text: string): AppState {
  const sections = parseSections(text);

  const tableSection = sections.find((s) => s.kind === 'table');
  if (!tableSection) {
    throw new Error('Invalid .gaussian file: missing a [table] section.');
  }

  const table: TableConfig = {
    width: requireNumber(tableSection, 'width_mm'),
    height: requireNumber(tableSection, 'height_mm'),
    gridStandard: parseGridStandard(tableSection.values.get('grid_standard')),
    snapToGrid: parseBool(tableSection.values.get('snap_to_grid'), true),
    axisCaptureThreshold: requireNumber(tableSection, 'axis_capture_threshold_mm'),
  };

  const components: Record<string, OpticalComponent> = {};
  for (const section of sections) {
    const component = parseComponentSection(section);
    if (component) {
      components[component.id] = component;
    }
  }

  const setupSection = sections.find((s) => s.kind === 'setup');
  const sourceIdRaw = setupSection?.values.get('source_id');
  const sourceId = sourceIdRaw && components[sourceIdRaw]?.kind === 'source' ? sourceIdRaw : null;
  const targetMode = parseTargetMode(setupSection?.values.get('target_mode'), components);

  return {
    table,
    components,
    sourceId,
    beamPath: null,
    propagationResult: null,
    targetMode,
    optimiser: DEFAULT_OPTIMISER_STATE,
    selectedComponentId: null,
  };
}

import { ChangeDetectorRef, Component, NgZone, inject, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../services/storage.service';
import {
  CourseMarkerColor,
  CustomCourseDefinition,
  CustomCourseLine,
  CustomCourseMarker,
  ReplayObjectArea,
  ReplayObjectKind,
  ReplayObjectStamp,
  ReplayRun,
  Session,
  TrainingContentSelection
} from '../models/session.model';
import { NavComponent } from '../nav/nav';

interface ContentState {
  name: string;
  subOptions: string[];
  selected: boolean;
  selectedSubs: string[];
}

interface DissatisfactionCategory {
  name: string;
  options: string[];
}

type RaceReflectionCategory = 'custom' | 'course-racing' | 'sprint-racing' | 'medal-series';
type RaceReflectionStep = 'categories' | 'courses' | 'setup' | 'preview';
type DriveMode = 'drag' | 'joystick';

interface RaceReflectionOption {
  id: string;
  label: string;
  category: RaceReflectionCategory;
  description: string;
}

interface CoursePoint {
  x: number;
  y: number;
}

interface CourseSnap {
  point: CoursePoint;
  angle: number;
}

interface RaceNote {
  id: string;
  x: number;
  y: number;
  text: string;
  kind?: 'note' | 'maneuver' | 'start' | 'finish';
}

interface StartLineConfig {
  boat: CoursePoint;
  pin: CoursePoint;
}

const START_LINE_MIN_LENGTH = 116;

interface RaceFinishConfig {
  boat: CoursePoint;
  pin: CoursePoint;
}

interface SavedRaceNote extends RaceNote {
  trackIndex: number;
}

interface SavedRaceRun extends ReplayRun {
  track: CoursePoint[];
  notes: SavedRaceNote[];
  objects?: ReplayObjectArea[];
  customCourse?: CustomCourseDefinition;
}

interface StandardCourseHistoryEntry {
  markers: CustomCourseMarker[];
  startLine: CustomCourseLine | null;
  finishLine: CustomCourseLine | null;
  startFinishMerged: boolean;
  objects: ReplayObjectArea[];
}

interface CustomCourseHistoryEntry {
  course: CustomCourseDefinition;
  objects: ReplayObjectArea[];
}

interface ReplayBannerState {
  title: string;
  subtitle: string;
}

interface ObjectToolOption {
  id: ReplayObjectKind;
  label: string;
  fill: string;
  stroke: string;
  brushRadius: number;
  placementSpacing: number;
  renderMode: 'paint' | 'line' | 'icon';
  showOutline: boolean;
}

interface CustomCourseToolOption {
  id: CustomCoursePlacementTool;
  label: string;
}

type CourseDragTargetType = 'marker' | 'start-boat' | 'start-pin' | 'finish-boat' | 'finish-pin' | 'object';
type CourseSelectionType = 'marker' | 'start' | 'finish' | 'object';

interface CourseSelectionState {
  mode: 'custom' | 'standard';
  type: CourseSelectionType;
  markerId?: string;
  lineKind?: 'start' | 'finish';
  objectId?: string;
}

interface MarkerColorOption {
  id: CourseMarkerColor;
  label: string;
  fill: string;
  stroke: string;
  text: string;
}

type CustomHeading = 'left' | 'up-left' | 'up-right' | 'right' | 'down-left' | 'down-right';
type CustomCoursePlacementTool = 'mark' | 'start' | 'finish' | 'gate';

const SAIL_H   = 260;
const APEX_Y   = 13;
const BOT_Y    = 288;
const MAST_X   = 30;
const BOOM_X   = 165;
const SPAN     = BOT_Y - APEX_Y;
const LEECH_DX = BOOM_X - MAST_X;

function battenY(n: number) { return Math.round(APEX_Y + n * SPAN / 5); }
function battenX(y: number) { return Math.round(MAST_X + LEECH_DX * (y - APEX_Y) / SPAN); }

const BATTENS = [1, 2, 3, 4].map(n => {
  const y = battenY(n);
  return { y, x: battenX(y) };
});

const DISSATISFACTION_DEFS: DissatisfactionCategory[] = [
  { name: 'Power',          options: ['zu viel', 'zu wenig'] },
  { name: 'Gabelhöhe',      options: ['zu weit oben', 'zu weit unten'] },
  { name: 'Luisleage',      options: ['zu viel', 'zu wenig'] },
  { name: 'Mastfuß',        options: ['zu weit vorne', 'zu weit hinten'] },
  { name: 'Backwingspacer', options: ['zu viel', 'zu wenig'] },
  { name: 'Trapeztampen',   options: ['zu weit vorne', 'zu weit hinten'] },
  { name: 'Foil Rake',      options: ['zu viel', 'zu wenig'] },
];

const TRAINING_CONTENT_DEFS: { name: string; subOptions: string[] }[] = [
  { name: 'Manöver',          subOptions: ['Halsen', 'Wenden'] },
  { name: 'Rennen',           subOptions: ['Course Racing', 'Slalom'] },
  { name: 'Anpassschläge',    subOptions: [] },
  { name: 'Kurse',            subOptions: ['Am Wind', 'Halb Wind', 'Downwind'] },
  { name: 'Tonnenrundung',    subOptions: [] },
  { name: 'Start Training',   subOptions: ['Am Wind', 'Halb Wind'] },
  { name: 'Pumpen',           subOptions: ['Am Wind', 'Halb Wind', 'Downwind', 'Light Wind'] },
];

const RACE_REFLECTION_OPTIONS: RaceReflectionOption[] = [
  {
    id: 'course-racing-outer',
    label: 'Outer Loop (O2)',
    category: 'course-racing',
    description: 'Offizielle World-Sailing Outer-Trapezoid-Variante fuer Course Racing.'
  },
  {
    id: 'course-racing-inner',
    label: 'Inner Loop (I2)',
    category: 'course-racing',
    description: 'Offizielle World-Sailing Inner-Trapezoid-Variante fuer Course Racing.'
  },
  {
    id: 'course-racing-lg2',
    label: 'Windward (LG2)',
    category: 'course-racing',
    description: 'Windward-Variante fuer Course Racing.'
  },
  {
    id: 'course-racing-lr2',
    label: 'Leeward (LR2)',
    category: 'course-racing',
    description: 'Leeward-Variante fuer Course Racing.'
  },
  {
    id: 'sprint-racing-pd3',
    label: 'PD3',
    category: 'sprint-racing',
    description: 'Downwind-Slalom-Kurs PD3 fuer Sprint Racing.'
  },
  {
    id: 'sprint-racing-sd3',
    label: 'SD3',
    category: 'sprint-racing',
    description: 'Downwind-Slalom-Kurs SD3 fuer Sprint Racing.'
  },
  {
    id: 'sprint-racing-pu4',
    label: 'PU4',
    category: 'sprint-racing',
    description: 'Upwind-Sprint-Kurs PU4 fuer Sprint Racing.'
  },
  {
    id: 'sprint-racing-su4',
    label: 'SU4',
    category: 'sprint-racing',
    description: 'Upwind-Sprint-Kurs SU4 fuer Sprint Racing.'
  },
  {
    id: 'medal-series-pm1',
    label: 'PM1',
    category: 'medal-series',
    description: 'Medal-Series-Kurs PM1.'
  },
  {
    id: 'medal-series-sm1',
    label: 'SM1',
    category: 'medal-series',
    description: 'Medal-Series-Kurs SM1.'
  }
];

const COURSE_VIEWBOX_WIDTH = 260;
const COURSE_VIEWBOX_HEIGHT = 280;
const COURSE_SAIL_WIDTH = 42;
const COURSE_SAIL_HEIGHT = 92;
const COURSE_WORLD_MARGIN_X = 180;
const COURSE_WORLD_MARGIN_Y = 200;
const COURSE_CAMERA_SCALE = 2.35;
const COURSE_CAMERA_SCALE_REPLAY = 1.85;
const COURSE_MIN_ZOOM_FACTOR = 0.65;
const COURSE_CAMERA_CENTER: CoursePoint = { x: 130, y: 168 };
const OBJECT_BRUSH_RADIUS_SCREEN = 25;
const OBJECT_LABEL_WIDTH = 74;
const OBJECT_LABEL_HEIGHT = 28;
const OBJECT_DRAW_FIT_PADDING = 36;
const JOYSTICK_PAD_SIZE = 94;
const JOYSTICK_MAX_RADIUS = 14;
const JOYSTICK_ACTIVATION_DISTANCE = 10;
const JOYSTICK_WORLD_SPEED = 0.78;
const JOYSTICK_RETURN_EASING = 0.2;
const ALT_JOYSTICK_WORLD_SPEED = JOYSTICK_WORLD_SPEED;
const ALT_JOYSTICK_MAX_RADIUS = 11;
const COURSE_ELEMENT_HOLD_MS = 180;
const START_FINISH_MERGE_DISTANCE = 22;
const MERGED_START_FINISH_FINISH_DELAY_MS = 5000;
const RACE_NOTE_TYPING_CHAR_MS = 42;
const RACE_NOTE_TYPING_END_PAUSE_MS = 1260;
const RACE_NOTE_LABEL_WIDTH = 84;
const RACE_NOTE_LABEL_HEIGHT = 42;
const RACE_NOTE_LABEL_WIDTH_WIDE = 126;
const RACE_NOTE_WRAP_THRESHOLD = 18;
const SEVERNE_HGO_IMAGE_URL = 'https://www.severnesails.com/wp-content/uploads/2020/03/020-Severne-HGO-Hyper-glide-sail-v2-sketch-clear-lowres.png';
const CUSTOM_SAIL_ORIGIN: CoursePoint = { x: 130, y: 170 };
const CUSTOM_HEADING_ANGLES: Record<CustomHeading, number> = {
  left: 180,
  'up-left': -140,
  'up-right': -40,
  right: 0,
  'down-left': 140,
  'down-right': 40
};
const CUSTOM_CURSOR_TO_SAIL_RATIO = 1.6;
const CUSTOM_POINTER_ACTIVATION_DISTANCE = 18;
const CUSTOM_DIRECTION_DEADZONE = 10;
const CUSTOM_HALFWIND_HOLD_SLOPE = 0.42;
const CUSTOM_HALFWIND_HOLD_OFFSET = 14;
const CUSTOM_UPWIND_ENTRY_SLOPE = 0.82;
const CUSTOM_UPWIND_ENTRY_OFFSET = 22;
const CUSTOM_DOWNWIND_ENTRY_SLOPE = 0.82;
const CUSTOM_DOWNWIND_ENTRY_OFFSET = 22;
const CUSTOM_SAIL_ANIMATION_EASING = 0.14;
const CUSTOM_SAIL_ANIMATION_MIN_STEP = 0.35;
const CUSTOM_TURN_ENTRY_RADIUS = 26;
const CUSTOM_WINDWARD_ENTRY_BIAS = 8;
const CUSTOM_LEEWARD_ENTRY_BIAS = 6;
const OBJECT_TOOL_OPTIONS: ObjectToolOption[] = [
  { id: 'land', label: 'Land', fill: 'rgba(94, 150, 96, 0.5)', stroke: 'rgba(126, 182, 128, 0.8)', brushRadius: 7, placementSpacing: 10, renderMode: 'line', showOutline: false },
  { id: 'berg', label: 'Berg', fill: 'rgba(126, 130, 140, 0.28)', stroke: 'rgba(168, 174, 189, 0.7)', brushRadius: 11, placementSpacing: 15, renderMode: 'paint', showOutline: false },
  { id: 'hochhaus', label: 'Hochhaus', fill: 'rgba(93, 118, 145, 0.18)', stroke: 'rgba(145, 176, 210, 0.74)', brushRadius: 0, placementSpacing: 24, renderMode: 'icon', showOutline: false },
  { id: 'wolke', label: 'Wolke', fill: 'rgba(181, 190, 207, 0.14)', stroke: 'rgba(224, 231, 241, 0.36)', brushRadius: 13, placementSpacing: 16, renderMode: 'paint', showOutline: false },
  { id: 'boe', label: 'Böe', fill: 'rgba(122, 190, 197, 0.24)', stroke: 'rgba(172, 231, 238, 0.74)', brushRadius: 12, placementSpacing: 18, renderMode: 'paint', showOutline: false },
  { id: 'sonstiges', label: 'Sonstiges', fill: 'rgba(176, 142, 96, 0.22)', stroke: 'rgba(226, 194, 147, 0.72)', brushRadius: 12, placementSpacing: 16, renderMode: 'paint', showOutline: true }
];

const CUSTOM_COURSE_TOOL_OPTIONS: CustomCourseToolOption[] = [
  { id: 'mark', label: 'Tonne' },
  { id: 'start', label: 'Start' },
  { id: 'finish', label: 'Ziel' },
  { id: 'gate', label: 'Gate' }
];

const MARKER_COLOR_OPTIONS: MarkerColorOption[] = [
  { id: 'blue', label: 'Blau', fill: '#2B6BFF', stroke: '#8FB3FF', text: '#F8FBFF' },
  { id: 'yellow', label: 'Gelb', fill: '#F4C430', stroke: '#FFE38A', text: '#161616' },
  { id: 'orange', label: 'Orange', fill: '#F57C2C', stroke: '#FFB179', text: '#151515' },
  { id: 'green', label: 'Grün', fill: '#2EAD65', stroke: '#8EE0AF', text: '#F6FFF9' },
  { id: 'white', label: 'Weiß', fill: '#F3F3F3', stroke: '#FFFFFF', text: '#111111' },
  { id: 'black', label: 'Schwarz', fill: '#121212', stroke: '#8D8D8D', text: '#FFFFFF' }
];

const COURSE_PATHS: Record<string, CoursePoint[]> = {
  'course-racing-outer': [
    { x: 120, y: 218 },
    { x: 120, y: 168 },
    { x: 120, y: 126 },
    { x: 44, y: 64 },
    { x: 184, y: 22 },
    { x: 194, y: 168 },
    { x: 120, y: 168 },
    { x: 164, y: 242 }
  ],
  'course-racing-inner': [
    { x: 126, y: 218 },
    { x: 126, y: 170 },
    { x: 126, y: 120 },
    { x: 130, y: 66 },
    { x: 184, y: 22 },
    { x: 202, y: 168 },
    { x: 92, y: 168 },
    { x: 156, y: 242 }
  ],
  'course-racing-lg2': [
    { x: 122, y: 220 },
    { x: 122, y: 170 },
    { x: 122, y: 82 },
    { x: 122, y: 44 },
    { x: 122, y: 170 },
    { x: 186, y: 198 }
  ],
  'course-racing-lr2': [
    { x: 122, y: 220 },
    { x: 122, y: 170 },
    { x: 122, y: 82 },
    { x: 122, y: 44 },
    { x: 122, y: 170 },
    { x: 186, y: 198 }
  ],
  'sprint-racing-pd3': [
    { x: 30, y: 98 },
    { x: 134, y: 90 },
    { x: 134, y: 206 },
    { x: 228, y: 214 },
    { x: 134, y: 260 }
  ],
  'sprint-racing-sd3': [
    { x: 230, y: 98 },
    { x: 126, y: 90 },
    { x: 126, y: 206 },
    { x: 32, y: 214 },
    { x: 126, y: 260 }
  ],
  'sprint-racing-pu4': [
    { x: 28, y: 84 },
    { x: 120, y: 94 },
    { x: 120, y: 234 },
    { x: 208, y: 234 },
    { x: 208, y: 108 },
    { x: 236, y: 108 }
  ],
  'sprint-racing-su4': [
    { x: 232, y: 84 },
    { x: 140, y: 94 },
    { x: 140, y: 234 },
    { x: 52, y: 234 },
    { x: 52, y: 108 },
    { x: 24, y: 108 }
  ],
  'medal-series-pm1': [
    { x: 130, y: 36 },
    { x: 130, y: 112 },
    { x: 188, y: 172 },
    { x: 74, y: 222 },
    { x: 130, y: 252 }
  ],
  'medal-series-sm1': [
    { x: 130, y: 36 },
    { x: 130, y: 112 },
    { x: 92, y: 176 },
    { x: 168, y: 232 },
    { x: 130, y: 256 }
  ]
};

const RACE_START_LINES: Partial<Record<string, StartLineConfig>> = {
  'sprint-racing-pd3': {
    boat: { x: 30, y: 54 },
    pin: { x: 30, y: 146 }
  },
  'sprint-racing-sd3': {
    boat: { x: 230, y: 54 },
    pin: { x: 230, y: 146 }
  },
  'sprint-racing-pu4': {
    boat: { x: 28, y: 42 },
    pin: { x: 28, y: 132 }
  },
  'sprint-racing-su4': {
    boat: { x: 232, y: 42 },
    pin: { x: 232, y: 132 }
  }
};

const STANDARD_COURSE_MARKERS: Partial<Record<string, Array<{ x: number; y: number; label: string; kind?: 'mark' | 'gate'; groupId?: string; color?: CourseMarkerColor }>>> = {
  'course-racing-outer': [
    { x: 184, y: 22, label: '1', kind: 'mark' },
    { x: 44, y: 64, label: '2', kind: 'mark' },
    { x: 92, y: 176, label: '3S', kind: 'gate', groupId: 'gate-3' },
    { x: 120, y: 176, label: '3P', kind: 'gate', groupId: 'gate-3' }
  ],
  'course-racing-inner': [
    { x: 184, y: 22, label: '1', kind: 'mark' },
    { x: 130, y: 66, label: '2', kind: 'mark' },
    { x: 92, y: 168, label: '3S', kind: 'gate', groupId: 'gate-3' },
    { x: 120, y: 168, label: '3P', kind: 'gate', groupId: 'gate-3' }
  ],
  'course-racing-lg2': [
    { x: 122, y: 44, label: '1', kind: 'mark' },
    { x: 104, y: 170, label: '4S', kind: 'gate', groupId: 'gate-4' },
    { x: 132, y: 170, label: '4P', kind: 'gate', groupId: 'gate-4' }
  ],
  'course-racing-lr2': [
    { x: 122, y: 44, label: '1', kind: 'mark' },
    { x: 104, y: 170, label: '4S', kind: 'gate', groupId: 'gate-4' },
    { x: 132, y: 170, label: '4P', kind: 'gate', groupId: 'gate-4' }
  ],
  'sprint-racing-pd3': [
    { x: 138, y: 84, label: '1', kind: 'mark' },
    { x: 138, y: 202, label: '2', kind: 'mark' },
    { x: 232, y: 218, label: '3', kind: 'mark' }
  ],
  'sprint-racing-sd3': [
    { x: 122, y: 84, label: '1', kind: 'mark' },
    { x: 122, y: 202, label: '2', kind: 'mark' },
    { x: 28, y: 218, label: '3', kind: 'mark' }
  ],
  'sprint-racing-pu4': [
    { x: 120, y: 94, label: '1', kind: 'mark' },
    { x: 120, y: 234, label: '2', kind: 'mark' },
    { x: 208, y: 234, label: '3', kind: 'mark' },
    { x: 208, y: 108, label: '4', kind: 'mark' }
  ],
  'sprint-racing-su4': [
    { x: 140, y: 94, label: '1', kind: 'mark' },
    { x: 140, y: 234, label: '2', kind: 'mark' },
    { x: 52, y: 234, label: '3', kind: 'mark' },
    { x: 52, y: 108, label: '4', kind: 'mark' }
  ],
  'medal-series-pm1': [
    { x: 130, y: 112, label: '1', kind: 'mark' },
    { x: 188, y: 172, label: '2', kind: 'mark' },
    { x: 74, y: 222, label: '3', kind: 'mark' }
  ],
  'medal-series-sm1': [
    { x: 130, y: 112, label: '1', kind: 'mark' },
    { x: 92, y: 176, label: '2', kind: 'mark' },
    { x: 168, y: 232, label: '3', kind: 'mark' }
  ]
};

const RACE_FINISH_LINES: Partial<Record<string, RaceFinishConfig>> = {
  'sprint-racing-pd3': {
    boat: { x: 114, y: 224 },
    pin: { x: 114, y: 276 }
  },
  'sprint-racing-sd3': {
    boat: { x: 146, y: 224 },
    pin: { x: 146, y: 276 }
  },
  'sprint-racing-pu4': {
    boat: { x: 236, y: 42 },
    pin: { x: 236, y: 132 }
  },
  'sprint-racing-su4': {
    boat: { x: 24, y: 42 },
    pin: { x: 24, y: 132 }
  }
};

@Component({
  selector: 'app-session-end',
  standalone: true,
  imports: [FormsModule, NavComponent],
  templateUrl: './session-end.html'
})
export class SessionEndComponent implements OnInit, OnDestroy {
  private storage = inject(StorageService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  session: Session | null = null;
  private returnTo: 'detail' | 'home' = 'home';
  private source: 'analysis' | 'home' = 'home';

  // Date + time
  spotName = '';
  startDate = '';
  startTimeInput = '';
  endTimeInput = '';
  spotModalOpen = false;
  raceReflectionOpen = false;
  replayViewRequested = false;
  settingsMenuOpen = false;
  quickCommentMenuOpen = false;
  coursePickerOpen = false;
  courseSetupOpen = false;
  raceReflectionStep: RaceReflectionStep = 'categories';
  driveMode: DriveMode = 'drag';
  autoManeuverComments = false;
  courseZoomFactor = 1;
  selectedRaceCategory: RaceReflectionCategory | null = null;
  selectedRaceCourse: RaceReflectionOption | null = null;
  selectedCustomCourse: CustomCourseDefinition | null = null;
  standardCourseMarkers: CustomCourseMarker[] = [];
  standardCourseStartLineDraft: CustomCourseLine | null = null;
  standardCourseFinishLineDraft: CustomCourseLine | null = null;
  customCourseNameOpen = false;
  customCourseNameDraft = '';
  customCoursePlacementTool: CustomCoursePlacementTool | null = null;
  standardCoursePlacementTool: CustomCoursePlacementTool | null = null;
  private pendingCustomCourseLineAnchor: CoursePoint | null = null;
  private pendingCustomCourseGateAnchor: CoursePoint | null = null;
  private pendingStandardCourseLineAnchor: CoursePoint | null = null;
  private pendingStandardCourseGateAnchor: CoursePoint | null = null;
  customCoursePanMode = false;
  customCoursePanOffset: CoursePoint = { x: 0, y: 0 };
  customCourseToolMenuOpen = false;
  customObjectToolMenuOpen = false;
  private customCourseBuilderTransform: { scale: number; offsetX: number; offsetY: number } | null = null;
  private customCourseHistory: CustomCourseHistoryEntry[] = [];
  coursePanMode = false;
  coursePanOffset: CoursePoint = { x: 0, y: 0 };
  standardCourseToolMenuOpen = false;
  standardObjectToolMenuOpen = false;
  private courseBuilderTransform: { scale: number; offsetX: number; offsetY: number } | null = null;
  private standardCourseHistory: StandardCourseHistoryEntry[] = [];
  standardCourseStartFinishMerged = false;
  courseSailPosition: CoursePoint = { x: 0, y: 0 };
  courseJoystickOffset: CoursePoint = { x: 0, y: 0 };
  courseSailAngle = 0;
  private courseSailDragAnchor: CoursePoint = { x: 0, y: 0 };
  private courseSailPointerOrigin: CoursePoint | null = null;
  private courseSailPointerActivated = false;
  customSailPosition: CoursePoint = { ...CUSTOM_SAIL_ORIGIN };
  customJoystickOffset: CoursePoint = { x: 0, y: 0 };
  customSailTargetPosition: CoursePoint = { ...CUSTOM_SAIL_ORIGIN };
  customSailAngle = 0;
  private customSailHeading: CustomHeading = 'right';
  private customSailDragAnchor: CoursePoint = { ...CUSTOM_SAIL_ORIGIN };
  private customSailPointerOrigin: CoursePoint | null = null;
  private customSailPointerActivated = false;
  private customSailWaypoints: CoursePoint[] = [];
  private customSailAnimationFrame: number | null = null;
  private joystickAnimationFrame: number | null = null;
  private activeCoursePointerId: number | null = null;
  private activeCoursePanPointerId: number | null = null;
  private activeCourseBounds: DOMRect | null = null;
  private coursePanLastPoint: { x: number; y: number } | null = null;
  private activeCourseElementPointerId: number | null = null;
  private activeCourseElementMode: 'custom' | 'standard' | null = null;
  private activeCourseElementType: CourseDragTargetType | null = null;
  private activeCourseElementMarkerId: string | null = null;
  private activeCourseElementObjectId: string | null = null;
  private activeCourseElementStartPoint: CoursePoint | null = null;
  private activeCourseElementObjectSnapshot: ReplayObjectArea | null = null;
  private activeCourseElementMoved = false;
  private activeCourseElementDragArmed = false;
  private activeCourseElementStartClient: { x: number; y: number } | null = null;
  private activeCourseElementHoldTimer: number | null = null;
  editorSelection: CourseSelectionState | null = null;
  markerColorPaletteOpen = false;
  private pinchStartDistance: number | null = null;
  private pinchStartZoomFactor = 1;
  private activeControlPointerId: number | null = null;
  private activeControlBounds: DOMRect | null = null;
  raceIsActive = false;
  startPositionSelectionActive = false;
  raceStartHint = '';
  raceNoteDraft = '';
  racePlacementDraft = '';
  raceCommentPopupOpen = false;
  regattaNameDraft = '';
  raceNumberDraft = '';
  regattaPickerOpen = false;
  regattaPickerContext: 'setup' | 'replay-edit' = 'setup';
  setupRegattaDropdownOpen = false;
  showNewRegattaNameInput = false;
  newRegattaNameDraft = '';
  similarRegattaMatchName: string | null = null;
  similarRegattaPendingName = '';
  duplicateRaceNumberConfirmOpen = false;
  pendingRaceNotePosition: CoursePoint | null = null;
  private lastInlineNotePromptTrackIndex = -1;
  private raceNotesByPreview: Record<string, RaceNote[]> = {};
  private raceObjectsByPreview: Record<string, ReplayObjectArea[]> = {};
  savedRacesByPreview: Record<string, SavedRaceRun[]> = {};
  private expandedRaceNoteIds = new Set<string>();
  private activeRaceTrack: CoursePoint[] = [];
  private activeRaceNotes: SavedRaceNote[] = [];
  private lastAutoManeuverTrackIndex = -1;
  private lastRaceHorizontalDirection: 'left' | 'right' | null = null;
  driveSpeedPercent = 135;
  private raceStartedAtMs = 0;
  private startNoteAdded = false;
  private finishNoteAdded = false;
  private activeCustomCoursePanPointerId: number | null = null;
  private customCoursePanLastPoint: { x: number; y: number } | null = null;
  finishConfirmOpen = false;
  confirmReplayDelete = false;
  confirmMergeStartFinishOpen = false;
  pendingMergeStartFinishMode: 'custom' | 'standard' | null = null;
  pendingMergeStartFinishLine: CustomCourseLine | null = null;
  playbackRace: SavedRaceRun | null = null;
  playbackPosition: CoursePoint | null = null;
  playbackPaused = false;
  private playbackIndex = 0;
  private currentReplayId: string | null = null;
  private replayGroupNameFromQuery: string | null = null;
  private playbackTimer: number | null = null;
  private playbackAnimationFrame: number | null = null;
  private playbackKeepAliveTimer: number | null = null;
  private playbackSegmentStartTime: number | null = null;
  private playbackSegmentFromPoint: CoursePoint | null = null;
  private playbackRevealNoteIds = new Set<string>();
  private playbackTypedCharCounts: Record<string, number> = {};
  private playbackTypingTimers: number[] = [];
  replayEditOpen = false;
  replayEditRegattaName = '';
  replayEditRaceNumber = '';
  replayEditDate = '';
  playbackRenderNonce = 0;
  replayBanner: ReplayBannerState | null = null;
  private replayBannerTimer: number | null = null;
  objectDrawingTool: ReplayObjectKind | null = null;
  private activeObjectPointerId: number | null = null;
  private activeObjectBounds: DOMRect | null = null;
  private activeObjectSvg: SVGSVGElement | null = null;
  private activeObjectAreaId: string | null = null;
  private lastObjectDrawPoint: CoursePoint | null = null;
  otherObjectNameOpen = false;
  otherObjectNameDraft = '';
  private pendingOtherObjectAreaId: string | null = null;
  private expandedOtherObjectIds = new Set<string>();
  tempSpotName = '';
  tempStartDate = '';
  setupSpotEditOpen = false;
  setupDateEditOpen = false;
  readonly markerColorOptions = MARKER_COLOR_OPTIONS;

  // Training contents
  contentStates: ContentState[] = TRAINING_CONTENT_DEFS.map(def => ({
    name: def.name,
    subOptions: def.subOptions,
    selected: false,
    selectedSubs: []
  }));

  // Backwingspacer (default +1)
  backwingspacer = 1;
  readonly bwsOptions = [0, 0.5, 1];

  // Material setup
  materialSetupSatisfied: boolean | null = null;
  materialSetupReasons: string[] = [];
  readonly dissatisfactionDefs = DISSATISFACTION_DEFS;

  // Wind
  windSpeed = '';
  gustWind = '';

  // Winddreher (optional)
  windDreher = '';

  // Notes
  notes = '';

  // Energy
  energyLevel: number | null = null;

  // Ratings
  windRating = 3;
  sessionRating = 5;

  // Trimm details on main screen
  showLuisInfo = false;
  luisleage = 2.0;
  mastPosition = 50;
  wellenGefuehlt = 3;

  readonly battens = BATTENS;
  readonly sailH = SAIL_H;
  readonly raceReflectionOptions = RACE_REFLECTION_OPTIONS;
  readonly objectToolOptions = OBJECT_TOOL_OPTIONS;
  readonly customCourseToolOptions = CUSTOM_COURSE_TOOL_OPTIONS;
  readonly severneSailImageUrl = SEVERNE_HGO_IMAGE_URL;
  readonly courseSailWidth = COURSE_SAIL_WIDTH;
  readonly courseSailHeight = COURSE_SAIL_HEIGHT;

  ngOnInit() {
    const id = this.route.snapshot.queryParamMap.get('id');
    this.returnTo = this.route.snapshot.queryParamMap.get('returnTo') === 'detail' ? 'detail' : 'home';
    this.source = this.route.snapshot.queryParamMap.get('source') === 'analysis' ? 'analysis' : 'home';
    this.currentReplayId = this.route.snapshot.queryParamMap.get('replayId');
    this.replayGroupNameFromQuery = this.route.snapshot.queryParamMap.get('regatta');
    this.replayViewRequested = !!this.currentReplayId;
    this.session = id
      ? this.storage.getSessions().find(s => s.id === id) ?? null
      : this.storage.getActiveSession();
    if (!this.session) {
      this.router.navigate(['/home']);
      return;
    }
    this.loadSessionValues();
    this.openReplayFromQuery();
  }

  ngOnDestroy() {
    this.stopCustomSailAnimation();
    this.stopRacePlayback();
    this.stopJoystickAnimation();
    this.hideReplayBanner();
  }

  private loadSessionValues() {
    if (!this.session) return;

    const start = new Date(this.session.startTime);
    const end = this.session.endTime ? new Date(this.session.endTime) : new Date();
    this.spotName = this.session.spot || this.storage.getSpot() || '';
    this.startDate = this.formatDateInput(start);
    this.startTimeInput = this.formatTimeInput(start);
    this.endTimeInput = this.formatTimeInput(end);

    this.contentStates = TRAINING_CONTENT_DEFS.map(def => {
      const existing = this.session!.trainingContents?.find(c => c.name === def.name);
      return {
        name: def.name,
        subOptions: def.subOptions,
        selected: !!existing,
        selectedSubs: existing ? [...existing.subSelections] : []
      };
    });

    this.backwingspacer = this.session.backwingspacer ?? 1;
    this.materialSetupSatisfied = this.session.materialSetupSatisfied ?? null;
    this.materialSetupReasons = [...(this.session.materialSetupReasons ?? [])];
    this.energyLevel = this.session.energyLevel ?? null;
    this.windSpeed = this.session.windSpeed != null ? String(this.session.windSpeed) : '';
    this.gustWind = this.session.gustWind != null
      ? String(this.session.gustWind)
      : (this.session.windSpeedFelt != null ? String(this.session.windSpeedFelt) : '');
    this.windDreher = this.session.windDreher ?? '';
    this.notes = this.session.description ?? '';
    this.windRating = this.session.windRating ?? 3;
    this.sessionRating = this.session.sessionRating ?? 5;
    this.luisleage = this.session.trimm?.luisleage ?? 2.0;
    this.mastPosition = this.session.trimm?.mastPosition ?? 50;
    this.wellenGefuehlt = this.session.trimm?.wellenGefuehlt ?? 3;
    this.loadSavedRacesFromSession();
  }

  get formattedStartDate(): string {
    if (!this.startDate) return '';
    const [year, month, day] = this.startDate.split('-');
    if (!year || !month || !day) return '';
    return `${day}.${month}.${year}`;
  }

  private formatDateInput(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatTimeInput(date: Date): string {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }

  private buildDateTime(dateStr: string, timeStr: string): Date | null {
    if (!dateStr || !timeStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    if ([year, month, day, hours, minutes].some(Number.isNaN)) return null;
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }

  /** Parses a single number or "X-Y" range → average. Returns null if invalid. */
  private parseWindValue(v: string): number | null {
    if (!v.trim()) return null;
    const range = v.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
    if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  openSpotModal() {
    this.closeRegattaPicker();
    this.tempSpotName = this.spotName;
    this.tempStartDate = this.startDate;
    this.spotModalOpen = true;
  }

  closeSpotModal() {
    this.spotModalOpen = false;
  }

  openSetupSpotEditor() {
    this.closeRegattaPicker();
    this.setupDateEditOpen = false;
    this.tempSpotName = this.spotName;
    this.setupSpotEditOpen = true;
  }

  openSetupDateEditor() {
    this.closeRegattaPicker();
    this.setupSpotEditOpen = false;
    this.tempStartDate = this.startDate;
    this.setupDateEditOpen = true;
  }

  closeSetupMetaEditors() {
    this.setupSpotEditOpen = false;
    this.setupDateEditOpen = false;
  }

  saveSetupSpotEditor() {
    this.spotName = this.tempSpotName.trim();
    this.persistSpotSelection();
    this.setupSpotEditOpen = false;
  }

  saveSetupDateEditor() {
    this.startDate = this.tempStartDate;
    this.persistSpotSelection();
    this.setupDateEditOpen = false;
  }

  openRaceReflection() {
    this.raceReflectionOpen = true;
    this.settingsMenuOpen = false;
    this.coursePickerOpen = false;
    this.courseSetupOpen = false;
    this.raceReflectionStep = 'categories';
    this.selectedRaceCategory = null;
    this.selectedRaceCourse = null;
    this.selectedCustomCourse = null;
    this.resetRaceReflectionState();
  }

  closeRaceReflection() {
    this.raceReflectionOpen = false;
    this.settingsMenuOpen = false;
    this.coursePickerOpen = false;
    this.courseSetupOpen = false;
    this.selectedCustomCourse = null;
    this.resetRaceReflectionState();
  }

  chooseRaceCategory(category: RaceReflectionCategory) {
    this.settingsMenuOpen = false;
    if (category === 'custom') {
      this.resetRaceReflectionState();
      this.coursePickerOpen = false;
      this.courseSetupOpen = false;
      this.selectedRaceCategory = category;
      this.selectedRaceCourse = null;
      this.selectedCustomCourse = null;
      this.customCoursePlacementTool = null;
      this.pendingCustomCourseLineAnchor = null;
      this.pendingCustomCourseGateAnchor = null;
      this.raceReflectionStep = 'courses';
      return;
    }

    this.resetRaceReflectionState();
    this.selectedRaceCategory = category;
    this.selectedRaceCourse = null;
    this.coursePickerOpen = false;
    this.courseSetupOpen = false;
    this.raceReflectionStep = 'courses';
  }

  chooseRaceCourse(option: RaceReflectionOption) {
    this.settingsMenuOpen = false;
    this.resetRaceReflectionState();
    this.selectedRaceCourse = option;
    this.coursePickerOpen = false;
    this.courseSetupOpen = true;
    this.raceReflectionStep = 'courses';
  }

  chooseCustomCourse(course: CustomCourseDefinition) {
    this.settingsMenuOpen = false;
    this.resetRaceReflectionState();
    this.selectedRaceCategory = 'custom';
    this.selectedRaceCourse = null;
    this.selectedCustomCourse = this.cloneCustomCourse(course);
    this.customCourseHistory = [];
    this.coursePickerOpen = false;
    this.courseSetupOpen = true;
    this.customCoursePlacementTool = null;
    this.customCoursePanMode = false;
    this.customCoursePanOffset = { x: 0, y: 0 };
    this.customCourseToolMenuOpen = false;
    this.customCourseBuilderTransform = null;
    this.pendingCustomCourseLineAnchor = null;
    this.pendingCustomCourseGateAnchor = null;
    this.raceReflectionStep = 'courses';
  }

  backInRaceReflection() {
    if ((this.replayViewRequested || !!this.playbackRace) && this.source === 'analysis') {
      this.router.navigate(['/auswertung'], {
        queryParams: {
          view: 'replays',
          ...(this.replayGroupNameFromQuery ? { regatta: this.replayGroupNameFromQuery } : {})
        }
      });
      return;
    }

    this.settingsMenuOpen = false;
    this.closeSetupMetaEditors();
    if (this.showNewRegattaNameInput) {
      this.closeNewRegattaNameInput();
      return;
    }

    if (this.customCourseNameOpen) {
      this.closeCustomCourseNamePrompt();
      return;
    }

    if (this.regattaPickerOpen) {
      this.closeRegattaPicker();
      return;
    }

    if (this.courseSetupOpen) {
      this.courseSetupOpen = false;
      if (this.selectedRaceCategory === 'custom') {
        this.selectedCustomCourse = null;
      }
      this.raceReflectionStep = 'courses';
      return;
    }

    if (this.coursePickerOpen) {
      this.coursePickerOpen = false;
      this.selectedRaceCategory = null;
      return;
    }

    if (this.raceReflectionStep === 'setup') {
      this.selectedRaceCourse = null;
      this.raceReflectionStep = 'courses';
      return;
    }

    if (this.raceReflectionStep === 'preview' && this.selectedRaceCategory && this.selectedRaceCategory !== 'custom') {
      this.raceReflectionStep = 'courses';
      this.selectedRaceCourse = null;
      this.resetRaceReflectionState();
      return;
    }

    if (this.raceReflectionStep === 'preview') {
      if (this.selectedRaceCategory === 'custom') {
        this.raceReflectionStep = 'courses';
        this.customCoursePlacementTool = null;
        this.pendingCustomCourseLineAnchor = null;
        this.pendingCustomCourseGateAnchor = null;
        this.resetRaceReflectionState();
      } else {
        this.raceReflectionStep = 'categories';
        this.selectedRaceCategory = null;
        this.selectedRaceCourse = null;
        this.resetRaceReflectionState();
      }
      return;
    }

    if (this.raceReflectionStep === 'courses') {
      this.raceReflectionStep = 'categories';
      this.selectedRaceCategory = null;
      this.selectedCustomCourse = null;
      this.resetRaceReflectionState();
      return;
    }

    this.closeRaceReflection();
  }

  get visibleRaceReflectionOptions(): RaceReflectionOption[] {
    if (!this.selectedRaceCategory) return [];
    return this.raceReflectionOptions.filter(option => option.category === this.selectedRaceCategory);
  }

  get customCourses(): CustomCourseDefinition[] {
    return this.storage.getCustomCourses()
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  get hasCustomCourseSelection(): boolean {
    return !!this.selectedCustomCourse;
  }

  get isCustomCoursePreview(): boolean {
    return this.selectedRaceCategory === 'custom' && this.raceReflectionStep === 'preview' && !!this.selectedCustomCourse;
  }

  get canOpenCustomCoursePreview(): boolean {
    return this.hasReplayAssignment && !!this.selectedCustomCourse;
  }

  get canUndoCustomCourseAction(): boolean {
    return this.customCourseHistory.length > 0;
  }

  get canUndoStandardCourseAction(): boolean {
    return this.standardCourseHistory.length > 0;
  }

  get hasEditorSelection(): boolean {
    return !!this.editorSelection;
  }

  get canEditSelectedMarkerColor(): boolean {
    return this.editorSelection?.type === 'marker';
  }

  get currentCustomMarkers(): CustomCourseMarker[] {
    return this.selectedCustomCourse?.markers ?? [];
  }

  get currentStandardMarkers(): CustomCourseMarker[] {
    return this.standardCourseMarkers;
  }

  get currentCourseMarkers(): CustomCourseMarker[] {
    return this.selectedCustomCourse ? this.currentCustomMarkers : this.currentStandardMarkers;
  }

  get selectedMarkerColor(): CourseMarkerColor | null {
    if (this.editorSelection?.type !== 'marker') return null;
    const marker = this.getSelectedMarker();
    return marker ? this.getResolvedMarkerColor(marker) : null;
  }

  get customCoursePathPoints(): string {
    return this.currentCustomMarkers.map(marker => `${marker.x},${marker.y}`).join(' ');
  }

  get selectedCustomStartLine(): StartLineConfig | null {
    if (!this.selectedCustomCourse?.startLine) return null;
    return this.normalizeStartLineLength({
      boat: { ...this.selectedCustomCourse.startLine.boat },
      pin: { ...this.selectedCustomCourse.startLine.pin }
    });
  }

  get selectedCustomFinishLine(): RaceFinishConfig | null {
    if (!this.selectedCustomCourse?.finishLine) return null;
    return {
      boat: { ...this.selectedCustomCourse.finishLine.boat },
      pin: { ...this.selectedCustomCourse.finishLine.pin }
    };
  }

  get showCourseSail(): boolean {
    return !!this.selectedRaceCourse
      && !!COURSE_PATHS[this.selectedRaceCourse.id]
      && (!!this.playbackRace || this.raceIsActive || this.startPositionSelectionActive);
  }

  get showInlineRaceNoteComposer(): boolean {
    return this.raceIsActive && !!this.pendingRaceNotePosition && !this.playbackRace && !this.finishConfirmOpen;
  }

  get hasActiveCourseElementInteraction(): boolean {
    return this.activeCourseElementPointerId !== null;
  }

  get isDragDriveMode(): boolean {
    return true;
  }

  get isJoystickDriveMode(): boolean {
    return true;
  }

  get showCustomSail(): boolean {
    return this.isCustomCoursePreview && (!!this.playbackRace || this.raceIsActive || this.startPositionSelectionActive);
  }

  get canEditReplay(): boolean {
    return !!this.playbackRace && !!this.currentReplayId && !!this.session;
  }

  get playbackPauseLabel(): string {
    return this.playbackPaused ? 'Weiter' : 'Pause';
  }

  get currentRaceNotes(): RaceNote[] {
    return this.currentRacePreviewKey ? (this.raceNotesByPreview[this.currentRacePreviewKey] ?? []) : [];
  }

  get displayedRaceNotes(): RaceNote[] {
    if (!this.playbackRace) return this.currentRaceNotes;
    return this.playbackRace.notes.filter(note => note.trackIndex <= this.playbackIndex);
  }

  get currentRaceObjects(): ReplayObjectArea[] {
    if (this.playbackRace) return this.playbackRace.objects ?? [];
    return this.currentRacePreviewKey ? (this.raceObjectsByPreview[this.currentRacePreviewKey] ?? []) : [];
  }

  get canStartRace(): boolean {
    if (this.selectedCustomCourse) {
      return !this.raceIsActive && this.hasReplayAssignment && !!this.selectedCustomStartLine;
    }
    return !this.raceIsActive && this.hasReplayAssignment && !!this.selectedCourseStartLine;
  }

  get showRaceAction(): boolean {
    if (this.selectedCustomCourse && this.isCustomCoursePreview && !this.playbackRace) {
      return true;
    }
    return !!(this.selectedCourseStartLine && (this.selectedRaceCourse || this.selectedCustomCourse));
  }

  get isObjectDrawingMode(): boolean {
    return !!this.objectDrawingTool && !!(this.selectedRaceCourse || this.selectedCustomCourse) && !this.playbackRace;
  }

  get activeObjectToolOption(): ObjectToolOption | null {
    if (!this.objectDrawingTool) return null;
    return this.objectToolOptions.find(option => option.id === this.objectDrawingTool) ?? null;
  }

  get raceActionLabel(): string {
    if (!this.raceIsActive && !this.startPositionSelectionActive) {
      return 'Startposition wählen';
    }
    return this.raceIsActive ? 'Race beenden' : 'Race starten';
  }

  get showSeparateFinishLine(): boolean {
    if (this.selectedCustomCourse) {
      return !this.selectedCustomCourse.startFinishMerged;
    }
    if (this.selectedRaceCourse) {
      return !this.standardCourseStartFinishMerged;
    }
    return true;
  }

  get showCustomCourseBuilderUi(): boolean {
    return this.isCustomCoursePreview && !this.playbackRace && !this.raceIsActive && !this.startPositionSelectionActive && !this.isObjectDrawingMode;
  }

  get showStandardCourseBuilderUi(): boolean {
    return !!this.selectedRaceCourse && !this.playbackRace && !this.raceIsActive && !this.startPositionSelectionActive && !this.isObjectDrawingMode;
  }

  get existingRegattaNames(): string[] {
    const orderedNames: string[] = [];
    const seen = new Set<string>();
    const sessions = this.storage.getSessions();
    for (let sessionIndex = sessions.length - 1; sessionIndex >= 0; sessionIndex -= 1) {
      const session = sessions[sessionIndex];
      const replays = session.replays ?? [];
      for (let replayIndex = replays.length - 1; replayIndex >= 0; replayIndex -= 1) {
        const replay = replays[replayIndex];
        const name = replay.regattaName?.trim();
        const spot = session.spot?.trim() || '';
        if (!name) continue;
        const key = this.buildRegattaOptionKey(name, spot);
        if (seen.has(key)) continue;
        seen.add(key);
        orderedNames.push(key);
      }
    }
    return orderedNames;
  }

  get existingRegattaOptions(): Array<{ key: string; name: string; spot: string; label: string }> {
    return this.existingRegattaNames.map(key => {
      const [name, ...rest] = key.split('__');
      const spot = rest.join('__');
      return {
        key,
        name,
        spot,
        label: spot ? `${name} · ${spot}` : name
      };
    });
  }

  get resolvedRegattaName(): string {
    return this.regattaNameDraft.trim();
  }

  get resolvedReplayEditRegattaName(): string {
    return this.replayEditRegattaName.trim();
  }

  get selectedRaceCategoryLabel(): string {
    switch (this.selectedRaceCategory) {
      case 'course-racing':
        return 'Course Racing';
      case 'sprint-racing':
        return 'Sprint Racing';
      case 'medal-series':
        return 'Medal Series';
      case 'custom':
        return 'Eigener Kurs';
      default:
        return 'Rennen Reflexion';
    }
  }

  get hasReplayAssignment(): boolean {
    return !!this.resolvedRegattaName;
  }

  get raceNoteRows(): number {
    const draft = this.raceNoteDraft.trim();
    const lineCount = draft ? draft.split('\n').length : 1;
    const estimatedRows = Math.ceil(draft.length / 28);
    return Math.max(2, Math.min(4, Math.max(lineCount, estimatedRows)));
  }

  get savedRaces(): SavedRaceRun[] {
    return this.currentRacePreviewKey ? (this.savedRacesByPreview[this.currentRacePreviewKey] ?? []) : [];
  }

  openRegattaPicker(context: 'setup' | 'replay-edit' = 'setup') {
    if (context === 'setup') {
      this.closeSetupMetaEditors();
      this.setupRegattaDropdownOpen = !this.setupRegattaDropdownOpen;
      this.regattaPickerOpen = false;
      this.regattaPickerContext = 'setup';
      this.closeNewRegattaNameInput();
      return;
    }
    if (this.regattaPickerOpen && this.regattaPickerContext === context) {
      this.closeRegattaPicker();
      return;
    }
    this.regattaPickerContext = context;
    this.regattaPickerOpen = true;
    this.closeNewRegattaNameInput();
  }

  closeRegattaPicker() {
    this.regattaPickerOpen = false;
    this.regattaPickerContext = 'setup';
    this.setupRegattaDropdownOpen = false;
    this.closeNewRegattaNameInput();
  }

  closeNewRegattaNameInput() {
    this.showNewRegattaNameInput = false;
    this.newRegattaNameDraft = '';
    this.similarRegattaMatchName = null;
    this.similarRegattaPendingName = '';
  }

  startNewRegattaName() {
    this.similarRegattaMatchName = null;
    this.similarRegattaPendingName = '';
    this.showNewRegattaNameInput = true;
    this.newRegattaNameDraft = '';
  }

  confirmNewRegattaName() {
    const trimmed = this.newRegattaNameDraft.trim();
    if (!trimmed) return;
    const similar = this.findSimilarExistingRegattaName(trimmed);
    if (similar) {
      this.similarRegattaPendingName = trimmed;
      this.similarRegattaMatchName = similar;
      return;
    }
    this.setActiveRegattaName(trimmed);
    if (this.regattaPickerContext === 'replay-edit') {
      this.closeRegattaPicker();
      return;
    }
    this.setupRegattaDropdownOpen = false;
    this.closeNewRegattaNameInput();
  }

  useSimilarExistingRegattaName() {
    if (!this.similarRegattaMatchName) return;
    this.setActiveRegattaName(this.similarRegattaMatchName);
    if (this.regattaPickerContext === 'setup') {
      this.applyStoredRegattaSpot(this.similarRegattaMatchName);
    }
    this.closeRegattaPicker();
  }

  keepNewSimilarRegattaName() {
    if (!this.similarRegattaPendingName) return;
    this.setActiveRegattaName(this.similarRegattaPendingName);
    if (this.regattaPickerContext === 'replay-edit') {
      this.closeRegattaPicker();
      return;
    }
    this.setupRegattaDropdownOpen = false;
    this.closeNewRegattaNameInput();
  }

  setRaceNumberDraft(raw: string) {
    this.raceNumberDraft = this.sanitizeRaceNumberInput(raw);
  }

  setReplayEditRaceNumber(raw: string) {
    this.replayEditRaceNumber = this.sanitizeRaceNumberInput(raw);
  }

  autoResizeNotes(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    target.style.height = '0px';
    target.style.height = `${Math.max(target.scrollHeight, 110)}px`;
  }

  openCourseSetupPreview() {
    if (!this.hasReplayAssignment || (!this.selectedRaceCourse && !this.selectedCustomCourse)) return;
    if (this.setupSpotEditOpen) {
      this.saveSetupSpotEditor();
    }
    if (this.setupDateEditOpen) {
      this.saveSetupDateEditor();
    }
    if (this.shouldConfirmDuplicateRaceNumber()) {
      this.duplicateRaceNumberConfirmOpen = true;
      return;
    }
    this.proceedToCourseSetupPreview();
  }

  continueWithDuplicateRaceNumber() {
    this.duplicateRaceNumberConfirmOpen = false;
    this.proceedToCourseSetupPreview();
  }

  cancelDuplicateRaceNumber() {
    this.duplicateRaceNumberConfirmOpen = false;
  }

  setCourseZoomFactor(raw: string | number) {
    const parsed = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    this.courseZoomFactor = Math.min(1.35, Math.max(0.65, parsed));
  }

  openCustomCourseNamePrompt() {
    this.customCourseNameDraft = '';
    this.customCourseNameOpen = true;
  }

  closeCustomCourseNamePrompt() {
    this.customCourseNameOpen = false;
    this.customCourseNameDraft = '';
  }

  confirmCustomCourseName() {
    const trimmed = this.customCourseNameDraft.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const course: CustomCourseDefinition = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      markers: [],
      startLine: null,
      finishLine: null,
      startFinishMerged: false
    };
    this.storage.saveCustomCourse(course);
    this.closeCustomCourseNamePrompt();
    this.chooseCustomCourse(course);
  }

  startCustomCoursePlacement(tool: CustomCoursePlacementTool) {
    if (!this.selectedCustomCourse || this.playbackRace || this.raceIsActive) return;
    this.finishObjectDrawing();
    this.customCourseToolMenuOpen = false;
    this.customObjectToolMenuOpen = false;
    this.customCoursePlacementTool = this.customCoursePlacementTool === tool ? null : tool;
    this.pendingCustomCourseLineAnchor = null;
    this.pendingCustomCourseGateAnchor = null;
  }

  toggleCustomCourseToolMenu() {
    if (!this.selectedCustomCourse || this.playbackRace || this.raceIsActive) return;
    this.finishObjectDrawing();
    this.customObjectToolMenuOpen = false;
    this.customCourseToolMenuOpen = !this.customCourseToolMenuOpen;
  }

  toggleCustomObjectToolMenu() {
    if (!this.selectedCustomCourse || this.playbackRace || this.raceIsActive) return;
    this.customCourseToolMenuOpen = false;
    this.customObjectToolMenuOpen = !this.customObjectToolMenuOpen;
  }

  undoCustomCourseAction() {
    if (!this.customCourseHistory.length) return;
    const previous = this.customCourseHistory.pop();
    if (!previous) return;
    this.pendingCustomCourseLineAnchor = null;
    this.pendingCustomCourseGateAnchor = null;
    this.clearEditorSelection();
    this.selectedCustomCourse = previous.course;
    if (this.currentRacePreviewKey) {
      this.raceObjectsByPreview[this.currentRacePreviewKey] = this.cloneReplayObjects(previous.objects);
    }
    this.persistSelectedCustomCourse();
  }

  clearCustomCourseCourseElements() {
    if (!this.selectedCustomCourse) return;
    this.pushCustomCourseHistory();
    this.selectedCustomCourse = {
      ...this.selectedCustomCourse,
      markers: [],
      startLine: null,
      finishLine: null,
      startFinishMerged: false
    };
    if (this.currentRacePreviewKey) {
      this.raceObjectsByPreview[this.currentRacePreviewKey] = [];
    }
    this.clearEditorSelection();
    this.persistSelectedCustomCourse();
  }

  onCustomCourseCanvasPointerDown(event: PointerEvent) {
    if (!this.customCoursePlacementTool || !this.selectedCustomCourse || this.playbackRace || this.raceIsActive) return;
    const target = event.currentTarget as SVGGraphicsElement | null;
    const svg = target?.ownerSVGElement;
    if (!target || !svg) return;
    this.activeCourseBounds = svg.getBoundingClientRect();
    const point = this.clampCoursePoint(this.getCustomCoursePointFromPointer(event, svg));
    this.placeCustomCourseElement(point);
    event.preventDefault();
  }

  startObjectDrawing(kind: ReplayObjectKind) {
    if ((!this.selectedRaceCourse && !this.selectedCustomCourse) || this.playbackRace) return;
    if (this.selectedCustomCourse && this.raceIsActive) return;
    this.settingsMenuOpen = false;
    this.standardCourseToolMenuOpen = false;
    this.standardObjectToolMenuOpen = false;
    this.customObjectToolMenuOpen = false;
    this.customCoursePlacementTool = null;
    this.standardCoursePlacementTool = null;
    this.pendingCustomCourseLineAnchor = null;
    this.pendingCustomCourseGateAnchor = null;
    this.pendingStandardCourseLineAnchor = null;
    this.pendingStandardCourseGateAnchor = null;
    this.clearEditorSelection();
    this.objectDrawingTool = kind;
    this.activeObjectPointerId = null;
    this.activeObjectBounds = null;
    this.activeObjectAreaId = null;
    this.lastObjectDrawPoint = null;
    this.ensureCurrentRaceObjects();
  }

  finishObjectDrawing() {
    this.objectDrawingTool = null;
    this.activeObjectPointerId = null;
    this.activeObjectBounds = null;
    this.activeObjectSvg = null;
    this.activeObjectAreaId = null;
    this.lastObjectDrawPoint = null;
  }

  private pushObjectHistoryForActiveCourse() {
    if (this.selectedCustomCourse) {
      this.pushCustomCourseHistory();
      return;
    }
    if (this.selectedRaceCourse) {
      this.pushStandardCourseHistory();
    }
  }

  onCustomCoursePanPointerDown(event: PointerEvent) {
    if (!this.selectedCustomCourse || this.playbackRace || this.raceIsActive || this.isObjectDrawingMode || this.customCoursePlacementTool) return;
    if ((event as PointerEvent).isPrimary === false) return;
    this.activeCustomCoursePanPointerId = event.pointerId;
    const currentTarget = event.currentTarget as SVGGraphicsElement | SVGSVGElement | null;
    const svg = currentTarget instanceof SVGSVGElement ? currentTarget : currentTarget?.ownerSVGElement;
    this.activeCourseBounds = svg?.getBoundingClientRect() ?? null;
    this.customCoursePanLastPoint = { x: event.clientX, y: event.clientY };
    currentTarget?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  onCustomCoursePanPointerMove(event: PointerEvent) {
    if (this.activeCustomCoursePanPointerId !== event.pointerId || !this.activeCourseBounds || !this.customCoursePanLastPoint) return;
    const deltaX = ((event.clientX - this.customCoursePanLastPoint.x) / this.activeCourseBounds.width) * COURSE_VIEWBOX_WIDTH;
    const deltaY = ((event.clientY - this.customCoursePanLastPoint.y) / this.activeCourseBounds.height) * COURSE_VIEWBOX_HEIGHT;
    this.customCoursePanOffset = {
      x: this.customCoursePanOffset.x + deltaX,
      y: this.customCoursePanOffset.y + deltaY
    };
    this.customCoursePanLastPoint = { x: event.clientX, y: event.clientY };
  }

  onCustomCoursePanPointerUp(event: PointerEvent) {
    if (this.activeCustomCoursePanPointerId !== event.pointerId) return;
    this.activeCustomCoursePanPointerId = null;
    this.customCoursePanLastPoint = null;
    this.activeCourseBounds = null;
    (event.currentTarget as SVGGraphicsElement | SVGSVGElement | null)?.releasePointerCapture?.(event.pointerId);
  }

  beginCourseElementInteraction(
    event: PointerEvent,
    mode: 'custom' | 'standard',
    type: CourseDragTargetType,
    markerId?: string
  ) {
    const target = event.currentTarget as SVGGraphicsElement | null;
    const svg = target?.ownerSVGElement;
    if (!target || !svg) return;
    const selection = this.buildSelectionForInteraction(mode, type, markerId ?? this.extractObjectIdFromEventTarget(event));
    const alreadySelected = this.isSameSelection(this.editorSelection, selection);
    if (mode === 'custom') {
      if (!this.selectedCustomCourse || this.playbackRace || this.raceIsActive || this.isObjectDrawingMode || this.customCoursePlacementTool) return;
    } else {
      if (!this.selectedRaceCourse || this.playbackRace || this.raceIsActive || this.isObjectDrawingMode || this.standardCoursePlacementTool) return;
    }
    if (!alreadySelected) {
      this.setEditorSelection(selection);
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    if (mode === 'custom') {
      this.pushCustomCourseHistory();
    } else {
      this.pushStandardCourseHistory();
    }
    this.activeCourseBounds = svg.getBoundingClientRect();
    this.activeCourseElementPointerId = event.pointerId;
    this.activeCourseElementMode = mode;
    this.activeCourseElementType = type;
    this.activeCourseElementMarkerId = markerId ?? null;
    this.activeCourseElementObjectId = type === 'object' ? (selection?.objectId ?? null) : null;
    this.activeCourseElementStartPoint = this.clampCoursePoint(this.getCoursePointFromPointer(event));
    this.activeCourseElementObjectSnapshot = type === 'object'
      ? (this.getSelectedObjectArea() ? this.cloneReplayObjects([this.getSelectedObjectArea()!])[0] : null)
      : null;
    this.activeCourseElementMoved = false;
    this.activeCourseElementDragArmed = false;
    this.activeCourseElementStartClient = { x: event.clientX, y: event.clientY };
    this.clearCourseElementHoldTimer();
    this.activeCourseElementHoldTimer = window.setTimeout(() => {
      this.activeCourseElementDragArmed = true;
      this.activeCourseElementHoldTimer = null;
    }, COURSE_ELEMENT_HOLD_MS);
    target.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  onCourseElementPointerMove(event: PointerEvent) {
    if (this.activeCourseElementPointerId !== event.pointerId || !this.activeCourseElementMode || !this.activeCourseElementType) return;
    const point = this.clampCoursePoint(this.getCoursePointFromPointer(event));
    const startClient = this.activeCourseElementStartClient;
    if (!this.activeCourseElementDragArmed) return;
    if (startClient && !this.activeCourseElementMoved) {
      const movedDistance = Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y);
      if (movedDistance > 4) {
        this.activeCourseElementMoved = true;
      }
    }
    if (!this.activeCourseElementMoved) return;
    this.updateDraggedCourseElement(point);
  }

  onCourseElementPointerUp(event: PointerEvent) {
    if (this.activeCourseElementPointerId !== event.pointerId || !this.activeCourseElementMode || !this.activeCourseElementType) return;
    const target = event.currentTarget as SVGGraphicsElement | null;
    const mode = this.activeCourseElementMode;
    const type = this.activeCourseElementType;
    const moved = this.activeCourseElementMoved;
    this.clearCourseElementHoldTimer();
    this.activeCourseElementPointerId = null;
    this.activeCourseElementMode = null;
    this.activeCourseElementType = null;
    this.activeCourseElementMarkerId = null;
    this.activeCourseElementObjectId = null;
    this.activeCourseElementStartPoint = null;
    this.activeCourseElementObjectSnapshot = null;
    this.activeCourseElementStartClient = null;
    this.activeCourseElementMoved = false;
    this.activeCourseElementDragArmed = false;
    target?.releasePointerCapture?.(event.pointerId);
    if (moved) {
      if (type === 'finish-boat' || type === 'finish-pin') {
        const finishLine = mode === 'custom' ? this.selectedCustomFinishLine : this.standardCourseFinishLineDraft;
        if (finishLine && this.shouldOfferDraggedFinishMerge(type, finishLine)) {
          this.pendingMergeStartFinishMode = mode;
          this.pendingMergeStartFinishLine = {
            boat: { ...finishLine.boat },
            pin: { ...finishLine.pin }
          };
          this.confirmMergeStartFinishOpen = true;
        }
      }
      return;
    }
  }

  cancelOtherObjectName() {
    if (this.pendingOtherObjectAreaId && this.currentRacePreviewKey) {
      this.raceObjectsByPreview[this.currentRacePreviewKey] = (this.raceObjectsByPreview[this.currentRacePreviewKey] ?? [])
        .filter(area => area.id !== this.pendingOtherObjectAreaId);
    }
    this.closeOtherObjectName();
    this.cdr.detectChanges();
  }

  saveOtherObjectName() {
    const label = this.otherObjectNameDraft.trim();
    if (!label || !this.pendingOtherObjectAreaId || !this.currentRacePreviewKey) return;
    const area = (this.raceObjectsByPreview[this.currentRacePreviewKey] ?? [])
      .find(entry => entry.id === this.pendingOtherObjectAreaId);
    if (!area) return;
    area.label = label;
    this.expandedOtherObjectIds.add(area.id);
    this.closeOtherObjectName();
    this.playbackRenderNonce += 1;
    this.cdr.detectChanges();
  }

  toggleOtherObjectLabel(areaId: string) {
    if (this.expandedOtherObjectIds.has(areaId)) {
      this.expandedOtherObjectIds.delete(areaId);
    } else {
      this.expandedOtherObjectIds.add(areaId);
    }
  }

  removeLastObjectArea() {
    if (!this.currentRacePreviewKey) return;
    const areas = this.raceObjectsByPreview[this.currentRacePreviewKey] ?? [];
    if (areas.length === 0) return;
    this.pushObjectHistoryForActiveCourse();
    this.raceObjectsByPreview[this.currentRacePreviewKey] = areas.slice(0, -1);
    this.cdr.detectChanges();
  }

  private pushStandardCourseHistory() {
    this.standardCourseHistory.push({
      markers: this.standardCourseMarkers.map(marker => ({ ...marker })),
      startLine: this.standardCourseStartLineDraft
        ? {
          boat: { ...this.standardCourseStartLineDraft.boat },
          pin: { ...this.standardCourseStartLineDraft.pin }
        }
        : null,
      startFinishMerged: this.standardCourseStartFinishMerged,
      finishLine: this.standardCourseFinishLineDraft
        ? {
          boat: { ...this.standardCourseFinishLineDraft.boat },
          pin: { ...this.standardCourseFinishLineDraft.pin }
        }
        : null,
      objects: this.cloneReplayObjects(this.currentRaceObjects)
    });
    if (this.standardCourseHistory.length > 40) {
      this.standardCourseHistory.shift();
    }
  }

  private buildStandardCourseDraft() {
    if (!this.selectedRaceCourse) return;
    const markerDefs = STANDARD_COURSE_MARKERS[this.selectedRaceCourse.id] ?? [];
    this.standardCourseMarkers = markerDefs.map((marker, index) => ({
      id: marker.groupId ? `${marker.groupId}-${index}` : `${this.selectedRaceCourse!.id}-${index}`,
      x: marker.x,
      y: marker.y,
      label: marker.label,
      kind: marker.kind ?? 'mark',
      groupId: marker.groupId,
      color: marker.color ?? this.getDefaultMarkerColor()
    }));
    const startLine = RACE_START_LINES[this.selectedRaceCourse.id];
    const finishLine = RACE_FINISH_LINES[this.selectedRaceCourse.id];
    this.standardCourseStartLineDraft = startLine
      ? { boat: { ...startLine.boat }, pin: { ...startLine.pin } }
      : null;
    this.standardCourseFinishLineDraft = finishLine
      ? { boat: { ...finishLine.boat }, pin: { ...finishLine.pin } }
      : null;
    this.standardCourseStartFinishMerged = false;
    this.standardCourseHistory = [];
  }

  private placeStandardCourseElement(point: CoursePoint) {
    if (!this.selectedRaceCourse || !this.standardCoursePlacementTool) return;
    this.pushStandardCourseHistory();

    switch (this.standardCoursePlacementTool) {
      case 'mark':
        this.standardCourseMarkers = [
          ...this.standardCourseMarkers,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            x: point.x,
            y: point.y,
            label: String(this.getNextStandardCourseSequenceNumber()),
            kind: 'mark',
            color: this.getDefaultMarkerColor()
          }
        ];
        return;
      case 'start':
        this.placeStandardCourseLine('start', point);
        return;
      case 'finish':
        this.placeStandardCourseLine('finish', point);
        return;
      case 'gate':
        this.placeStandardCourseGate(point);
        return;
    }
  }

  private placeStandardCourseLine(kind: 'start' | 'finish', point: CoursePoint) {
    if (!this.selectedRaceCourse) return;
    if (!this.pendingStandardCourseLineAnchor) {
      this.pendingStandardCourseLineAnchor = point;
      return;
    }

    const anchor = this.pendingStandardCourseLineAnchor;
    this.pendingStandardCourseLineAnchor = null;
    const normalizedLine = this.normalizeCustomCourseLine(anchor, point);
    if (kind === 'finish' && this.shouldOfferMergeStartFinish(normalizedLine)) {
      this.openMergeStartFinishConfirm('standard', normalizedLine);
      return;
    }
    if (kind === 'start') {
      this.standardCourseStartFinishMerged = false;
      this.standardCourseStartLineDraft = normalizedLine;
      return;
    }
    this.standardCourseStartFinishMerged = false;
    this.standardCourseFinishLineDraft = normalizedLine;
  }

  private placeStandardCourseGate(point: CoursePoint) {
    if (!this.selectedRaceCourse) return;
    if (!this.pendingStandardCourseGateAnchor) {
      this.pendingStandardCourseGateAnchor = point;
      return;
    }

    const anchor = this.pendingStandardCourseGateAnchor;
    this.pendingStandardCourseGateAnchor = null;
    const sequenceNumber = this.getNextStandardCourseSequenceNumber();
    const gateCount = this.getExistingStandardGateCount();
    const suffix = gateCount % 2 === 0 ? 'S' : 'P';
    const groupId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const label = `${sequenceNumber}${suffix}`;
    this.standardCourseMarkers = [
      ...this.standardCourseMarkers,
      { id: `${groupId}-a`, x: anchor.x, y: anchor.y, label, kind: 'gate', groupId, color: this.getDefaultMarkerColor() },
      { id: `${groupId}-b`, x: point.x, y: point.y, label, kind: 'gate', groupId, color: this.getDefaultMarkerColor() }
    ];
  }

  private getNextStandardCourseSequenceNumber(): number {
    const gateGroupIds = new Set<string>();
    let count = 0;
    for (const marker of this.standardCourseMarkers) {
      if (marker.kind === 'mark') {
        count += 1;
        continue;
      }
      if (marker.kind === 'gate' && marker.groupId && !gateGroupIds.has(marker.groupId)) {
        gateGroupIds.add(marker.groupId);
        count += 1;
      }
    }
    return count + 1;
  }

  private getExistingStandardGateCount(): number {
    return new Set(this.standardCourseMarkers.filter(marker => marker.kind === 'gate' && marker.groupId).map(marker => marker.groupId!)).size;
  }

  private updateDraggedCourseElement(point: CoursePoint) {
    const type = this.activeCourseElementType;
    const markerId = this.activeCourseElementMarkerId;
    if (!type) return;
    if (this.activeCourseElementMode === 'custom') {
      if (!this.selectedCustomCourse) return;
      if (type === 'object' && this.activeCourseElementObjectId && this.activeCourseElementObjectSnapshot && this.activeCourseElementStartPoint && this.currentRacePreviewKey) {
        const dx = point.x - this.activeCourseElementStartPoint.x;
        const dy = point.y - this.activeCourseElementStartPoint.y;
        this.raceObjectsByPreview[this.currentRacePreviewKey] = this.currentRaceObjects.map(area => {
          if (area.id !== this.activeCourseElementObjectId) return area;
          return {
            ...this.activeCourseElementObjectSnapshot!,
            center: {
              x: this.activeCourseElementObjectSnapshot!.center.x + dx,
              y: this.activeCourseElementObjectSnapshot!.center.y + dy
            },
            stamps: this.activeCourseElementObjectSnapshot!.stamps.map(stamp => ({
              ...stamp,
              x: stamp.x + dx,
              y: stamp.y + dy
            }))
          };
        });
        this.cdr.detectChanges();
        return;
      }
      if (type === 'marker' && markerId) {
        this.selectedCustomCourse = {
          ...this.selectedCustomCourse,
          markers: this.selectedCustomCourse.markers.map(marker => marker.id === markerId ? { ...marker, x: point.x, y: point.y } : marker)
        };
        return;
      }
      const lineKey = type.startsWith('start') ? 'startLine' : 'finishLine';
      const currentLine = this.selectedCustomCourse[lineKey];
      if (!currentLine) return;
      const nextLine = {
        boat: type.endsWith('boat') ? { ...point } : { ...currentLine.boat },
        pin: type.endsWith('pin') ? { ...point } : { ...currentLine.pin }
      };
      this.selectedCustomCourse = {
        ...this.selectedCustomCourse,
        [lineKey]: nextLine
      };
      this.persistSelectedCustomCourse();
      if (lineKey === 'finishLine' && !this.confirmMergeStartFinishOpen && this.shouldOfferDraggedFinishMerge(type, nextLine)) {
        this.openMergeStartFinishConfirm('custom', nextLine);
      }
      return;
    }

    if (type === 'object' && this.activeCourseElementObjectId && this.activeCourseElementObjectSnapshot && this.activeCourseElementStartPoint && this.currentRacePreviewKey) {
      const dx = point.x - this.activeCourseElementStartPoint.x;
      const dy = point.y - this.activeCourseElementStartPoint.y;
      this.raceObjectsByPreview[this.currentRacePreviewKey] = this.currentRaceObjects.map(area => {
        if (area.id !== this.activeCourseElementObjectId) return area;
        return {
          ...this.activeCourseElementObjectSnapshot!,
          center: {
            x: this.activeCourseElementObjectSnapshot!.center.x + dx,
            y: this.activeCourseElementObjectSnapshot!.center.y + dy
          },
          stamps: this.activeCourseElementObjectSnapshot!.stamps.map(stamp => ({
            ...stamp,
            x: stamp.x + dx,
            y: stamp.y + dy
          }))
        };
      });
      this.cdr.detectChanges();
      return;
    }

    if (type === 'marker' && markerId) {
      this.standardCourseMarkers = this.standardCourseMarkers.map(marker => marker.id === markerId ? { ...marker, x: point.x, y: point.y } : marker);
      return;
    }
    const line = type.startsWith('start') ? this.standardCourseStartLineDraft : this.standardCourseFinishLineDraft;
    if (!line) return;
    const nextLine = {
      boat: type.endsWith('boat') ? { ...point } : { ...line.boat },
      pin: type.endsWith('pin') ? { ...point } : { ...line.pin }
    };
    if (type.startsWith('start')) {
      this.standardCourseStartLineDraft = nextLine;
    } else {
      this.standardCourseFinishLineDraft = nextLine;
      if (!this.confirmMergeStartFinishOpen && this.shouldOfferDraggedFinishMerge(type, nextLine)) {
        this.openMergeStartFinishConfirm('standard', nextLine);
      }
    }
  }

  private clearCourseElementHoldTimer() {
    if (this.activeCourseElementHoldTimer === null) return;
    clearTimeout(this.activeCourseElementHoldTimer);
    this.activeCourseElementHoldTimer = null;
  }

  private getDefaultMarkerColor(): CourseMarkerColor {
    return this.storage.getTheme() === 'light' ? 'white' : 'black';
  }

  getMarkerColorOption(color: CourseMarkerColor): MarkerColorOption {
    return this.markerColorOptions.find(option => option.id === color) ?? this.markerColorOptions[this.markerColorOptions.length - 1];
  }

  getResolvedMarkerColor(marker: CustomCourseMarker): CourseMarkerColor {
    return marker.color ?? this.getDefaultMarkerColor();
  }

  getMarkerFill(marker: CustomCourseMarker): string {
    return this.getMarkerColorOption(this.getResolvedMarkerColor(marker)).fill;
  }

  getMarkerStroke(marker: CustomCourseMarker): string {
    return this.getMarkerColorOption(this.getResolvedMarkerColor(marker)).stroke;
  }

  getMarkerTextColor(marker: CustomCourseMarker): string {
    return this.getMarkerColorOption(this.getResolvedMarkerColor(marker)).text;
  }

  clearEditorSelection() {
    this.editorSelection = null;
    this.markerColorPaletteOpen = false;
  }

  private setEditorSelection(selection: CourseSelectionState | null) {
    this.editorSelection = selection;
    this.markerColorPaletteOpen = false;
  }

  private buildSelectionForInteraction(
    mode: 'custom' | 'standard',
    type: CourseDragTargetType,
    itemId?: string
  ): CourseSelectionState | null {
    if (type === 'marker') {
      return itemId ? { mode, type: 'marker', markerId: itemId } : null;
    }
    if (type === 'object') {
      return itemId ? { mode, type: 'object', objectId: itemId } : null;
    }
    return {
      mode,
      type: type.startsWith('start') ? 'start' : 'finish',
      lineKind: type.startsWith('start') ? 'start' : 'finish'
    };
  }

  private extractObjectIdFromEventTarget(event: PointerEvent): string | undefined {
    const target = event.target as HTMLElement | SVGElement | null;
    return target?.closest?.('[data-object-id]')?.getAttribute('data-object-id') ?? undefined;
  }

  private isSameSelection(a: CourseSelectionState | null, b: CourseSelectionState | null): boolean {
    return !!a && !!b
      && a.mode === b.mode
      && a.type === b.type
      && a.markerId === b.markerId
      && a.lineKind === b.lineKind
      && a.objectId === b.objectId;
  }

  isSelectedMarker(mode: 'custom' | 'standard', markerId: string): boolean {
    return this.editorSelection?.mode === mode
      && this.editorSelection.type === 'marker'
      && this.editorSelection.markerId === markerId;
  }

  isSelectedLine(mode: 'custom' | 'standard', kind: 'start' | 'finish'): boolean {
    return this.editorSelection?.mode === mode
      && this.editorSelection.type === kind;
  }

  isSelectedObject(mode: 'custom' | 'standard', objectId: string): boolean {
    return this.editorSelection?.mode === mode
      && this.editorSelection.type === 'object'
      && this.editorSelection.objectId === objectId;
  }

  getSelectedMarker(): CustomCourseMarker | null {
    if (this.editorSelection?.type !== 'marker' || !this.editorSelection.markerId) return null;
    return this.currentCourseMarkers.find(marker => marker.id === this.editorSelection!.markerId) ?? null;
  }

  private getSelectedObjectArea(): ReplayObjectArea | null {
    if (this.editorSelection?.type !== 'object' || !this.editorSelection.objectId) return null;
    return this.currentRaceObjects.find(area => area.id === this.editorSelection!.objectId) ?? null;
  }

  toggleMarkerColorPalette() {
    if (!this.canEditSelectedMarkerColor) return;
    this.markerColorPaletteOpen = !this.markerColorPaletteOpen;
  }

  applySelectedMarkerColor(color: CourseMarkerColor) {
    const selection = this.editorSelection;
    if (!selection || selection.type !== 'marker' || !selection.markerId) return;
    this.markerColorPaletteOpen = false;

    if (selection.mode === 'custom') {
      if (!this.selectedCustomCourse) return;
      this.pushCustomCourseHistory();
      const selected = this.selectedCustomCourse.markers.find(marker => marker.id === selection.markerId);
      if (!selected) return;
      this.selectedCustomCourse = {
        ...this.selectedCustomCourse,
        markers: this.selectedCustomCourse.markers.map(marker => {
          if (selected.groupId) {
            return marker.groupId === selected.groupId ? { ...marker, color } : marker;
          }
          return marker.id === selection.markerId ? { ...marker, color } : marker;
        })
      };
      this.persistSelectedCustomCourse();
      return;
    }

    this.pushStandardCourseHistory();
    const selected = this.standardCourseMarkers.find(marker => marker.id === selection.markerId);
    if (!selected) return;
    this.standardCourseMarkers = this.standardCourseMarkers.map(marker => {
      if (selected.groupId) {
        return marker.groupId === selected.groupId ? { ...marker, color } : marker;
      }
      return marker.id === selection.markerId ? { ...marker, color } : marker;
    });
  }

  deleteSelectedCourseElement() {
    const selection = this.editorSelection;
    if (!selection) return;

    if (selection.type === 'marker' && selection.markerId) {
      if (selection.mode === 'custom') {
        if (!this.selectedCustomCourse) return;
        const marker = this.selectedCustomCourse.markers.find(entry => entry.id === selection.markerId);
        if (!marker) return;
        this.pushCustomCourseHistory();
        this.selectedCustomCourse = {
          ...this.selectedCustomCourse,
          markers: marker.groupId
            ? this.selectedCustomCourse.markers.filter(entry => entry.groupId !== marker.groupId)
            : this.selectedCustomCourse.markers.filter(entry => entry.id !== selection.markerId)
        };
        this.persistSelectedCustomCourse();
      } else {
        const marker = this.standardCourseMarkers.find(entry => entry.id === selection.markerId);
        if (!marker) return;
        this.pushStandardCourseHistory();
        this.standardCourseMarkers = marker.groupId
          ? this.standardCourseMarkers.filter(entry => entry.groupId !== marker.groupId)
          : this.standardCourseMarkers.filter(entry => entry.id !== selection.markerId);
      }
      this.clearEditorSelection();
      return;
    }

    if (selection.type === 'start' || selection.type === 'finish') {
      if (selection.mode === 'custom') {
        if (!this.selectedCustomCourse) return;
        this.pushCustomCourseHistory();
        this.selectedCustomCourse = {
          ...this.selectedCustomCourse,
          [selection.type === 'start' ? 'startLine' : 'finishLine']: null,
          ...(selection.type === 'start' ? { startFinishMerged: false } : {})
        };
        this.persistSelectedCustomCourse();
      } else {
        this.pushStandardCourseHistory();
        if (selection.type === 'start') {
          this.standardCourseStartLineDraft = null;
        } else {
          this.standardCourseFinishLineDraft = null;
        }
        this.standardCourseStartFinishMerged = false;
      }
      this.clearEditorSelection();
      return;
    }

    if (selection.type === 'object' && selection.objectId && this.currentRacePreviewKey) {
      this.pushObjectHistoryForActiveCourse();
      this.raceObjectsByPreview[this.currentRacePreviewKey] = this.currentRaceObjects.filter(area => area.id !== selection.objectId);
      this.clearEditorSelection();
      this.cdr.detectChanges();
    }
  }

  getCourseObjectBounds(area: ReplayObjectArea): { minX: number; minY: number; maxX: number; maxY: number } {
    const points = area.stamps.flatMap(stamp => {
      const radius = stamp.radius ?? 0;
      return [
        { x: stamp.x - radius, y: stamp.y - radius },
        { x: stamp.x + radius, y: stamp.y + radius }
      ];
    });
    const fallback = area.center;
    const allPoints = points.length ? points : [fallback];
    return {
      minX: Math.min(...allPoints.map(point => point.x)),
      minY: Math.min(...allPoints.map(point => point.y)),
      maxX: Math.max(...allPoints.map(point => point.x)),
      maxY: Math.max(...allPoints.map(point => point.y))
    };
  }

  getSelectionToolbarX(): number {
    const selection = this.editorSelection;
    if (!selection) return 0;
    if (selection.type === 'marker') {
      const marker = this.getSelectedMarker();
      return marker ? marker.x : 0;
    }
    if (selection.type === 'object') {
      const area = this.getSelectedObjectArea();
      return area ? area.center.x : 0;
    }
    const line = selection.type === 'start' ? this.selectedCourseStartLine : this.selectedCourseFinishLine;
    return line ? (line.boat.x + line.pin.x) / 2 : 0;
  }

  getSelectionToolbarY(): number {
    const selection = this.editorSelection;
    if (!selection) return 0;
    if (selection.type === 'marker') {
      const marker = this.getSelectedMarker();
      return marker ? marker.y - 26 : 0;
    }
    if (selection.type === 'object') {
      const area = this.getSelectedObjectArea();
      if (!area) return 0;
      return this.getCourseObjectBounds(area).minY - 26;
    }
    const line = selection.type === 'start' ? this.selectedCourseStartLine : this.selectedCourseFinishLine;
    return line ? (Math.min(line.boat.y, line.pin.y) - 20) : 0;
  }

  getSelectionToolbarWidth(): number {
    return this.canEditSelectedMarkerColor ? 156 : 54;
  }

  clearCurrentRaceObjects() {
    if (!this.currentRacePreviewKey) return;
    this.raceObjectsByPreview[this.currentRacePreviewKey] = [];
    this.cdr.detectChanges();
  }

  toggleStandardCourseToolMenu() {
    if (!this.selectedRaceCourse || this.playbackRace || this.raceIsActive) return;
    this.finishObjectDrawing();
    this.standardObjectToolMenuOpen = false;
    this.standardCourseToolMenuOpen = !this.standardCourseToolMenuOpen;
  }

  toggleStandardObjectToolMenu() {
    if (!this.selectedRaceCourse || this.playbackRace || this.raceIsActive) return;
    this.standardCourseToolMenuOpen = false;
    this.standardObjectToolMenuOpen = !this.standardObjectToolMenuOpen;
  }

  startStandardCoursePlacement(tool: CustomCoursePlacementTool) {
    if (!this.selectedRaceCourse || this.playbackRace || this.raceIsActive) return;
    this.finishObjectDrawing();
    this.standardCourseToolMenuOpen = false;
    this.standardObjectToolMenuOpen = false;
    this.standardCoursePlacementTool = this.standardCoursePlacementTool === tool ? null : tool;
    this.pendingStandardCourseLineAnchor = null;
    this.pendingStandardCourseGateAnchor = null;
  }

  undoStandardCourseAction() {
    if (!this.standardCourseHistory.length) return;
    const previous = this.standardCourseHistory.pop();
    if (!previous) return;
    this.pendingStandardCourseLineAnchor = null;
    this.pendingStandardCourseGateAnchor = null;
    this.clearEditorSelection();
    this.standardCourseMarkers = previous.markers.map(marker => ({ ...marker }));
    this.standardCourseStartLineDraft = previous.startLine
      ? { boat: { ...previous.startLine.boat }, pin: { ...previous.startLine.pin } }
      : null;
    this.standardCourseStartFinishMerged = previous.startFinishMerged;
    this.standardCourseFinishLineDraft = previous.finishLine
      ? { boat: { ...previous.finishLine.boat }, pin: { ...previous.finishLine.pin } }
      : null;
    if (this.currentRacePreviewKey) {
      this.raceObjectsByPreview[this.currentRacePreviewKey] = this.cloneReplayObjects(previous.objects);
    }
  }

  clearStandardCourseElements() {
    if (!this.selectedRaceCourse) return;
    this.pushStandardCourseHistory();
    this.standardCourseMarkers = [];
    this.standardCourseStartLineDraft = null;
    this.standardCourseFinishLineDraft = null;
    this.standardCourseStartFinishMerged = false;
    if (this.currentRacePreviewKey) {
      this.raceObjectsByPreview[this.currentRacePreviewKey] = [];
    }
    this.clearEditorSelection();
  }

  onStandardCourseCanvasPointerDown(event: PointerEvent) {
    if (!this.standardCoursePlacementTool || !this.selectedRaceCourse || this.playbackRace || this.raceIsActive) return;
    const target = event.currentTarget as SVGGraphicsElement | null;
    const svg = target?.ownerSVGElement;
    if (!target || !svg) return;
    this.activeCourseBounds = svg.getBoundingClientRect();
    const point = this.clampCoursePoint(this.getCoursePointFromPointer(event));
    this.placeStandardCourseElement(point);
    event.preventDefault();
  }

  onCoursePanPointerDown(event: PointerEvent) {
    if (!this.selectedRaceCourse || this.playbackRace || this.raceIsActive || this.isObjectDrawingMode || this.standardCoursePlacementTool) return;
    if ((event as PointerEvent).isPrimary === false) return;
    this.activeCoursePanPointerId = event.pointerId;
    const currentTarget = event.currentTarget as SVGGraphicsElement | SVGSVGElement | null;
    const svg = currentTarget instanceof SVGSVGElement ? currentTarget : currentTarget?.ownerSVGElement;
    this.activeCourseBounds = svg?.getBoundingClientRect() ?? null;
    this.coursePanLastPoint = { x: event.clientX, y: event.clientY };
    currentTarget?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  onCoursePanPointerMove(event: PointerEvent) {
    if (this.activeCoursePanPointerId !== event.pointerId || !this.activeCourseBounds || !this.coursePanLastPoint) return;
    const deltaX = ((event.clientX - this.coursePanLastPoint.x) / this.activeCourseBounds.width) * COURSE_VIEWBOX_WIDTH;
    const deltaY = ((event.clientY - this.coursePanLastPoint.y) / this.activeCourseBounds.height) * COURSE_VIEWBOX_HEIGHT;
    this.coursePanOffset = {
      x: this.coursePanOffset.x + deltaX,
      y: this.coursePanOffset.y + deltaY
    };
    this.coursePanLastPoint = { x: event.clientX, y: event.clientY };
  }

  onCoursePanPointerUp(event: PointerEvent) {
    if (this.activeCoursePanPointerId !== event.pointerId) return;
    this.activeCoursePanPointerId = null;
    this.coursePanLastPoint = null;
    this.activeCourseBounds = null;
    (event.currentTarget as SVGGraphicsElement | SVGSVGElement | null)?.releasePointerCapture?.(event.pointerId);
  }

  cancelMergeStartFinish() {
    this.confirmMergeStartFinishOpen = false;
    this.pendingMergeStartFinishMode = null;
    this.pendingMergeStartFinishLine = null;
  }

  private openMergeStartFinishConfirm(mode: 'custom' | 'standard', line: CustomCourseLine) {
    this.pendingMergeStartFinishMode = mode;
    this.pendingMergeStartFinishLine = {
      boat: { ...line.boat },
      pin: { ...line.pin }
    };
    this.confirmMergeStartFinishOpen = true;
  }

  confirmMergeStartFinish() {
    const mode = this.pendingMergeStartFinishMode;
    if (!mode) return;
    if (mode === 'custom' && this.selectedCustomCourse) {
      this.selectedCustomCourse = {
        ...this.selectedCustomCourse,
        finishLine: null,
        startFinishMerged: true
      };
      this.persistSelectedCustomCourse();
    } else if (mode === 'standard') {
      this.standardCourseFinishLineDraft = null;
      this.standardCourseStartFinishMerged = true;
    }
    this.cancelMergeStartFinish();
  }

  private shouldOfferMergeStartFinish(line: CustomCourseLine): boolean {
    const startLine = this.selectedCourseStartLine;
    if (!startLine) return false;
    return this.getPointDistance(line.boat, startLine.boat) <= START_FINISH_MERGE_DISTANCE
      && this.getPointDistance(line.pin, startLine.pin) <= START_FINISH_MERGE_DISTANCE;
  }

  private shouldOfferDraggedFinishMerge(
    type: CourseDragTargetType,
    line: CustomCourseLine
  ): boolean {
    if (this.shouldOfferMergeStartFinish(line)) return true;
    const startLine = this.selectedCourseStartLine;
    if (!startLine) return false;
    const finishBoatNearStart =
      this.getPointDistance(line.boat, startLine.boat) <= START_FINISH_MERGE_DISTANCE
      || this.getPointDistance(line.boat, startLine.pin) <= START_FINISH_MERGE_DISTANCE;
    const finishPinNearStart =
      this.getPointDistance(line.pin, startLine.boat) <= START_FINISH_MERGE_DISTANCE
      || this.getPointDistance(line.pin, startLine.pin) <= START_FINISH_MERGE_DISTANCE;

    if (type === 'finish-boat') return finishBoatNearStart;
    if (type === 'finish-pin') return finishPinNearStart;
    return finishBoatNearStart || finishPinNearStart;
  }

  private proceedToCourseSetupPreview() {
    this.resetRaceReflectionState();
    this.courseSetupOpen = false;
    this.raceReflectionStep = 'preview';
    this.coursePanOffset = { x: 0, y: 0 };
    this.customCoursePanOffset = { x: 0, y: 0 };
    if (this.currentRacePreviewKey) {
      this.raceObjectsByPreview[this.currentRacePreviewKey] = [];
    }
    if (this.selectedRaceCourse) {
      this.buildStandardCourseDraft();
      this.courseBuilderTransform = this.buildCourseFitTransform();
    }
    if (this.selectedCustomCourse) {
      this.customCourseBuilderTransform = this.buildCustomCourseFitTransform();
    }
    if (this.selectedCustomCourse) {
      this.resetCustomSail();
    } else {
      this.resetCourseSail();
    }
  }

  toggleSettingsMenu() {
    this.settingsMenuOpen = !this.settingsMenuOpen;
  }

  closeSettingsMenu() {
    this.settingsMenuOpen = false;
  }

  get raceReflectionDisplayTitle(): string {
    if (this.selectedCustomCourse) return this.selectedCustomCourse.name;
    if (!this.selectedRaceCourse) return 'Eigener Kurs';

    switch (this.selectedRaceCourse.id) {
      case 'sprint-racing-pd3':
        return 'Downwind Slalom (PD3)';
      case 'sprint-racing-sd3':
        return 'Downwind Slalom (SD3)';
      case 'sprint-racing-pu4':
        return 'Up Wind Sprint (PU4)';
      case 'sprint-racing-su4':
        return 'Up Wind Sprint (SU4)';
      default:
        return this.selectedRaceCourse.label;
    }
  }

  get selectedCoursePath(): CoursePoint[] {
    if (this.selectedCustomCourse) {
      return this.currentCustomMarkers.map(marker => ({ x: marker.x, y: marker.y }));
    }
    if (this.selectedRaceCourse && this.standardCourseMarkers.length) {
      return this.standardCourseMarkers.map(marker => ({ x: marker.x, y: marker.y }));
    }
    if (!this.selectedRaceCourse) return [];
    return COURSE_PATHS[this.selectedRaceCourse.id] ?? [];
  }

  get selectedCoursePathPoints(): string {
    return this.selectedCoursePath.map(point => `${point.x},${point.y}`).join(' ');
  }

  getCourseLineLabelX(line: StartLineConfig | RaceFinishConfig): number {
    return (line.boat.x + line.pin.x) / 2;
  }

  getCourseLineLabelY(line: StartLineConfig | RaceFinishConfig): number {
    return Math.min(line.boat.y, line.pin.y) - 10;
  }

  getStartLineDisplayLabel(): string {
    if (this.selectedCustomCourse?.startFinishMerged || this.standardCourseStartFinishMerged) {
      return this.raceIsActive ? 'Ziel' : 'Start/Ziel';
    }
    return 'Start';
  }

  get selectedCourseStartLine(): StartLineConfig | null {
    if (this.selectedCustomCourse) return this.selectedCustomStartLine;
    if (this.selectedRaceCourse && this.standardCourseStartLineDraft) {
      return this.normalizeStartLineLength({
        boat: { ...this.standardCourseStartLineDraft.boat },
        pin: { ...this.standardCourseStartLineDraft.pin }
      });
    }
    if (!this.selectedRaceCourse) return null;
    const startLine = RACE_START_LINES[this.selectedRaceCourse.id] ?? null;
    return startLine ? this.normalizeStartLineLength(startLine) : null;
  }

  get selectedCourseFinishLine(): RaceFinishConfig | null {
    if (this.selectedCustomCourse) {
      if (this.selectedCustomCourse.startFinishMerged) {
        return this.selectedCustomStartLine;
      }
      return this.selectedCustomFinishLine;
    }
    if (this.selectedRaceCourse && this.standardCourseFinishLineDraft) {
      return {
        boat: { ...this.standardCourseFinishLineDraft.boat },
        pin: { ...this.standardCourseFinishLineDraft.pin }
      };
    }
    if (!this.selectedRaceCourse) return null;
    if (this.standardCourseStartFinishMerged) {
      return this.selectedCourseStartLine;
    }
    return RACE_FINISH_LINES[this.selectedRaceCourse.id] ?? null;
  }

  get currentMinimapPosition(): CoursePoint {
    return this.selectedRaceCourse
      ? this.clampPointToCourseViewbox(this.displayedCourseSailPosition)
      : this.clampPointToCourseViewbox(this.playbackPosition ?? this.customSailPosition);
  }

  get showMinimapCurrentPosition(): boolean {
    return !!this.selectedRaceCourse || this.showCustomSail || !!this.playbackRace;
  }

  get currentCourseCameraScale(): number {
    const isReplayView = this.replayViewRequested || !!this.playbackRace;
    const baseScale = isReplayView ? COURSE_CAMERA_SCALE_REPLAY : COURSE_CAMERA_SCALE;
    return isReplayView ? baseScale : baseScale * this.courseZoomFactor;
  }

  get activeJoystickOffset(): CoursePoint {
    return this.selectedRaceCourse ? this.courseJoystickOffset : this.customJoystickOffset;
  }

  get joystickKnobX(): number {
    return (JOYSTICK_PAD_SIZE / 2) + this.activeJoystickOffset.x;
  }

  get joystickKnobY(): number {
    return (JOYSTICK_PAD_SIZE / 2) + this.activeJoystickOffset.y;
  }

  get courseSailX(): number {
    return this.courseSailScreenPoint.x - this.displayCourseSailWidth / 2;
  }

  get courseSailY(): number {
    return this.courseSailScreenPoint.y - this.displayCourseSailHeight * 0.78;
  }

  get courseSailTransform(): string {
    const cx = this.courseSailScreenPoint.x;
    const cy = this.courseSailScreenPoint.y;
    return `rotate(${this.courseSailAngle} ${cx} ${cy})`;
  }

  get customSailX(): number {
    return this.customSailScreenPoint.x - this.displayCourseSailWidth / 2;
  }

  get customSailY(): number {
    return this.customSailScreenPoint.y - this.displayCourseSailHeight * 0.78;
  }

  get customSailTransform(): string {
    const cx = this.customSailScreenPoint.x;
    const cy = this.customSailScreenPoint.y;
    return `rotate(${this.customSailAngle} ${cx} ${cy})`;
  }

  get displayCourseSailWidth(): number {
    return this.courseSailWidth * this.courseSailZoomMultiplier;
  }

  get displayCourseSailHeight(): number {
    return this.courseSailHeight * this.courseSailZoomMultiplier;
  }

  private get courseSailZoomMultiplier(): number {
    if (this.replayViewRequested || !!this.playbackRace) return 1;
    if (this.startPositionSelectionActive) return 0.9;
    return Math.max(1, this.courseZoomFactor / COURSE_MIN_ZOOM_FACTOR);
  }

  get courseWorldTransform(): string {
    const transform = this.selectedRaceCourse
      ? this.getCourseViewportTransform()
      : this.getCustomViewportTransform();
    return `translate(${transform.offsetX} ${transform.offsetY}) scale(${transform.scale})`;
  }

  get customWorldTransform(): string {
    const transform = this.getCustomViewportTransform();
    return `translate(${transform.offsetX} ${transform.offsetY}) scale(${transform.scale})`;
  }

  onCourseSailPointerDown(event: PointerEvent) {
    if (!this.selectedRaceCourse || this.playbackRace || !this.isDragDriveMode || this.isObjectDrawingMode) return;
    const target = event.currentTarget as SVGGraphicsElement | null;
    const svg = target?.ownerSVGElement;
    if (!target || !svg) return;
    this.activeCoursePointerId = event.pointerId;
    this.activeCourseBounds = svg.getBoundingClientRect();
    if (this.startPositionSelectionActive) {
      const point = this.getCoursePointFromPointer(event);
      this.courseSailPosition = this.getStickyStartLinePosition(point);
      this.courseSailDragAnchor = { ...this.courseSailPosition };
      this.courseSailPointerOrigin = null;
      this.courseSailPointerActivated = true;
      this.courseJoystickOffset = { x: 0, y: 0 };
      target.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    this.courseSailDragAnchor = { ...this.courseSailPosition };
    this.courseSailPointerOrigin = this.getViewPointFromPointer(event);
    this.courseSailPointerActivated = false;
    this.startJoystickAnimation();
    target.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  onCourseSailPointerMove(event: PointerEvent) {
    if (this.activeCoursePointerId !== event.pointerId) return;
    this.updateCourseSailFromPointer(event);
  }

  onCourseSailPointerUp(event: PointerEvent) {
    if (this.activeCoursePointerId !== event.pointerId) return;
    this.activeCoursePointerId = null;
    this.activeCourseBounds = null;
    this.courseSailDragAnchor = { ...this.courseSailPosition };
    this.courseSailPointerOrigin = null;
    this.courseSailPointerActivated = false;
    (event.currentTarget as SVGGraphicsElement | null)?.releasePointerCapture?.(event.pointerId);
  }

  onObjectDrawPointerDown(event: PointerEvent) {
    if (!this.isObjectDrawingMode || !this.currentRacePreviewKey || !this.activeObjectToolOption) return;
    const target = event.currentTarget as SVGSVGElement | null;
    if (!target) return;

    this.pushObjectHistoryForActiveCourse();
    this.activeObjectPointerId = event.pointerId;
    this.activeObjectBounds = target.getBoundingClientRect();
    this.activeObjectSvg = target;
    this.activeObjectAreaId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.lastObjectDrawPoint = null;
    this.appendObjectStamp(this.getCoursePointFromPointer(event));
    target.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  onObjectDrawPointerMove(event: PointerEvent) {
    if (this.activeObjectPointerId !== event.pointerId) return;
    this.appendObjectStamp(this.getCoursePointFromPointer(event));
  }

  onObjectDrawPointerUp(event: PointerEvent) {
    if (this.activeObjectPointerId !== event.pointerId) return;
    const finishedAreaId = this.activeObjectAreaId;
    this.activeObjectPointerId = null;
    this.activeObjectBounds = null;
    this.activeObjectSvg = null;
    this.activeObjectAreaId = null;
    this.lastObjectDrawPoint = null;
    (event.currentTarget as SVGSVGElement | null)?.releasePointerCapture?.(event.pointerId);
    if (finishedAreaId) {
      this.promptForOtherObjectName(finishedAreaId);
    }
  }

  onCustomSailPointerDown(event: PointerEvent) {
    if (!this.isDragDriveMode || this.customCoursePlacementTool) return;
    const target = event.currentTarget as SVGGraphicsElement | null;
    const svg = target?.ownerSVGElement;
    if (!target || !svg) return;
    this.activeCoursePointerId = event.pointerId;
    this.activeCourseBounds = svg.getBoundingClientRect();
    if (this.startPositionSelectionActive) {
      const point = this.getCustomCoursePointFromPointer(event, svg);
      this.customSailPosition = this.getStickyStartLinePosition(point);
      this.customSailTargetPosition = { ...this.customSailPosition };
      this.customSailDragAnchor = { ...this.customSailPosition };
      this.customSailPointerOrigin = null;
      this.customSailPointerActivated = true;
      this.customJoystickOffset = { x: 0, y: 0 };
      this.customSailWaypoints = [];
      this.stopCustomSailAnimation();
      target.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    this.customSailDragAnchor = { ...this.customSailPosition };
    this.customSailPointerOrigin = this.getViewPointFromPointer(event);
    this.customSailPointerActivated = false;
    this.customSailTargetPosition = { ...this.customSailPosition };
    this.customSailWaypoints = [];
    this.stopCustomSailAnimation();
    this.startJoystickAnimation();
    target.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  onCustomSailPointerMove(event: PointerEvent) {
    if (this.activeCoursePointerId !== event.pointerId) return;
    this.updateCustomSailFromPointer(event);
  }

  onCustomSailPointerUp(event: PointerEvent) {
    if (this.activeCoursePointerId !== event.pointerId) return;
    this.activeCoursePointerId = null;
    this.activeCourseBounds = null;
    this.customSailDragAnchor = { ...this.customSailPosition };
    this.customSailPointerOrigin = null;
    this.customSailPointerActivated = false;
    this.customSailTargetPosition = { ...this.customSailPosition };
    this.customSailWaypoints = [];
    this.stopCustomSailAnimation();
    (event.currentTarget as SVGGraphicsElement | null)?.releasePointerCapture?.(event.pointerId);
  }

  private resetCourseSail() {
    const snap = this.startPositionSelectionActive
      ? { point: this.getInitialStartLinePosition(), angle: 0 }
      : this.getInitialCourseSnap();
    this.courseSailPosition = this.clampSailCoursePoint({ ...snap.point });
    this.courseSailDragAnchor = { ...this.courseSailPosition };
    this.courseSailPointerOrigin = null;
    this.courseSailPointerActivated = false;
    this.courseJoystickOffset = { x: 0, y: 0 };
    this.courseSailAngle = snap.angle;
  }

  private resetCustomSail() {
    const startPoint = this.startPositionSelectionActive
      ? this.getInitialStartLinePosition()
      : this.getCustomRaceStartPoint();
    this.customSailPosition = this.clampSailCoursePoint(startPoint);
    this.customSailTargetPosition = { ...this.customSailPosition };
    this.customSailDragAnchor = { ...this.customSailPosition };
    this.customSailPointerOrigin = null;
    this.customSailPointerActivated = false;
    this.customJoystickOffset = { x: 0, y: 0 };
    this.customSailWaypoints = [];
    this.customSailHeading = 'right';
    this.customSailAngle = 0;
    this.stopCustomSailAnimation();
  }

  private getInitialCourseSnap(): CourseSnap {
    const path = this.selectedRaceCourse ? COURSE_PATHS[this.selectedRaceCourse.id] : null;
    if (!path || path.length < 2) {
      return {
        point: { x: COURSE_VIEWBOX_WIDTH / 2, y: COURSE_VIEWBOX_HEIGHT / 2 },
        angle: 0
      };
    }

    return {
      point: { ...path[0] },
      angle: 0
    };
  }

  private updateCourseSailFromPointer(event: PointerEvent) {
    if (!this.selectedRaceCourse || !this.activeCourseBounds) return;
    if (this.startPositionSelectionActive) {
      const point = this.getCoursePointFromPointer(event);
      this.courseSailPosition = this.getStickyStartLinePosition(point);
      this.courseSailDragAnchor = { ...this.courseSailPosition };
      this.courseJoystickOffset = { x: 0, y: 0 };
      this.courseSailAngle = 0;
      return;
    }
    const point = this.getViewPointFromPointer(event);
    if (!this.courseSailPointerOrigin) {
      this.courseSailPointerOrigin = point;
      return;
    }

    const pointerDx = point.x - this.courseSailPointerOrigin.x;
    const pointerDy = point.y - this.courseSailPointerOrigin.y;
    const pointerDistance = Math.sqrt((pointerDx * pointerDx) + (pointerDy * pointerDy));

    if (!this.courseSailPointerActivated) {
      if (pointerDistance < JOYSTICK_ACTIVATION_DISTANCE) {
        return;
      }

      this.courseSailPointerActivated = true;
      this.courseSailPointerOrigin = point;
      this.courseSailDragAnchor = { ...this.courseSailPosition };
      return;
    }

    this.courseJoystickOffset = this.clampJoystickOffset(pointerDx, pointerDy);
    this.courseSailAngle = 0;
  }

  private updateCustomSailFromPointer(event: PointerEvent) {
    if (!this.activeCourseBounds) return;
    if (this.startPositionSelectionActive) {
      const target = event.currentTarget as SVGGraphicsElement | null;
      const svg = target?.ownerSVGElement;
      if (!svg) return;
      const point = this.getCustomCoursePointFromPointer(event, svg);
      this.customSailPosition = this.getStickyStartLinePosition(point);
      this.customSailTargetPosition = { ...this.customSailPosition };
      this.customSailDragAnchor = { ...this.customSailPosition };
      this.customJoystickOffset = { x: 0, y: 0 };
      this.customSailAngle = 0;
      this.customSailWaypoints = [];
      this.stopCustomSailAnimation();
      return;
    }
    const point = this.getViewPointFromPointer(event);
    if (!this.customSailPointerOrigin) {
      this.customSailPointerOrigin = point;
      return;
    }

    const pointerDx = point.x - this.customSailPointerOrigin.x;
    const pointerDy = point.y - this.customSailPointerOrigin.y;
    const pointerDistance = Math.sqrt((pointerDx * pointerDx) + (pointerDy * pointerDy));

    if (!this.customSailPointerActivated) {
      if (pointerDistance < JOYSTICK_ACTIVATION_DISTANCE) {
        return;
      }

      this.customSailPointerActivated = true;
      this.customSailPointerOrigin = point;
      this.customSailDragAnchor = { ...this.customSailPosition };
      this.customSailTargetPosition = { ...this.customSailPosition };
      this.customSailWaypoints = [];
      return;
    }

    this.customJoystickOffset = this.clampJoystickOffset(pointerDx, pointerDy);
    this.customSailAngle = 0;
  }

  setDriveMode(mode: DriveMode) {
    this.settingsMenuOpen = false;
    this.activeCoursePointerId = null;
    this.activeCourseBounds = null;
    this.activeControlPointerId = null;
    this.activeControlBounds = null;
    this.courseJoystickOffset = { x: 0, y: 0 };
    this.customJoystickOffset = { x: 0, y: 0 };
  }

  setAutoManeuverComments(enabled: boolean) {
    this.autoManeuverComments = enabled;
  }

  toggleQuickCommentMenu() {
    if (!this.raceIsActive || !!this.playbackRace) return;
    this.quickCommentMenuOpen = !this.quickCommentMenuOpen;
  }

  toggleRaceCommentPopup() {
    if (!this.raceIsActive || !!this.playbackRace) return;
    this.quickCommentMenuOpen = false;
    this.raceCommentPopupOpen = !this.raceCommentPopupOpen;
    if (this.raceCommentPopupOpen) {
      this.raceNoteDraft = '';
    }
  }

  closeRaceCommentPopup() {
    this.raceCommentPopupOpen = false;
    this.raceNoteDraft = '';
  }

  closeQuickCommentMenu() {
    this.quickCommentMenuOpen = false;
  }

  addAutoDetectedManeuverComment() {
    if (!this.raceIsActive) return;
    const label = this.getSuggestedManeuverLabel();
    this.addManualRaceManeuver(label);
  }

  triggerRaceVoiceComment() {
    if (!this.raceIsActive || !!this.playbackRace) return;
  }

  onControlJoystickPointerDown(event: PointerEvent) {
    if (this.playbackRace) return;
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    this.activeControlPointerId = event.pointerId;
    this.activeControlBounds = target.getBoundingClientRect();
    this.updateControlJoystickFromPointer(event);
    this.startJoystickAnimation();
    target.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  onControlJoystickPointerMove(event: PointerEvent) {
    if (this.activeControlPointerId !== event.pointerId) return;
    this.updateControlJoystickFromPointer(event);
  }

  onControlJoystickPointerUp(event: PointerEvent) {
    if (this.activeControlPointerId !== event.pointerId) return;
    this.activeControlPointerId = null;
    this.activeControlBounds = null;
    (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
  }

  onCoursePinchStart(event: TouchEvent) {
    if (this.playbackRace || this.replayViewRequested || event.touches.length !== 2) return;
    this.pinchStartDistance = this.getTouchDistance(event.touches[0], event.touches[1]);
    this.pinchStartZoomFactor = this.courseZoomFactor;
    event.preventDefault();
  }

  onCoursePinchMove(event: TouchEvent) {
    if (this.playbackRace || this.replayViewRequested || event.touches.length !== 2 || !this.pinchStartDistance) return;
    if (this.startPositionSelectionActive) return;
    const nextDistance = this.getTouchDistance(event.touches[0], event.touches[1]);
    this.setCourseZoomFactor(this.pinchStartZoomFactor * (nextDistance / this.pinchStartDistance));
    event.preventDefault();
  }

  onCoursePinchEnd(event: TouchEvent) {
    if (event.touches.length < 2) {
      this.pinchStartDistance = null;
      this.pinchStartZoomFactor = this.courseZoomFactor;
    }
  }

  onCourseZoomWheel(event: WheelEvent) {
    if (this.playbackRace || this.replayViewRequested) return;
    if (this.startPositionSelectionActive) return;
    const zoomDelta = event.deltaY > 0 ? -0.06 : 0.06;
    this.setCourseZoomFactor(this.courseZoomFactor + zoomDelta);
    event.preventDefault();
  }

  private updateControlJoystickFromPointer(event: PointerEvent) {
    if (!this.activeControlBounds) return;
    const localX = event.clientX - this.activeControlBounds.left;
    const localY = event.clientY - this.activeControlBounds.top;
    const dx = localX - (this.activeControlBounds.width / 2);
    const dy = localY - (this.activeControlBounds.height / 2);
    const nextOffset = this.clampAltJoystickOffset(dx, dy);

    if (this.selectedRaceCourse) {
      this.courseJoystickOffset = nextOffset;
      this.courseSailAngle = 0;
    } else {
      this.customJoystickOffset = nextOffset;
      this.customSailAngle = 0;
    }
  }

  toggleRaceState() {
    if (!this.selectedRaceCourse && !this.selectedCustomCourse) return;

    if (this.raceIsActive) {
      this.finishConfirmOpen = true;
      this.raceStartHint = '';
      return;
    }

    if (!this.canStartRace) {
      this.raceStartHint = !this.hasReplayAssignment
        ? 'Bitte eine Regatta auswählen.'
        : this.selectedCustomCourse
          ? 'Zum Starten muss erst eine Startlinie gesetzt sein.'
          : 'Zum Starten muss erst eine Startlinie gesetzt sein.';
      return;
    }

    if (!this.startPositionSelectionActive) {
      this.startPositionSelectionActive = true;
      if (this.selectedCustomCourse) {
        this.resetCustomSail();
      } else {
        this.resetCourseSail();
      }
      this.raceStartHint = 'Bitte wähle deine Startposition.';
      return;
    }

    if (this.selectedCustomCourse) {
      this.customSailDragAnchor = { ...this.customSailPosition };
      this.customSailTargetPosition = { ...this.customSailPosition };
    } else {
      this.courseSailDragAnchor = { ...this.courseSailPosition };
    }

    this.startPositionSelectionActive = false;
    this.raceIsActive = true;
    this.raceStartedAtMs = Date.now();
    this.raceStartHint = '';
    this.activeRaceTrack = [{ ...this.currentPreviewSailPosition }];
    this.activeRaceNotes = [];
    this.lastAutoManeuverTrackIndex = -1;
    this.lastRaceHorizontalDirection = null;
    this.lastInlineNotePromptTrackIndex = -1;
    this.startNoteAdded = false;
    this.finishNoteAdded = false;
    this.cancelRaceNote();

    const startLabel = this.selectedCustomCourse ? null : this.getRaceStartNoteLabel();
    if (startLabel) {
      this.addRaceNote(startLabel, this.currentPreviewSailPosition, 'start');
      this.activeRaceNotes.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        x: this.currentPreviewSailPosition.x,
        y: this.currentPreviewSailPosition.y,
        text: startLabel,
        kind: 'start',
        trackIndex: 0
      });
      this.startNoteAdded = true;
    }
  }

  saveRaceNote() {
    if (!this.raceIsActive) return;
    const notePosition = this.pendingRaceNotePosition ?? { ...this.currentPreviewSailPosition };
    if (!this.raceNoteDraft.trim()) return;
    this.addRaceNote(this.raceNoteDraft.trim(), notePosition, 'note');
    if (this.raceIsActive) {
      this.activeRaceNotes.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        x: notePosition.x,
        y: notePosition.y,
        text: this.raceNoteDraft.trim(),
        kind: 'note',
        trackIndex: Math.max(0, this.activeRaceTrack.length - 1)
      });
    }
    this.lastInlineNotePromptTrackIndex = Math.max(0, this.activeRaceTrack.length - 1);
    this.cancelRaceNote();
  }

  submitManualRaceComment() {
    if (!this.raceIsActive) return;
    const text = this.raceNoteDraft.trim();
    if (!text) return;

    const notePosition = { ...this.currentPreviewSailPosition };
    this.recordRaceTrackPoint(notePosition);
    this.addRaceNote(text, notePosition, 'note');
    this.activeRaceNotes.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: notePosition.x,
      y: notePosition.y,
      text,
      kind: 'note',
      trackIndex: Math.max(0, this.activeRaceTrack.length - 1)
    });
    this.raceNoteDraft = '';
    this.quickCommentMenuOpen = false;
    this.raceCommentPopupOpen = false;
  }

  cancelRaceNote() {
    this.raceNoteDraft = '';
    this.pendingRaceNotePosition = null;
    this.raceCommentPopupOpen = false;
  }

  addManualRaceManeuver(label: 'Wende' | 'Halse') {
    if (!this.raceIsActive) return;
    const notePosition = { ...this.currentPreviewSailPosition };
    this.recordRaceTrackPoint(notePosition);
    this.addRaceNote(label, notePosition, 'maneuver');
    this.activeRaceNotes.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: notePosition.x,
      y: notePosition.y,
      text: label,
      kind: 'maneuver',
      trackIndex: Math.max(0, this.activeRaceTrack.length - 1)
    });
    this.raceCommentPopupOpen = false;
  }

  addQuickRaceComment(label: 'Wende' | 'Halse' | 'Gepumpt') {
    if (!this.raceIsActive) return;
    this.quickCommentMenuOpen = false;
    if (label === 'Wende' || label === 'Halse') {
      this.addManualRaceManeuver(label);
      return;
    }

    const notePosition = { ...this.currentPreviewSailPosition };
    this.recordRaceTrackPoint(notePosition);
    this.addRaceNote(label, notePosition, 'note');
    this.activeRaceNotes.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: notePosition.x,
      y: notePosition.y,
      text: label,
      kind: 'note',
      trackIndex: Math.max(0, this.activeRaceTrack.length - 1)
    });
  }

  confirmRaceFinish() {
    if ((!this.selectedRaceCourse && !this.selectedCustomCourse) || !this.currentRacePreviewKey) return;
    this.finishConfirmOpen = false;
    this.raceIsActive = false;
    this.startPositionSelectionActive = false;
    this.raceStartedAtMs = 0;
    this.raceStartHint = '';
    const parsedRaceNumber = this.parseRaceNumber(this.raceNumberDraft);
    const parsedPlacement = this.parseRaceNumber(this.racePlacementDraft);
    const run: SavedRaceRun = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      courseId: this.selectedRaceCourse?.id ?? `custom:${this.selectedCustomCourse!.id}`,
      previewKey: this.currentRacePreviewKey,
      title: `${this.raceReflectionDisplayTitle}${parsedRaceNumber !== null ? ` · Rennen ${parsedRaceNumber}` : ''}`,
      createdAt: new Date().toISOString(),
      regattaName: this.resolvedRegattaName,
      raceName: this.raceReflectionDisplayTitle,
      raceNumber: parsedRaceNumber ?? undefined,
      placement: parsedPlacement ?? undefined,
      track: this.activeRaceTrack.map(point => ({ ...point })),
      notes: this.activeRaceNotes.map(note => ({ ...note })),
      objects: this.cloneReplayObjects(this.raceObjectsByPreview[this.currentRacePreviewKey] ?? []),
      customCourse: this.selectedCustomCourse ? this.cloneCustomCourse(this.selectedCustomCourse) : undefined
    };
    this.savedRacesByPreview[this.currentRacePreviewKey] = [run, ...(this.savedRacesByPreview[this.currentRacePreviewKey] ?? [])];
    this.raceNotesByPreview[this.currentRacePreviewKey] = [];
    this.raceObjectsByPreview[this.currentRacePreviewKey] = [];
    this.persistReplaysToSession();
    this.activeRaceTrack = [];
    this.activeRaceNotes = [];
    this.lastAutoManeuverTrackIndex = -1;
    this.lastRaceHorizontalDirection = null;
    this.racePlacementDraft = '';
    this.cancelRaceNote();
    this.quickCommentMenuOpen = false;
    this.finishObjectDrawing();
    this.showReplayBanner(run);
  }

  cancelRaceFinish() {
    this.finishConfirmOpen = false;
  }

  setDriveSpeedPercent(value: number | string) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return;
    this.driveSpeedPercent = Math.max(1, Math.min(200, Math.round(numeric)));
  }

  playSavedRace(run: SavedRaceRun) {
    this.stopRacePlayback();
    this.playbackRace = run;
    this.playbackPosition = { ...run.track[0] };
    this.playbackIndex = 0;
    this.playbackPaused = false;
    this.playbackSegmentStartTime = null;
    this.playbackSegmentFromPoint = null;
    this.playbackRevealNoteIds.clear();
    this.playbackTypedCharCounts = {};
    this.startPlaybackKeepAlive();
    this.cdr.detectChanges();
    const initialPauseDuration = this.revealPlaybackNotesForIndex(0);
    this.queuePlaybackFrame(initialPauseDuration);
  }

  stopPlayback() {
    this.stopRacePlayback();
  }

  togglePlaybackPause() {
    if (!this.playbackRace) return;

    if (this.playbackPaused) {
      this.playbackPaused = false;
      this.playbackSegmentStartTime = null;
      this.playbackSegmentFromPoint = this.playbackPosition ? { ...this.playbackPosition } : null;
      this.queuePlaybackFrame();
      return;
    }

    this.playbackPaused = true;
    this.clearPlaybackSchedulers();
    this.cdr.detectChanges();
  }

  jumpPlaybackToPreviousComment() {
    if (!this.playbackRace) return;
    const indices = this.getPlaybackCommentIndices();
    const previousIndex = [...indices].reverse().find(index => index < this.playbackIndex);
    if (previousIndex === undefined) return;
    this.jumpPlaybackToIndex(previousIndex);
  }

  jumpPlaybackToNextComment() {
    if (!this.playbackRace) return;
    const nextIndex = this.getPlaybackCommentIndices().find(index => index > this.playbackIndex);
    if (nextIndex === undefined) return;
    this.jumpPlaybackToIndex(nextIndex);
  }

  openReplayEdit() {
    if (!this.canEditReplay || !this.playbackRace) return;
    this.closeRegattaPicker();
    this.replayEditRegattaName = this.playbackRace.regattaName ?? '';
    this.replayEditRaceNumber = this.playbackRace.raceNumber ? String(this.playbackRace.raceNumber) : '';
    this.replayEditDate = new Date(this.playbackRace.createdAt).toISOString().slice(0, 10);
    this.replayEditOpen = true;
  }

  closeReplayEdit() {
    this.closeRegattaPicker();
    this.replayEditOpen = false;
    this.replayEditRegattaName = '';
    this.replayEditRaceNumber = '';
    this.replayEditDate = '';
  }

  deleteCurrentReplay() {
    if (!this.session?.replays || !this.currentReplayId) return;

    this.session = {
      ...this.session,
      replays: this.session.replays.filter(replay => replay.id !== this.currentReplayId)
    };
    this.storage.saveSession(this.session);
    this.confirmReplayDelete = false;
    this.router.navigate(['/auswertung'], { queryParams: { view: 'replays' } });
  }

  saveReplayEdit() {
    if (!this.session?.replays || !this.currentReplayId) return;

    const raceNumber = this.parseRaceNumber(this.replayEditRaceNumber) ?? undefined;
    const createdAt = this.replayEditDate
      ? new Date(`${this.replayEditDate}T12:00:00`).toISOString()
      : undefined;

    const updatedReplays = this.session.replays.map(replay => {
      if (replay.id !== this.currentReplayId) return replay;
      return {
        ...replay,
        regattaName: this.replayEditRegattaName.trim() || 'Ohne Regatta',
        raceNumber,
        createdAt: createdAt ?? replay.createdAt,
        title: `${replay.raceName}${raceNumber ? ` · Rennen ${raceNumber}` : ''}`
      };
    });

    this.session = {
      ...this.session,
      replays: updatedReplays
    };
    this.storage.saveSession(this.session);
    this.loadSavedRacesFromSession();

    const updatedReplay = Object.values(this.savedRacesByPreview)
      .flat()
      .find(run => run.id === this.currentReplayId);

    if (updatedReplay && this.playbackRace?.id === updatedReplay.id) {
      this.playbackRace = updatedReplay;
    }

    this.regattaNameDraft = this.playbackRace?.regattaName ?? this.regattaNameDraft;
    this.raceNumberDraft = this.playbackRace?.raceNumber ? String(this.playbackRace.raceNumber) : '';
    this.closeReplayEdit();
    this.cdr.detectChanges();
  }

  openReplayBannerPlaceholder() {
    if (!this.replayBanner) return;
  }

  toggleRaceNote(noteId: string) {
    if (this.playbackRace) return;
    if (this.expandedRaceNoteIds.has(noteId)) {
      this.expandedRaceNoteIds.delete(noteId);
      return;
    }
    this.expandedRaceNoteIds.add(noteId);
  }

  shouldShowRaceNoteText(note: RaceNote): boolean {
    return this.playbackRace
      ? this.playbackRevealNoteIds.has(note.id)
      : this.expandedRaceNoteIds.has(note.id);
  }

  isRaceNotePlaybackReveal(note: RaceNote): boolean {
    return !!this.playbackRace
      && this.playbackRevealNoteIds.has(note.id)
      && this.getRaceNoteVisibleCharCount(note) < note.text.length;
  }

  isManeuverRaceNote(note: RaceNote): boolean {
    return note.kind === 'maneuver' || note.text === 'Wende' || note.text === 'Halse';
  }

  isStartRaceNote(note: RaceNote): boolean {
    return note.kind === 'start';
  }

  isFinishRaceNote(note: RaceNote): boolean {
    return note.kind === 'finish';
  }

  getRaceNoteVisibleCharCount(note: RaceNote): number {
    if (!this.playbackRace) return note.text.length;
    return this.playbackTypedCharCounts[note.id] ?? 0;
  }

  getRaceNoteVisibleText(note: RaceNote): string {
    return note.text.slice(0, this.getRaceNoteVisibleCharCount(note));
  }

  getRaceNoteLabelWidth(note: RaceNote): number {
    return note.text.length >= RACE_NOTE_WRAP_THRESHOLD ? RACE_NOTE_LABEL_WIDTH_WIDE : RACE_NOTE_LABEL_WIDTH;
  }

  getRaceNoteLabelX(note: RaceNote): number {
    if (this.playbackRace) {
      return this.getPlaybackLabelAnchor().x - (this.getRaceNoteLabelWidth(note) / 2);
    }
    return Math.min(note.x + 12, COURSE_VIEWBOX_WIDTH - 108);
  }

  getRaceNoteLabelY(note: RaceNote): number {
    if (this.playbackRace) {
      return this.getPlaybackLabelAnchor().y;
    }
    return Math.max(18, note.y - 34);
  }

  private get currentRacePreviewKey(): string | null {
    if (this.selectedRaceCourse) return this.selectedRaceCourse.id;
    if (this.selectedCustomCourse && this.isCustomCoursePreview) return `custom:${this.selectedCustomCourse.id}`;
    return null;
  }

  private get currentPreviewSailPosition(): CoursePoint {
    return this.selectedRaceCourse ? this.courseSailPosition : this.customSailPosition;
  }

  private get displayedCourseSailPosition(): CoursePoint {
    return this.playbackPosition ?? this.courseSailPosition;
  }

  private get courseSailScreenPoint(): CoursePoint {
    const transform = this.getCourseViewportTransform();
    const point = this.displayedCourseSailPosition;
    return {
      x: (point.x * transform.scale) + transform.offsetX,
      y: (point.y * transform.scale) + transform.offsetY
    };
  }

  private get customSailScreenPoint(): CoursePoint {
    const transform = this.getCustomViewportTransform();
    const point = this.playbackPosition ?? this.customSailPosition;
    return {
      x: (point.x * transform.scale) + transform.offsetX,
      y: (point.y * transform.scale) + transform.offsetY
    };
  }

  private prepareRaceNoteAtCurrentPosition() {
    this.pendingRaceNotePosition = { ...this.currentPreviewSailPosition };
    this.raceNoteDraft = '';
  }

  private addRaceNote(text: string, point: CoursePoint, kind: RaceNote['kind'] = 'note') {
    if (!this.currentRacePreviewKey) return;
    const nextNote: RaceNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: point.x,
      y: point.y,
      text,
      kind
    };
    this.raceNotesByPreview[this.currentRacePreviewKey] = [
      ...(this.raceNotesByPreview[this.currentRacePreviewKey] ?? []),
      nextNote
    ];
    this.expandedRaceNoteIds.delete(nextNote.id);
  }

  useExistingRegatta(name: string, spot = '') {
    this.setActiveRegattaName(name);
    if (spot && this.regattaPickerContext === 'setup') {
      this.spotName = spot;
      this.persistSpotSelection();
    }
    this.closeRegattaPicker();
  }

  private isCurrentSailOnStartLine(): boolean {
    const startLine = this.selectedCourseStartLine;
    if (!startLine) return false;

    const sailPoint = this.currentPreviewSailPosition;
    const projection = this.projectPointToSegment(sailPoint, startLine.boat, startLine.pin);
    const dx = sailPoint.x - projection.x;
    const dy = sailPoint.y - projection.y;
    return Math.sqrt((dx * dx) + (dy * dy)) <= 14;
  }

  private isCurrentSailOnFinishLine(): boolean {
    const finishLine = this.selectedCourseFinishLine;
    if (!finishLine) return false;
    if (this.isMergedStartFinishActive() && this.raceStartedAtMs && (Date.now() - this.raceStartedAtMs) < MERGED_START_FINISH_FINISH_DELAY_MS) {
      return false;
    }

    const sailPoint = this.currentPreviewSailPosition;
    const projection = this.projectPointToSegment(sailPoint, finishLine.boat, finishLine.pin);
    const dx = sailPoint.x - projection.x;
    const dy = sailPoint.y - projection.y;
    return Math.sqrt((dx * dx) + (dy * dy)) <= 14;
  }

  private isMergedStartFinishActive(): boolean {
    return !!this.selectedCustomCourse?.startFinishMerged || this.standardCourseStartFinishMerged;
  }

  private getRaceStartNoteLabel(): string | null {
    const startLine = this.selectedCourseStartLine;
    if (!startLine) return null;

    return this.getStartLineCommentForPoint(this.currentPreviewSailPosition, startLine);
  }

  private getStartLineCommentForPoint(point: CoursePoint, startLine: StartLineConfig): string | null {
    const segmentDx = startLine.pin.x - startLine.boat.x;
    const segmentDy = startLine.pin.y - startLine.boat.y;
    const lengthSquared = (segmentDx * segmentDx) + (segmentDy * segmentDy);
    if (lengthSquared === 0) return null;

    const t = (
      ((point.x - startLine.boat.x) * segmentDx)
      + ((point.y - startLine.boat.y) * segmentDy)
    ) / lengthSquared;

    if (t <= 0.33) return 'Boot start';
    if (t >= 0.66) return 'Pin end Start';
    return 'Mittig gestartet';
  }

  private resetRaceReflectionState() {
    this.raceIsActive = false;
    this.startPositionSelectionActive = false;
    this.raceStartHint = '';
    this.duplicateRaceNumberConfirmOpen = false;
    this.cancelRaceNote();
    this.finishConfirmOpen = false;
    this.settingsMenuOpen = false;
    this.coursePickerOpen = false;
    this.courseSetupOpen = false;
    this.activeCoursePointerId = null;
    this.courseJoystickOffset = { x: 0, y: 0 };
    this.customJoystickOffset = { x: 0, y: 0 };
    this.activeControlPointerId = null;
    this.activeControlBounds = null;
    this.stopJoystickAnimation();
    this.expandedRaceNoteIds.clear();
    this.activeRaceTrack = [];
    this.activeRaceNotes = [];
    this.raceObjectsByPreview = {};
    this.lastAutoManeuverTrackIndex = -1;
    this.lastRaceHorizontalDirection = null;
    this.lastInlineNotePromptTrackIndex = -1;
    this.startNoteAdded = false;
    this.finishNoteAdded = false;
    this.hideReplayBanner();
    this.stopRacePlayback();
    this.closeRegattaPicker();
    this.replayEditOpen = false;
    this.finishObjectDrawing();
    this.closeOtherObjectName();
    this.expandedOtherObjectIds.clear();
    this.customCoursePlacementTool = null;
    this.standardCoursePlacementTool = null;
    this.customCoursePanMode = false;
    this.customCoursePanOffset = { x: 0, y: 0 };
    this.customCourseToolMenuOpen = false;
    this.customCourseBuilderTransform = null;
    this.coursePanMode = false;
    this.coursePanOffset = { x: 0, y: 0 };
    this.standardCourseToolMenuOpen = false;
    this.courseBuilderTransform = null;
    this.standardCourseMarkers = [];
    this.standardCourseStartLineDraft = null;
    this.standardCourseFinishLineDraft = null;
    this.standardCourseHistory = [];
    this.pendingCustomCourseLineAnchor = null;
    this.pendingCustomCourseGateAnchor = null;
    this.pendingStandardCourseLineAnchor = null;
    this.pendingStandardCourseGateAnchor = null;
    this.clearEditorSelection();
    this.activeCustomCoursePanPointerId = null;
    this.customCoursePanLastPoint = null;
    this.activeCoursePanPointerId = null;
    this.coursePanLastPoint = null;
    this.activeCourseElementPointerId = null;
    this.activeCourseElementMode = null;
    this.activeCourseElementType = null;
    this.activeCourseElementMarkerId = null;
    this.activeCourseElementObjectId = null;
    this.activeCourseElementStartPoint = null;
    this.activeCourseElementObjectSnapshot = null;
    this.activeCourseElementMoved = false;
    this.activeCourseElementStartClient = null;
    this.closeCustomCourseNamePrompt();
  }

  private loadSavedRacesFromSession() {
    this.savedRacesByPreview = {};
    for (const replay of this.session?.replays ?? []) {
      const key = replay.previewKey || replay.courseId;
      if (!this.savedRacesByPreview[key]) {
        this.savedRacesByPreview[key] = [];
      }
      this.savedRacesByPreview[key].push({
        ...replay,
        track: replay.track.map(point => ({ ...point })),
        notes: replay.notes.map(note => ({ ...note })),
        objects: this.cloneReplayObjects(replay.objects ?? []),
        customCourse: replay.customCourse ? this.cloneCustomCourse(replay.customCourse) : undefined
      });
    }
  }

  private openReplayFromQuery() {
    const replayId = this.route.snapshot.queryParamMap.get('replayId');
    if (!replayId) return;

    const replay = Object.values(this.savedRacesByPreview)
      .flat()
      .find(run => run.id === replayId);
    if (!replay) return;

    this.raceReflectionOpen = true;
    const option = this.raceReflectionOptions.find(entry => entry.id === replay.courseId);
    if (option) {
      this.selectedRaceCategory = option.category;
      this.selectedRaceCourse = option;
      this.selectedCustomCourse = null;
      this.resetCourseSail();
    } else if (replay.customCourse) {
      this.selectedRaceCategory = 'custom';
      this.selectedRaceCourse = null;
      this.selectedCustomCourse = this.cloneCustomCourse(replay.customCourse);
      this.resetCustomSail();
    } else {
      return;
    }
    this.raceReflectionStep = 'preview';
    this.resetRaceReflectionState();
    this.finishConfirmOpen = false;
    this.raceIsActive = false;
    this.raceStartHint = '';
    this.regattaNameDraft = replay.regattaName ?? '';
    this.raceNumberDraft = replay.raceNumber ? String(replay.raceNumber) : '';
    this.playSavedRace({
      ...replay,
      track: replay.track.map(point => ({ ...point })),
      notes: replay.notes.map(note => ({ ...note })),
      objects: this.cloneReplayObjects(replay.objects ?? []),
      customCourse: replay.customCourse ? this.cloneCustomCourse(replay.customCourse) : undefined
    });
  }

  private persistReplaysToSession() {
    if (!this.session) return;
    const replays = Object.values(this.savedRacesByPreview)
      .flat()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(run => ({
        ...run,
        track: run.track.map(point => ({ ...point })),
        notes: run.notes.map(note => ({ ...note })),
        objects: this.cloneReplayObjects(run.objects ?? []),
        customCourse: run.customCourse ? this.cloneCustomCourse(run.customCourse) : undefined
      }));

    this.session = {
      ...this.session,
      replays
    };
    this.storage.saveSession(this.session);
  }

  private parseRaceNumber(raw: string): number | null {
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  sanitizePositiveIntegerInput(raw: string | number | null | undefined): string {
    const normalized = String(raw ?? '').replace(/\D+/g, '');
    return normalized.replace(/^0+(\d)/, '$1');
  }

  private shouldConfirmDuplicateRaceNumber(): boolean {
    const parsedRaceNumber = this.parseRaceNumber(this.raceNumberDraft);
    if (parsedRaceNumber === null) return false;

    const regattaName = this.resolvedRegattaName;
    const currentSpot = this.spotName?.trim() || '';
    return this.storage.getSessions().some(session => {
      const sessionSpot = session.spot?.trim() || '';
      if (sessionSpot !== currentSpot) return false;
      return (session.replays ?? []).some(replay =>
        (replay.regattaName?.trim() || '') === regattaName
        && replay.raceNumber === parsedRaceNumber
      );
    });
  }

  private sanitizeRaceNumberInput(raw: string): string {
    return raw.replace(/\D+/g, '');
  }

  private setActiveRegattaName(name: string) {
    if (this.regattaPickerContext === 'replay-edit') {
      this.replayEditRegattaName = name;
      return;
    }
    this.regattaNameDraft = name;
  }

  private findSimilarExistingRegattaName(name: string): string | null {
    const normalizedTarget = this.normalizeRegattaName(name);
    if (!normalizedTarget) return null;

    const currentSpot = this.spotName?.trim() || '';
    for (const existing of this.existingRegattaOptions) {
      if ((existing.spot || '') !== currentSpot) continue;
      const normalizedExisting = this.normalizeRegattaName(existing.name);
      if (!normalizedExisting) continue;
      if (normalizedExisting === normalizedTarget) return existing.name;
      if (Math.abs(normalizedExisting.length - normalizedTarget.length) <= 1
        && this.getLevenshteinDistance(normalizedExisting, normalizedTarget) <= 1) {
        return existing.name;
      }
    }

    return null;
  }

  private applyStoredRegattaSpot(regattaName: string) {
    const match = this.storage.getSessions()
      .flatMap(session => (session.replays ?? []).map(replay => ({
        regattaName: replay.regattaName?.trim() || '',
        spot: session.spot?.trim() || ''
      })))
      .find(entry => entry.regattaName === regattaName && !!entry.spot);
    if (!match?.spot) return;
    this.spotName = match.spot;
    this.persistSpotSelection();
  }

  private buildRegattaOptionKey(name: string, spot: string): string {
    return `${name}__${spot}`;
  }

  private normalizeRegattaName(name: string): string {
    return name
      .toLocaleLowerCase('de-DE')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  private getLevenshteinDistance(a: string, b: string): number {
    const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[a.length][b.length];
  }

  private queuePlaybackFrame(delayMs = 0) {
    if (!this.playbackRace || this.playbackPaused) return;

    if (delayMs > 0) {
      this.playbackTimer = window.setTimeout(() => {
        this.playbackTimer = null;
        if (this.playbackPaused || !this.playbackRace) return;
        this.clearPlaybackNoteRevealState();
        this.playbackRenderNonce += 1;
        this.cdr.detectChanges();
        this.playbackAnimationFrame = requestAnimationFrame((nextTimestamp) => this.ngZone.run(() => this.runPlaybackFrame(nextTimestamp)));
      }, delayMs);
      return;
    }

    this.playbackAnimationFrame = requestAnimationFrame((nextTimestamp) => this.ngZone.run(() => this.runPlaybackFrame(nextTimestamp)));
  }

  private runPlaybackFrame(timestamp: number) {
    if (!this.playbackRace || this.playbackPaused) return;

    if (this.playbackIndex >= this.playbackRace.track.length - 1) {
      this.playbackPosition = { ...this.playbackRace.track[this.playbackRace.track.length - 1] };
      this.playbackAnimationFrame = null;
      this.cdr.detectChanges();
      return;
    }

    if (this.playbackSegmentStartTime === null) {
      this.playbackSegmentStartTime = timestamp;
      this.playbackSegmentFromPoint = this.playbackPosition
        ? { ...this.playbackPosition }
        : { ...this.playbackRace.track[this.playbackIndex] };
    }

    const fromPoint = this.playbackSegmentFromPoint ?? this.playbackRace.track[this.playbackIndex];
    const toPoint = this.playbackRace.track[this.playbackIndex + 1];
    const elapsed = timestamp - this.playbackSegmentStartTime;
    const progress = Math.min(1, elapsed / 180);

    this.playbackPosition = {
      x: fromPoint.x + ((toPoint.x - fromPoint.x) * progress),
      y: fromPoint.y + ((toPoint.y - fromPoint.y) * progress)
    };
    this.playbackRenderNonce += 1;
    this.cdr.detectChanges();

    if (progress >= 1) {
      this.playbackIndex += 1;
      this.playbackSegmentStartTime = null;
      this.playbackSegmentFromPoint = null;
      const pauseDuration = this.revealPlaybackNotesForIndex(this.playbackIndex);
      if (pauseDuration > 0) {
        this.queuePlaybackFrame(pauseDuration);
        return;
      }
    }

    this.queuePlaybackFrame();
  }

  private clearPlaybackSchedulers() {
    if (this.playbackTimer !== null) {
      window.clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
    if (this.playbackAnimationFrame !== null) {
      cancelAnimationFrame(this.playbackAnimationFrame);
      this.playbackAnimationFrame = null;
    }
    this.playbackTypingTimers.forEach(timerId => window.clearTimeout(timerId));
    this.playbackTypingTimers = [];
  }

  private getPlaybackCommentIndices(): number[] {
    if (!this.playbackRace) return [];
    return [...new Set(this.playbackRace.notes.map(note => note.trackIndex))].sort((a, b) => a - b);
  }

  private jumpPlaybackToIndex(targetIndex: number) {
    if (!this.playbackRace) return;
    const wasPaused = this.playbackPaused;
    this.clearPlaybackSchedulers();
    this.playbackIndex = Math.max(0, Math.min(targetIndex, this.playbackRace.track.length - 1));
    this.playbackPosition = { ...this.playbackRace.track[this.playbackIndex] };
    this.playbackSegmentStartTime = null;
    this.playbackSegmentFromPoint = null;
    this.clearPlaybackNoteRevealState();
    this.revealPlaybackNotesForIndex(this.playbackIndex);
    this.playbackRenderNonce += 1;
    this.playbackPaused = wasPaused;
    this.cdr.detectChanges();

    if (!wasPaused) {
      this.queuePlaybackFrame(500);
    }
  }

  private stopRacePlayback() {
    this.clearPlaybackSchedulers();
    if (this.playbackKeepAliveTimer !== null) {
      window.clearInterval(this.playbackKeepAliveTimer);
      this.playbackKeepAliveTimer = null;
    }
    this.playbackRace = null;
    this.playbackPosition = null;
    this.playbackPaused = false;
    this.confirmReplayDelete = false;
    this.playbackIndex = 0;
    this.playbackSegmentStartTime = null;
    this.playbackSegmentFromPoint = null;
    this.clearPlaybackNoteRevealState();
    this.playbackRenderNonce = 0;
    this.expandedRaceNoteIds.clear();
    this.replayEditOpen = false;
    this.cdr.detectChanges();
  }

  private clearPlaybackNoteRevealState() {
    this.playbackRevealNoteIds.clear();
    this.playbackTypedCharCounts = {};
  }

  private revealPlaybackNotesForIndex(index: number): number {
    if (!this.playbackRace) return 0;

    const matchingNotes = this.playbackRace.notes.filter(note => note.trackIndex === index);
    if (matchingNotes.length === 0) return 0;

    let pauseDuration = 0;

    for (const note of matchingNotes) {
      if (this.playbackRevealNoteIds.has(note.id)) {
        pauseDuration = Math.max(pauseDuration, RACE_NOTE_TYPING_END_PAUSE_MS);
        continue;
      }

      this.playbackRevealNoteIds.add(note.id);
      this.playbackTypedCharCounts[note.id] = 0;
      pauseDuration = Math.max(pauseDuration, this.startPlaybackNoteTyping(note));
    }

    this.cdr.detectChanges();
    return pauseDuration;
  }

  private startPlaybackNoteTyping(note: SavedRaceNote): number {
    const characters = Array.from(note.text);
    const totalDuration = (characters.length * RACE_NOTE_TYPING_CHAR_MS) + RACE_NOTE_TYPING_END_PAUSE_MS;

    if (characters.length === 0) {
      this.playbackTypedCharCounts[note.id] = 0;
      return totalDuration;
    }

    characters.forEach((_, index) => {
      const timerId = window.setTimeout(() => {
        if (!this.playbackRace) return;
        this.playbackTypedCharCounts[note.id] = index + 1;
        this.playbackRenderNonce += 1;
        this.cdr.detectChanges();
      }, (index + 1) * RACE_NOTE_TYPING_CHAR_MS);

      this.playbackTypingTimers.push(timerId);
    });

    return totalDuration;
  }

  private getPlaybackLabelAnchor(): CoursePoint {
    const activePosition = this.selectedRaceCourse
      ? this.displayedCourseSailPosition
      : this.customSailPosition;
    const scale = this.currentCourseCameraScale;
    const offsetX = COURSE_CAMERA_CENTER.x - (activePosition.x * scale);
    const offsetY = COURSE_CAMERA_CENTER.y - (activePosition.y * scale);
    const targetScreenX = COURSE_CAMERA_CENTER.x;
    const targetScreenY = COURSE_CAMERA_CENTER.y - 98;

    return {
      x: (targetScreenX - offsetX) / scale,
      y: (targetScreenY - offsetY) / scale
    };
  }

  private startPlaybackKeepAlive() {
    if (this.playbackKeepAliveTimer !== null) {
      window.clearInterval(this.playbackKeepAliveTimer);
    }

    this.playbackKeepAliveTimer = window.setInterval(() => {
      if (!this.playbackRace) return;
      this.playbackRenderNonce += 1;
      this.cdr.detectChanges();
    }, 50);
  }

  private showReplayBanner(run: SavedRaceRun) {
    this.hideReplayBanner();
    this.replayBanner = {
      title: 'Replay aufgezeichnet',
      subtitle: `${run.title} · Unter Analyse gespeichert`
    };
    this.cdr.detectChanges();
    this.replayBannerTimer = window.setTimeout(() => {
      this.replayBanner = null;
      this.replayBannerTimer = null;
      this.cdr.detectChanges();
    }, 5300);
  }

  private hideReplayBanner() {
    if (this.replayBannerTimer !== null) {
      window.clearTimeout(this.replayBannerTimer);
      this.replayBannerTimer = null;
    }
    this.replayBanner = null;
  }

  private recordRaceTrackPoint(point: CoursePoint) {
    const last = this.activeRaceTrack[this.activeRaceTrack.length - 1];
    if (!last) {
      this.activeRaceTrack.push({ ...point });
      return;
    }
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (Math.sqrt((dx * dx) + (dy * dy)) < 6) return;
    this.activeRaceTrack.push({ ...point });
    this.maybeAddStartRaceNote(last, point);
    this.maybeHandleFinishCrossing(last, point);
    this.maybeAddAutoManeuverComment(dx, point);
  }

  private maybeAddStartRaceNote(previousPoint: CoursePoint, currentPoint: CoursePoint) {
    if (!this.raceIsActive || this.startNoteAdded) return;
    if (!this.selectedCustomCourse) return;
    const startLine = this.selectedCustomStartLine;
    if (!startLine) return;

    const previousSide = this.getPointSideOfLine(previousPoint, startLine.boat, startLine.pin);
    const currentSide = this.getPointSideOfLine(currentPoint, startLine.boat, startLine.pin);
    if (previousSide === 0 || currentSide === 0) return;
    if ((previousSide < 0 && currentSide < 0) || (previousSide > 0 && currentSide > 0)) return;
    if (!this.doSegmentsIntersect(previousPoint, currentPoint, startLine.boat, startLine.pin)) return;

    const crossingPoint = this.projectPointToSegment(currentPoint, startLine.boat, startLine.pin);
    const startLabel = this.getStartLineCommentForPoint(crossingPoint, startLine);
    if (!startLabel) return;

    const trackIndex = Math.max(0, this.activeRaceTrack.length - 1);
    this.activeRaceNotes.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: crossingPoint.x,
      y: crossingPoint.y,
      text: startLabel,
      kind: 'start',
      trackIndex
    });
    this.addRaceNote(startLabel, crossingPoint, 'start');
    this.startNoteAdded = true;
    this.cdr.detectChanges();
  }

  private maybeHandleFinishCrossing(previousPoint: CoursePoint, currentPoint: CoursePoint) {
    if (!this.raceIsActive || this.finishNoteAdded) return;
    const finishLine = this.selectedCourseFinishLine;
    if (!finishLine) return;

    const previousSide = this.getPointSideOfLine(previousPoint, finishLine.boat, finishLine.pin);
    const currentSide = this.getPointSideOfLine(currentPoint, finishLine.boat, finishLine.pin);
    if (previousSide === 0 || currentSide === 0) return;
    if ((previousSide < 0 && currentSide < 0) || (previousSide > 0 && currentSide > 0)) return;
    if (!this.doSegmentsIntersect(previousPoint, currentPoint, finishLine.boat, finishLine.pin)) return;

    this.cancelRaceNote();
    this.addFinishRaceNote();
    this.finishConfirmOpen = true;
    this.raceStartHint = '';
  }

  private maybeAddAutoManeuverComment(dx: number, point: CoursePoint) {
    if (!this.autoManeuverComments) return;
    if (Math.abs(dx) < 4) return;

    const currentIndex = this.activeRaceTrack.length - 1;
    const currentDirection: 'left' | 'right' = dx < 0 ? 'left' : 'right';

    if (!this.lastRaceHorizontalDirection) {
      this.lastRaceHorizontalDirection = currentDirection;
      return;
    }

    if (this.lastRaceHorizontalDirection === currentDirection) {
      return;
    }

    if (this.lastAutoManeuverTrackIndex >= currentIndex - 1) {
      this.lastRaceHorizontalDirection = currentDirection;
      return;
    }

    const previousPoint = this.activeRaceTrack[currentIndex - 1];
    const previousDy = point.y - previousPoint.y;
    const maneuverText = previousDy <= 0 ? 'Wende' : 'Halse';
    const note: SavedRaceNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: point.x,
      y: point.y,
      text: maneuverText,
      kind: 'maneuver',
      trackIndex: currentIndex
    };

    this.activeRaceNotes.push(note);
    this.addRaceNote(maneuverText, point, 'maneuver');
    this.lastAutoManeuverTrackIndex = currentIndex;
    this.lastRaceHorizontalDirection = currentDirection;
    this.cdr.detectChanges();
  }

  private getSuggestedManeuverLabel(): 'Wende' | 'Halse' {
    const currentPoint = this.currentPreviewSailPosition;
    const previousPoint = this.activeRaceTrack[this.activeRaceTrack.length - 2]
      ?? this.activeRaceTrack[this.activeRaceTrack.length - 1]
      ?? currentPoint;
    const dy = currentPoint.y - previousPoint.y;
    return dy <= 0 ? 'Wende' : 'Halse';
  }

  private addFinishRaceNote() {
    if (!this.raceIsActive || this.finishNoteAdded) return;

    const point = { ...this.courseSailPosition };
    this.activeRaceNotes.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x: point.x,
      y: point.y,
      text: 'Finish',
      kind: 'finish',
      trackIndex: Math.max(0, this.activeRaceTrack.length - 1)
    });
    this.addRaceNote('Finish', point, 'finish');
    this.finishNoteAdded = true;
    this.cdr.detectChanges();
  }

  private snapCustomSailFromAnchor(dx: number, dy: number, point: CoursePoint): CoursePoint {
    if (dx === 0 && dy === 0) {
      return { ...this.customSailDragAnchor };
    }

    const snappedHeading = this.pickCustomHeading(dx, dy);
    if (snappedHeading !== this.customSailHeading) {
      const previousHeading = this.customSailHeading;
      this.customSailDragAnchor = { ...this.customSailPosition };
      this.customSailTargetPosition = { ...this.customSailPosition };
      this.customSailPointerOrigin = point;
      this.customSailHeading = snappedHeading;
      this.customSailWaypoints = [
        this.buildCustomTurnEntryWaypoint(previousHeading, snappedHeading)
      ];
      return { ...this.customSailPosition };
    }

    this.customSailHeading = snappedHeading;
    return this.projectCustomPointOnHeading(dx, dy, snappedHeading);
  }

  private getCoursePointFromPointer(event: PointerEvent): CoursePoint {
    const svg = this.activeObjectSvg;
    let localX: number;
    let localY: number;

    if (svg) {
      const svgPoint = svg.createSVGPoint();
      svgPoint.x = event.clientX;
      svgPoint.y = event.clientY;
      const localPoint = svgPoint.matrixTransform(svg.getScreenCTM()?.inverse());
      localX = localPoint.x;
      localY = localPoint.y;
    } else {
      const bounds = this.activeObjectBounds ?? this.activeCourseBounds!;
      localX = ((event.clientX - bounds.left) / bounds.width) * COURSE_VIEWBOX_WIDTH;
      localY = ((event.clientY - bounds.top) / bounds.height) * COURSE_VIEWBOX_HEIGHT;
    }

    const transform = this.selectedRaceCourse
      ? this.getCourseViewportTransform()
      : this.getCustomViewportTransform();

    return {
      x: (localX - transform.offsetX) / transform.scale,
      y: (localY - transform.offsetY) / transform.scale
    };
  }

  private getCustomCoursePointFromPointer(event: PointerEvent, svg: SVGSVGElement): CoursePoint {
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = event.clientX;
    svgPoint.y = event.clientY;
    const localPoint = svgPoint.matrixTransform(svg.getScreenCTM()?.inverse());
    const transform = this.getCustomViewportTransform();

    return {
      x: (localPoint.x - transform.offsetX) / transform.scale,
      y: (localPoint.y - transform.offsetY) / transform.scale
    };
  }

  private getViewPointFromPointer(event: PointerEvent): CoursePoint {
    const bounds = this.activeCourseBounds!;
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * COURSE_VIEWBOX_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * COURSE_VIEWBOX_HEIGHT
    };
  }

  private clampJoystickOffset(dx: number, dy: number): CoursePoint {
    const distance = Math.sqrt((dx * dx) + (dy * dy));
    if (distance <= JOYSTICK_MAX_RADIUS) {
      return { x: dx, y: dy };
    }

    const factor = JOYSTICK_MAX_RADIUS / distance;
    return {
      x: dx * factor,
      y: dy * factor
    };
  }

  private clampAltJoystickOffset(dx: number, dy: number): CoursePoint {
    const distance = Math.sqrt((dx * dx) + (dy * dy));
    if (distance <= ALT_JOYSTICK_MAX_RADIUS) {
      return { x: dx, y: dy };
    }

    const factor = ALT_JOYSTICK_MAX_RADIUS / distance;
    return {
      x: dx * factor,
      y: dy * factor
    };
  }

  private getTouchDistance(a: Touch, b: Touch): number {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  private getPointDistance(a: CoursePoint, b: CoursePoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private startJoystickAnimation() {
    if (this.joystickAnimationFrame !== null) return;

    const tick = () => {
      let keepRunning = false;
      const usesJoystickControl = this.activeControlPointerId !== null;
      const courseJoystickRadius = usesJoystickControl ? ALT_JOYSTICK_MAX_RADIUS : JOYSTICK_MAX_RADIUS;
      const speedMultiplier = this.driveSpeedPercent / 100;
      const courseWorldSpeed = (usesJoystickControl ? ALT_JOYSTICK_WORLD_SPEED : JOYSTICK_WORLD_SPEED) * speedMultiplier;
      const isCoursePointerActive = this.activeCoursePointerId !== null || this.activeControlPointerId !== null;
      const shouldMaintainLiveLoop =
        this.raceReflectionOpen &&
        !this.playbackRace &&
        !this.replayViewRequested &&
        (!!this.selectedRaceCourse || this.showCustomSail);

      if (!isCoursePointerActive) {
        this.courseJoystickOffset = {
          x: this.courseJoystickOffset.x * (1 - JOYSTICK_RETURN_EASING),
          y: this.courseJoystickOffset.y * (1 - JOYSTICK_RETURN_EASING)
        };
      }

      if (Math.abs(this.courseJoystickOffset.x) > 0.12 || Math.abs(this.courseJoystickOffset.y) > 0.12) {
        this.courseSailPosition = this.clampSailCoursePoint({
          x: this.courseSailPosition.x + ((this.courseJoystickOffset.x / courseJoystickRadius) * courseWorldSpeed),
          y: this.courseSailPosition.y + ((this.courseJoystickOffset.y / courseJoystickRadius) * courseWorldSpeed)
        });
        if (this.raceIsActive) {
          this.recordRaceTrackPoint(this.courseSailPosition);
          if (this.isCurrentSailOnFinishLine()) {
            this.cancelRaceNote();
            this.addFinishRaceNote();
            this.finishConfirmOpen = true;
            this.raceStartHint = '';
          }
        }
        keepRunning = true;
      } else {
        this.courseJoystickOffset = { x: 0, y: 0 };
      }

      if (!isCoursePointerActive) {
        this.customJoystickOffset = {
          x: this.customJoystickOffset.x * (1 - JOYSTICK_RETURN_EASING),
          y: this.customJoystickOffset.y * (1 - JOYSTICK_RETURN_EASING)
        };
      }

      if (Math.abs(this.customJoystickOffset.x) > 0.12 || Math.abs(this.customJoystickOffset.y) > 0.12) {
        this.customSailPosition = this.clampSailCoursePoint({
          x: this.customSailPosition.x + ((this.customJoystickOffset.x / courseJoystickRadius) * courseWorldSpeed),
          y: this.customSailPosition.y + ((this.customJoystickOffset.y / courseJoystickRadius) * courseWorldSpeed)
        });
        if (this.raceIsActive) {
          this.recordRaceTrackPoint(this.customSailPosition);
          if (this.isCurrentSailOnFinishLine()) {
            this.cancelRaceNote();
            this.addFinishRaceNote();
            this.finishConfirmOpen = true;
            this.raceStartHint = '';
          }
        }
        keepRunning = true;
      } else {
        this.customJoystickOffset = { x: 0, y: 0 };
      }

      this.playbackRenderNonce += 1;
      this.cdr.detectChanges();

      if (keepRunning || isCoursePointerActive || shouldMaintainLiveLoop) {
        this.joystickAnimationFrame = requestAnimationFrame(() => this.ngZone.run(tick));
        return;
      }

      this.joystickAnimationFrame = null;
    };

    this.joystickAnimationFrame = requestAnimationFrame(() => this.ngZone.run(tick));
  }

  private stopJoystickAnimation() {
    if (this.joystickAnimationFrame === null) return;
    cancelAnimationFrame(this.joystickAnimationFrame);
    this.joystickAnimationFrame = null;
  }

  private projectCustomPointOnHeading(
    dx: number,
    dy: number,
    heading: CustomHeading
  ): CoursePoint {
    const radians = CUSTOM_HEADING_ANGLES[heading] * (Math.PI / 180);
    const unitX = Math.cos(radians);
    const unitY = Math.sin(radians);
    const projectedLength = Math.max(0, (dx * unitX) + (dy * unitY));
    const travelLength = projectedLength / CUSTOM_CURSOR_TO_SAIL_RATIO;

    return {
      x: this.customSailDragAnchor.x + (Math.cos(radians) * travelLength),
      y: this.customSailDragAnchor.y + (Math.sin(radians) * travelLength)
    };
  }

  private pickCustomHeading(dx: number, dy: number): CustomHeading {
    const currentIsLeft =
      this.customSailHeading === 'left'
      || this.customSailHeading === 'up-left'
      || this.customSailHeading === 'down-left';
    const fallbackSide: 'left' | 'right' = currentIsLeft ? 'left' : 'right';
    const side: 'left' | 'right' =
      Math.abs(dx) <= CUSTOM_DIRECTION_DEADZONE
        ? fallbackSide
        : (dx < 0 ? 'left' : 'right');
    const absX = Math.max(Math.abs(dx), CUSTOM_DIRECTION_DEADZONE);
    const currentUpHeading: CustomHeading = side === 'left' ? 'up-left' : 'up-right';
    const currentDownHeading: CustomHeading = side === 'left' ? 'down-left' : 'down-right';
    const currentHalfwindHeading: CustomHeading = side === 'left' ? 'left' : 'right';
    const isAlreadyUpwind = this.customSailHeading === currentUpHeading;
    const isAlreadyDownwind = this.customSailHeading === currentDownHeading;

    const holdBoundary = -((absX * CUSTOM_HALFWIND_HOLD_SLOPE) + CUSTOM_HALFWIND_HOLD_OFFSET);
    const entryBoundary = -((absX * CUSTOM_UPWIND_ENTRY_SLOPE) + CUSTOM_UPWIND_ENTRY_OFFSET);
    const downwindHoldBoundary = (absX * CUSTOM_HALFWIND_HOLD_SLOPE) + CUSTOM_HALFWIND_HOLD_OFFSET;
    const downwindEntryBoundary = (absX * CUSTOM_DOWNWIND_ENTRY_SLOPE) + CUSTOM_DOWNWIND_ENTRY_OFFSET;

    if (isAlreadyUpwind) {
      return dy <= holdBoundary ? currentUpHeading : currentHalfwindHeading;
    }

    if (isAlreadyDownwind) {
      return dy >= downwindHoldBoundary ? currentDownHeading : currentHalfwindHeading;
    }

    if (dy <= entryBoundary) {
      return currentUpHeading;
    }

    if (dy >= downwindEntryBoundary) {
      return currentDownHeading;
    }

    return currentHalfwindHeading;
  }

  private buildCustomTurnEntryWaypoint(
    previousHeading: CustomHeading,
    nextHeading: CustomHeading
  ): CoursePoint {
    const previousRadians = CUSTOM_HEADING_ANGLES[previousHeading] * (Math.PI / 180);
    const nextRadians = CUSTOM_HEADING_ANGLES[nextHeading] * (Math.PI / 180);
    let delta = nextRadians - previousRadians;

    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;

    const entryAngle = previousRadians + (delta * 0.45);
    const x = this.customSailPosition.x + (Math.cos(entryAngle) * CUSTOM_TURN_ENTRY_RADIUS);
    let y = this.customSailPosition.y + (Math.sin(entryAngle) * CUSTOM_TURN_ENTRY_RADIUS);

    if (nextHeading === 'up-left' || nextHeading === 'up-right') {
      y -= CUSTOM_WINDWARD_ENTRY_BIAS;
    }

    if (nextHeading === 'down-left' || nextHeading === 'down-right') {
      y += CUSTOM_LEEWARD_ENTRY_BIAS;
    }

    return this.clampCoursePoint({ x, y });
  }

  private startCustomSailAnimation() {
    if (this.customSailAnimationFrame !== null) return;

    const tick = () => {
      const activeTarget = this.customSailWaypoints[0] ?? this.customSailTargetPosition;
      const dx = activeTarget.x - this.customSailPosition.x;
      const dy = activeTarget.y - this.customSailPosition.y;
      const distance = Math.sqrt((dx * dx) + (dy * dy));

      if (distance < 0.35) {
        this.customSailPosition = { ...activeTarget };
        if (this.customSailWaypoints.length > 0) {
          this.customSailWaypoints.shift();
          this.customSailAnimationFrame = window.requestAnimationFrame(tick);
          return;
        }
        this.customSailAnimationFrame = null;
        return;
      }

      const step = Math.max(CUSTOM_SAIL_ANIMATION_MIN_STEP, distance * CUSTOM_SAIL_ANIMATION_EASING);
      const factor = Math.min(1, step / distance);
      this.customSailPosition = this.clampSailCoursePoint({
        x: this.customSailPosition.x + (dx * factor),
        y: this.customSailPosition.y + (dy * factor)
      });
      this.playbackRenderNonce += 1;
      this.cdr.detectChanges();

      this.customSailAnimationFrame = window.requestAnimationFrame(tick);
    };

    this.customSailAnimationFrame = window.requestAnimationFrame(tick);
  }

  private stopCustomSailAnimation() {
    if (this.customSailAnimationFrame === null) return;
    window.cancelAnimationFrame(this.customSailAnimationFrame);
    this.customSailAnimationFrame = null;
  }

  private snapPointToCourse(point: CoursePoint): CourseSnap {
    const path = this.selectedRaceCourse ? COURSE_PATHS[this.selectedRaceCourse.id] : null;
    if (!path || path.length < 2) {
      return {
        point,
        angle: 0
      };
    }

    let bestPoint = path[0];
    let bestAngle = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < path.length - 1; i += 1) {
      const start = path[i];
      const end = path[i + 1];
      const projected = this.projectPointToSegment(point, start, end);
      const dx = point.x - projected.x;
      const dy = point.y - projected.y;
      const distance = dx * dx + dy * dy;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestPoint = projected;
        bestAngle = 0;
      }
    }

    return {
      point: bestPoint,
      angle: bestAngle
    };
  }

  private projectPointToSegment(point: CoursePoint, start: CoursePoint, end: CoursePoint): CoursePoint {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return { ...start };
    }

    const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
    const clampedT = Math.max(0, Math.min(1, t));

    return {
      x: start.x + dx * clampedT,
      y: start.y + dy * clampedT
    };
  }

  private getPointSideOfLine(point: CoursePoint, start: CoursePoint, end: CoursePoint): number {
    const side = ((end.x - start.x) * (point.y - start.y)) - ((end.y - start.y) * (point.x - start.x));
    if (Math.abs(side) < 0.001) return 0;
    return side;
  }

  private doSegmentsIntersect(a1: CoursePoint, a2: CoursePoint, b1: CoursePoint, b2: CoursePoint): boolean {
    const orient = (p: CoursePoint, q: CoursePoint, r: CoursePoint): number =>
      ((q.x - p.x) * (r.y - p.y)) - ((q.y - p.y) * (r.x - p.x));
    const onSegment = (p: CoursePoint, q: CoursePoint, r: CoursePoint): boolean =>
      q.x <= Math.max(p.x, r.x) + 0.001
      && q.x >= Math.min(p.x, r.x) - 0.001
      && q.y <= Math.max(p.y, r.y) + 0.001
      && q.y >= Math.min(p.y, r.y) - 0.001;

    const o1 = orient(a1, a2, b1);
    const o2 = orient(a1, a2, b2);
    const o3 = orient(b1, b2, a1);
    const o4 = orient(b1, b2, a2);

    if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) {
      return true;
    }
    if (Math.abs(o1) < 0.001 && onSegment(a1, b1, a2)) return true;
    if (Math.abs(o2) < 0.001 && onSegment(a1, b2, a2)) return true;
    if (Math.abs(o3) < 0.001 && onSegment(b1, a1, b2)) return true;
    if (Math.abs(o4) < 0.001 && onSegment(b1, a2, b2)) return true;
    return false;
  }

  private getCustomRaceStartPoint(): CoursePoint {
    const startLine = this.selectedCustomStartLine;
    if (!startLine) {
      return {
        x: CUSTOM_SAIL_ORIGIN.x + 60,
        y: CUSTOM_SAIL_ORIGIN.y
      };
    }

    const midpoint = {
      x: (startLine.boat.x + startLine.pin.x) / 2,
      y: (startLine.boat.y + startLine.pin.y) / 2
    };
    const dx = startLine.pin.x - startLine.boat.x;
    const dy = startLine.pin.y - startLine.boat.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalA = { x: -dy / length, y: dx / length };
    const normalB = { x: dy / length, y: -dx / length };
    const courseCenter = this.getCustomCourseRaceCenter();
    const sideA = this.getPointSideOfLine(courseCenter, startLine.boat, startLine.pin) * this.getPointSideOfLine(
      { x: midpoint.x + normalA.x, y: midpoint.y + normalA.y },
      startLine.boat,
      startLine.pin
    );
    const spawnNormal = sideA > 0 ? normalB : normalA;

    return {
      x: midpoint.x + (spawnNormal.x * 26),
      y: midpoint.y + (spawnNormal.y * 26)
    };
  }

  private getCustomCourseRaceCenter(): CoursePoint {
    const points: CoursePoint[] = [
      ...this.currentCustomMarkers.map(marker => ({ x: marker.x, y: marker.y })),
      ...(this.selectedCustomFinishLine ? [{ ...this.selectedCustomFinishLine.boat }, { ...this.selectedCustomFinishLine.pin }] : [])
    ];

    if (points.length === 0) {
      return { ...CUSTOM_SAIL_ORIGIN };
    }

    const sum = points.reduce((acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y
    }), { x: 0, y: 0 });

    return {
      x: sum.x / points.length,
      y: sum.y / points.length
    };
  }

  private getInitialStartLinePosition(): CoursePoint {
    const startLine = this.selectedCourseStartLine;
    if (!startLine) {
      return {
        x: COURSE_VIEWBOX_WIDTH / 2,
        y: COURSE_VIEWBOX_HEIGHT / 2
      };
    }

    return {
      x: (startLine.boat.x + startLine.pin.x) / 2,
      y: (startLine.boat.y + startLine.pin.y) / 2
    };
  }

  private getStickyStartLinePosition(point: CoursePoint): CoursePoint {
    const startLine = this.selectedCourseStartLine;
    if (!startLine) return this.clampSailCoursePoint(point);
    return this.clampSailCoursePoint(this.projectPointToSegment(point, startLine.boat, startLine.pin));
  }

  private clampSailCoursePoint(point: CoursePoint): CoursePoint {
    const clamped = this.clampCoursePoint(point);
    return this.preventMarkerOverlap(clamped);
  }

  private preventMarkerOverlap(point: CoursePoint): CoursePoint {
    let nextPoint = { ...point };
    const collisionRadius = 15;
    const collisionCenterOffset = { x: -3, y: -5 };

    for (const marker of this.currentCourseMarkers) {
      const dx = (nextPoint.x + collisionCenterOffset.x) - marker.x;
      const dy = (nextPoint.y + collisionCenterOffset.y) - marker.y;
      const distance = Math.hypot(dx, dy);
      if (!distance || distance >= collisionRadius) continue;
      const push = collisionRadius - distance;
      const ux = dx / distance;
      const uy = dy / distance;
      nextPoint = this.clampCoursePoint({
        x: nextPoint.x + (ux * push),
        y: nextPoint.y + (uy * push)
      });
    }

    return nextPoint;
  }

  private clampCoursePoint(point: CoursePoint): CoursePoint {
    const minX = (COURSE_SAIL_WIDTH / 2) - COURSE_WORLD_MARGIN_X;
    const maxX = (COURSE_VIEWBOX_WIDTH - COURSE_SAIL_WIDTH / 2) + COURSE_WORLD_MARGIN_X;
    const minY = (COURSE_SAIL_HEIGHT * 0.78) - COURSE_WORLD_MARGIN_Y;
    const maxY = (COURSE_VIEWBOX_HEIGHT - (COURSE_SAIL_HEIGHT * 0.22)) + COURSE_WORLD_MARGIN_Y;

    return {
      x: Math.max(minX, Math.min(maxX, point.x)),
      y: Math.max(minY, Math.min(maxY, point.y))
    };
  }

  private clampPointToCourseViewbox(point: CoursePoint): CoursePoint {
    const minX = COURSE_SAIL_WIDTH / 2;
    const maxX = COURSE_VIEWBOX_WIDTH - COURSE_SAIL_WIDTH / 2;
    const minY = COURSE_SAIL_HEIGHT * 0.78;
    const maxY = COURSE_VIEWBOX_HEIGHT - (COURSE_SAIL_HEIGHT * 0.22);

    return {
      x: Math.max(minX, Math.min(maxX, point.x)),
      y: Math.max(minY, Math.min(maxY, point.y))
    };
  }

  private ensureCurrentRaceObjects() {
    if (!this.currentRacePreviewKey) return;
    if (!this.raceObjectsByPreview[this.currentRacePreviewKey]) {
      this.raceObjectsByPreview[this.currentRacePreviewKey] = [];
    }
  }

  private appendObjectStamp(point: CoursePoint) {
    if (!this.currentRacePreviewKey || !this.activeObjectAreaId || !this.activeObjectToolOption) return;
    this.ensureCurrentRaceObjects();
    const config = this.activeObjectToolOption;

    let area = this.raceObjectsByPreview[this.currentRacePreviewKey]
      .find(entry => entry.id === this.activeObjectAreaId);

    if (!area) {
      area = {
        id: this.activeObjectAreaId,
        kind: config.id,
        center: { ...point },
        stamps: []
      };
      this.raceObjectsByPreview[this.currentRacePreviewKey] = [
        ...(this.raceObjectsByPreview[this.currentRacePreviewKey] ?? []),
        area
      ];
    }

    if (config.renderMode === 'icon') {
      area.stamps = [{ x: point.x, y: point.y, radius: 0 }];
      area.center = { ...point };
      this.lastObjectDrawPoint = { ...point };
      this.playbackRenderNonce += 1;
      this.cdr.detectChanges();
      return;
    }

    const transform = this.selectedCustomCourse
      ? this.getCustomViewportTransform()
      : this.getCourseViewportTransform();
    const radius = Math.max(4, Math.min(24, (config.brushRadius * 2.1) / transform.scale));
    const spacing = Math.max(2.2, config.placementSpacing / (transform.scale * 3));

    if (this.lastObjectDrawPoint) {
      const dx = point.x - this.lastObjectDrawPoint.x;
      const dy = point.y - this.lastObjectDrawPoint.y;
      const distance = Math.sqrt((dx * dx) + (dy * dy));
      if (distance < spacing) {
        return;
      }
    }

    area.stamps.push({
      x: point.x,
      y: point.y,
      radius
    });

    area.center = this.computeObjectAreaCenter(area.stamps);
    this.lastObjectDrawPoint = { ...point };
    this.playbackRenderNonce += 1;
    this.cdr.detectChanges();
  }

  private computeObjectAreaCenter(stamps: ReplayObjectStamp[]): CoursePoint {
    if (stamps.length === 0) {
      return { x: COURSE_CAMERA_CENTER.x, y: COURSE_CAMERA_CENTER.y };
    }

    const total = stamps.reduce(
      (acc, stamp) => ({
        x: acc.x + stamp.x,
        y: acc.y + stamp.y
      }),
      { x: 0, y: 0 }
    );

    return {
      x: total.x / stamps.length,
      y: total.y / stamps.length
    };
  }

  getObjectToolLabel(kind: ReplayObjectKind): string {
    return this.objectToolOptions.find(option => option.id === kind)?.label ?? 'Objekt';
  }

  isLineObject(kind: ReplayObjectKind): boolean {
    return this.getObjectToolConfig(kind).renderMode === 'line';
  }

  isIconOnlyObject(kind: ReplayObjectKind): boolean {
    return this.getObjectToolConfig(kind).renderMode === 'icon';
  }

  getObjectToolFill(kind: ReplayObjectKind): string {
    return this.objectToolOptions.find(option => option.id === kind)?.fill ?? 'rgba(176, 142, 96, 0.2)';
  }

  getObjectToolStroke(kind: ReplayObjectKind): string {
    return this.objectToolOptions.find(option => option.id === kind)?.stroke ?? 'rgba(226, 194, 147, 0.72)';
  }

  shouldShowObjectOutline(kind: ReplayObjectKind): boolean {
    return this.getObjectToolConfig(kind).showOutline;
  }

  getObjectLabelX(area: ReplayObjectArea): number {
    return area.center.x - 16;
  }

  getObjectLabelY(area: ReplayObjectArea): number {
    return area.center.y - 16;
  }

  getObjectLinePoints(area: ReplayObjectArea): string {
    return area.stamps.map(stamp => `${stamp.x},${stamp.y}`).join(' ');
  }

  getObjectStrokeWidth(area: ReplayObjectArea): number {
    return Math.max(1, (area.stamps[0]?.radius ?? 0) * 2);
  }

  shouldShowOtherObjectLabel(area: ReplayObjectArea): boolean {
    if (area.kind !== 'sonstiges' || !area.label) return false;
    return !!this.playbackRace || this.expandedOtherObjectIds.has(area.id);
  }

  private getCourseViewportTransform(): { scale: number; offsetX: number; offsetY: number } {
    if (this.startPositionSelectionActive && !this.raceIsActive && !this.playbackRace && this.selectedCourseStartLine) {
      return this.buildStartSelectionTransform(this.selectedCourseStartLine);
    }
    if (this.selectedRaceCourse && !this.raceIsActive && !this.playbackRace) {
      const transform = this.applyBuilderZoomToTransform(this.courseBuilderTransform ?? this.buildCourseFitTransform());
      return {
        ...transform,
        offsetX: transform.offsetX + this.coursePanOffset.x,
        offsetY: transform.offsetY + this.coursePanOffset.y
      };
    }

    const anchor = this.clampCoursePoint(this.displayedCourseSailPosition);
    const scale = this.currentCourseCameraScale;
    return {
      scale,
      offsetX: COURSE_CAMERA_CENTER.x - (anchor.x * scale),
      offsetY: COURSE_CAMERA_CENTER.y - (anchor.y * scale)
    };
  }

  private getCustomViewportTransform(): { scale: number; offsetX: number; offsetY: number } {
    if (this.startPositionSelectionActive && !this.raceIsActive && !this.playbackRace && this.selectedCourseStartLine) {
      return this.buildStartSelectionTransform(this.selectedCourseStartLine);
    }
    if (this.selectedCustomCourse && !this.raceIsActive && !this.playbackRace) {
      const transform = this.applyBuilderZoomToTransform(this.customCourseBuilderTransform ?? this.buildCustomCourseFitTransform());
      return {
        ...transform,
        offsetX: transform.offsetX + this.customCoursePanOffset.x,
        offsetY: transform.offsetY + this.customCoursePanOffset.y
      };
    }

    const anchor = this.clampCoursePoint(this.playbackPosition ?? this.customSailPosition);
    const scale = this.currentCourseCameraScale;
    return {
      scale,
      offsetX: COURSE_CAMERA_CENTER.x - (anchor.x * scale),
      offsetY: COURSE_CAMERA_CENTER.y - (anchor.y * scale)
    };
  }

  private buildCourseFitTransform(): { scale: number; offsetX: number; offsetY: number } {
    const path = this.selectedCoursePath;
    const startLine = this.selectedCourseStartLine;
    const finishLine = this.selectedCourseFinishLine;
    const points: CoursePoint[] = [
      ...path.map(point => ({ ...point })),
      ...(startLine ? [{ ...startLine.boat }, { ...startLine.pin }] : []),
      ...(finishLine ? [{ ...finishLine.boat }, { ...finishLine.pin }] : [])
    ];

    if (points.length === 0) {
      return {
        scale: 1,
        offsetX: 0,
        offsetY: 0
      };
    }

    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxY = Math.max(...points.map(point => point.y));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const scale = Math.min(
      (COURSE_VIEWBOX_WIDTH - (OBJECT_DRAW_FIT_PADDING * 2)) / width,
      (COURSE_VIEWBOX_HEIGHT - (OBJECT_DRAW_FIT_PADDING * 2)) / height
    );

    return {
      scale,
      offsetX: ((COURSE_VIEWBOX_WIDTH - (width * scale)) / 2) - (minX * scale),
      offsetY: ((COURSE_VIEWBOX_HEIGHT - (height * scale)) / 2) - (minY * scale)
    };
  }

  private applyBuilderZoomToTransform(transform: { scale: number; offsetX: number; offsetY: number }): { scale: number; offsetX: number; offsetY: number } {
    const nextScale = transform.scale * this.courseZoomFactor;
    const centerScreenX = COURSE_VIEWBOX_WIDTH / 2;
    const centerScreenY = COURSE_VIEWBOX_HEIGHT / 2;
    const centerWorldX = (centerScreenX - transform.offsetX) / transform.scale;
    const centerWorldY = (centerScreenY - transform.offsetY) / transform.scale;

    return {
      scale: nextScale,
      offsetX: centerScreenX - (centerWorldX * nextScale),
      offsetY: centerScreenY - (centerWorldY * nextScale)
    };
  }

  private buildCustomCourseFitTransform(): { scale: number; offsetX: number; offsetY: number } {
    const markers = this.currentCustomMarkers;
    const startLine = this.selectedCustomStartLine;
    const finishLine = this.selectedCustomFinishLine;
    const objectBounds = this.currentRaceObjects.flatMap(area => {
      const stampBounds = area.stamps.flatMap(stamp => {
        const radius = Math.max(0, stamp.radius ?? 0);
        return [
          { x: stamp.x - radius, y: stamp.y - radius },
          { x: stamp.x + radius, y: stamp.y + radius }
        ];
      });
      return [{ ...area.center }, ...stampBounds];
    });
    const points: CoursePoint[] = [
      { ...CUSTOM_SAIL_ORIGIN },
      ...markers.map(marker => ({ x: marker.x, y: marker.y })),
      ...(startLine ? [{ ...startLine.boat }, { ...startLine.pin }] : []),
      ...(finishLine ? [{ ...finishLine.boat }, { ...finishLine.pin }] : []),
      ...objectBounds
    ];

    if (points.length === 0) {
      return this.buildCourseFitTransform();
    }

    const rawMinX = Math.min(...points.map(point => point.x));
    const rawMaxX = Math.max(...points.map(point => point.x));
    const rawMinY = Math.min(...points.map(point => point.y));
    const rawMaxY = Math.max(...points.map(point => point.y));
    const centerX = (rawMinX + rawMaxX) / 2;
    const centerY = (rawMinY + rawMaxY) / 2;
    const width = Math.max(220, (rawMaxX - rawMinX) + 88);
    const height = Math.max(220, (rawMaxY - rawMinY) + 88);
    const minX = centerX - (width / 2);
    const minY = centerY - (height / 2);
    const scale = Math.min(
      (COURSE_VIEWBOX_WIDTH - (OBJECT_DRAW_FIT_PADDING * 2)) / width,
      (COURSE_VIEWBOX_HEIGHT - (OBJECT_DRAW_FIT_PADDING * 2)) / height
    );

    return {
      scale,
      offsetX: ((COURSE_VIEWBOX_WIDTH - (width * scale)) / 2) - (minX * scale),
      offsetY: ((COURSE_VIEWBOX_HEIGHT - (height * scale)) / 2) - (minY * scale)
    };
  }

  private buildStartSelectionTransform(startLine: StartLineConfig): { scale: number; offsetX: number; offsetY: number } {
    const minX = Math.min(startLine.boat.x, startLine.pin.x);
    const maxX = Math.max(startLine.boat.x, startLine.pin.x);
    const minY = Math.min(startLine.boat.y, startLine.pin.y);
    const maxY = Math.max(startLine.boat.y, startLine.pin.y);
    const width = Math.max(88, (maxX - minX) + 64);
    const height = Math.max(132, (maxY - minY) + 64);
    const centerX = (startLine.boat.x + startLine.pin.x) / 2;
    const centerY = (startLine.boat.y + startLine.pin.y) / 2;
    const scale = Math.min(
      (COURSE_VIEWBOX_WIDTH - 34) / width,
      (COURSE_VIEWBOX_HEIGHT - 52) / height
    );

    return {
      scale,
      offsetX: COURSE_CAMERA_CENTER.x - (centerX * scale),
      offsetY: (COURSE_CAMERA_CENTER.y - 28) - (centerY * scale)
    };
  }

  private cloneReplayObjects(objects: ReplayObjectArea[]): ReplayObjectArea[] {
    return objects.map(area => ({
      ...area,
      center: { ...area.center },
      stamps: area.stamps.map(stamp => ({ ...stamp }))
    }));
  }

  private cloneCustomCourse(course: CustomCourseDefinition): CustomCourseDefinition {
    return {
      ...course,
      markers: course.markers.map(marker => ({ ...marker })),
      startLine: course.startLine
        ? {
          boat: { ...course.startLine.boat },
          pin: { ...course.startLine.pin }
        }
        : null,
      finishLine: course.finishLine
        ? {
          boat: { ...course.finishLine.boat },
          pin: { ...course.finishLine.pin }
        }
        : null,
      startFinishMerged: !!course.startFinishMerged
    };
  }

  private persistSelectedCustomCourse() {
    if (!this.selectedCustomCourse) return;
    this.selectedCustomCourse = {
      ...this.selectedCustomCourse,
      updatedAt: new Date().toISOString()
    };
    this.storage.saveCustomCourse(this.cloneCustomCourse(this.selectedCustomCourse));
  }

  private pushCustomCourseHistory() {
    if (!this.selectedCustomCourse) return;
    this.customCourseHistory.push({
      course: this.cloneCustomCourse(this.selectedCustomCourse),
      objects: this.cloneReplayObjects(this.currentRaceObjects)
    });
    if (this.customCourseHistory.length > 40) {
      this.customCourseHistory.shift();
    }
  }

  private placeCustomCourseElement(point: CoursePoint) {
    if (!this.selectedCustomCourse || !this.customCoursePlacementTool) return;
    this.pushCustomCourseHistory();

    switch (this.customCoursePlacementTool) {
      case 'mark':
        this.selectedCustomCourse = {
          ...this.selectedCustomCourse,
          markers: [
            ...this.selectedCustomCourse.markers,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              x: point.x,
              y: point.y,
              label: String(this.getNextCustomCourseSequenceNumber()),
              kind: 'mark',
              color: this.getDefaultMarkerColor()
            }
          ]
        };
        this.persistSelectedCustomCourse();
        return;
      case 'start':
        this.placeCustomCourseLine('startLine', point);
        return;
      case 'finish':
        this.placeCustomCourseLine('finishLine', point);
        return;
      case 'gate':
        this.placeCustomCourseGate(point);
        return;
    }
  }

  private placeCustomCourseLine(kind: 'startLine' | 'finishLine', point: CoursePoint) {
    if (!this.selectedCustomCourse) return;
    if (!this.pendingCustomCourseLineAnchor) {
      this.pendingCustomCourseLineAnchor = point;
      return;
    }

    const anchor = this.pendingCustomCourseLineAnchor;
    this.pendingCustomCourseLineAnchor = null;
    const normalizedLine = this.normalizeCustomCourseLine(anchor, point);
    if (kind === 'finishLine' && this.shouldOfferMergeStartFinish(normalizedLine)) {
      this.openMergeStartFinishConfirm('custom', normalizedLine);
      return;
    }
    this.selectedCustomCourse = {
      ...this.selectedCustomCourse,
      startFinishMerged: false,
      [kind]: {
        boat: normalizedLine.boat,
        pin: normalizedLine.pin
      }
    };
    this.persistSelectedCustomCourse();
  }

  private normalizeCustomCourseLine(a: CoursePoint, b: CoursePoint): { boat: CoursePoint; pin: CoursePoint } {
    const orderedLine = a.x === b.x
      ? (
        a.y <= b.y
          ? { boat: { ...a }, pin: { ...b } }
          : { boat: { ...b }, pin: { ...a } }
      )
      : (
        a.x >= b.x
          ? { boat: { ...a }, pin: { ...b } }
          : { boat: { ...b }, pin: { ...a } }
      );

    return this.normalizeStartLineLength(orderedLine);
  }

  private normalizeStartLineLength(line: StartLineConfig): StartLineConfig {
    const dx = line.pin.x - line.boat.x;
    const dy = line.pin.y - line.boat.y;
    const length = Math.hypot(dx, dy);
    if (!length || length >= START_LINE_MIN_LENGTH) {
      return {
        boat: { ...line.boat },
        pin: { ...line.pin }
      };
    }

    const extend = (START_LINE_MIN_LENGTH - length) / 2;
    const ux = dx / length;
    const uy = dy / length;

    return {
      boat: {
        x: line.boat.x - (ux * extend),
        y: line.boat.y - (uy * extend)
      },
      pin: {
        x: line.pin.x + (ux * extend),
        y: line.pin.y + (uy * extend)
      }
    };
  }

  private placeCustomCourseGate(point: CoursePoint) {
    if (!this.selectedCustomCourse) return;
    if (!this.pendingCustomCourseGateAnchor) {
      this.pendingCustomCourseGateAnchor = point;
      return;
    }

    const anchor = this.pendingCustomCourseGateAnchor;
    this.pendingCustomCourseGateAnchor = null;
    const sequenceNumber = this.getNextCustomCourseSequenceNumber();
    const gateCount = this.getExistingCustomGateCount();
    const suffix = gateCount % 2 === 0 ? 'S' : 'P';
    const groupId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const label = `${sequenceNumber}${suffix}`;
    this.selectedCustomCourse = {
      ...this.selectedCustomCourse,
      markers: [
        ...this.selectedCustomCourse.markers,
        {
          id: `${groupId}-a`,
          x: anchor.x,
          y: anchor.y,
          label,
          kind: 'gate',
          groupId,
          color: this.getDefaultMarkerColor()
        },
        {
          id: `${groupId}-b`,
          x: point.x,
          y: point.y,
          label,
          kind: 'gate',
          groupId,
          color: this.getDefaultMarkerColor()
        }
      ]
    };
    this.persistSelectedCustomCourse();
  }

  private getNextCustomCourseSequenceNumber(): number {
    if (!this.selectedCustomCourse) return 1;
    const gateGroupIds = new Set<string>();
    let count = 0;

    for (const marker of this.selectedCustomCourse.markers) {
      if (marker.kind === 'mark') {
        count += 1;
        continue;
      }
      if (marker.groupId && !gateGroupIds.has(marker.groupId)) {
        gateGroupIds.add(marker.groupId);
        count += 1;
      }
    }

    return count + 1;
  }

  private getExistingCustomGateCount(): number {
    if (!this.selectedCustomCourse) return 0;
    return new Set(
      this.selectedCustomCourse.markers
        .filter(marker => marker.kind === 'gate' && marker.groupId)
        .map(marker => marker.groupId!)
    ).size;
  }

  private promptForOtherObjectName(areaId: string) {
    if (!this.currentRacePreviewKey) return;
    const area = (this.raceObjectsByPreview[this.currentRacePreviewKey] ?? [])
      .find(entry => entry.id === areaId);
    if (!area || area.kind !== 'sonstiges' || area.label) return;
    this.pendingOtherObjectAreaId = areaId;
    this.otherObjectNameDraft = '';
    this.otherObjectNameOpen = true;
  }

  private closeOtherObjectName() {
    this.otherObjectNameOpen = false;
    this.otherObjectNameDraft = '';
    this.pendingOtherObjectAreaId = null;
  }

  private getObjectToolConfig(kind: ReplayObjectKind): ObjectToolOption {
    return this.objectToolOptions.find(option => option.id === kind) ?? OBJECT_TOOL_OPTIONS[OBJECT_TOOL_OPTIONS.length - 1];
  }

  saveSpotModal() {
    this.spotName = this.tempSpotName.trim();
    this.startDate = this.tempStartDate;
    this.persistSpotSelection();
    this.spotModalOpen = false;
  }

  private persistSpotSelection() {
    if (this.returnTo !== 'detail') {
      this.storage.saveSpot(this.spotName);
    }
  }

  // Training contents
  get sonstigesContents(): ContentState[] {
    return this.contentStates.filter(s => s.subOptions.length === 0);
  }

  toggleSubOptionDirect(state: ContentState, sub: string) {
    const idx = state.selectedSubs.indexOf(sub);
    if (idx >= 0) state.selectedSubs.splice(idx, 1);
    else state.selectedSubs.push(sub);
    state.selected = state.selectedSubs.length > 0;
  }

  setMaterialSatisfied(val: boolean) {
    this.materialSetupSatisfied = val;
    if (val) this.materialSetupReasons = [];
  }

  toggleMaterialReason(cat: string, option: string) {
    const key = `${cat}: ${option}`;
    const idx = this.materialSetupReasons.indexOf(key);
    if (idx >= 0) {
      this.materialSetupReasons.splice(idx, 1);
    } else {
      // Remove any other option from this category first (radio behavior)
      this.materialSetupReasons = this.materialSetupReasons.filter(r => !r.startsWith(`${cat}: `));
      this.materialSetupReasons.push(key);
    }
  }

  hasReason(cat: string, option: string): boolean {
    return this.materialSetupReasons.includes(`${cat}: ${option}`);
  }

  get hasContentSelected(): boolean {
    return this.contentStates.some(s => s.selected);
  }

  get endTimeIsValid(): boolean {
    const start = this.buildDateTime(this.startDate, this.startTimeInput);
    const end = this.buildDateTime(this.startDate, this.endTimeInput);
    if (!start || !end) return false;
    return end > start;
  }

  get canSave(): boolean {
    if (!this.contentStates.some(s => s.selected)) return false;
    if (!this.contentStates.every(s =>
      !s.selected || s.subOptions.length === 0 || s.selectedSubs.length > 0
    )) return false;
    if (this.materialSetupSatisfied === null) return false;
    if (this.materialSetupSatisfied === false && this.materialSetupReasons.length === 0) return false;
    const baseWind = this.parseWindValue(this.windSpeed);
    if (!baseWind || baseWind <= 0) return false;
    if (this.gustWind.trim()) {
      const gust = this.parseWindValue(this.gustWind);
      if (!gust || gust <= 0) return false;
    }
    if (this.energyLevel === null || this.energyLevel < 1 || this.energyLevel > 10) return false;
    if (!this.endTimeIsValid) return false;
    return true;
  }

  get indicatorPos(): { x: number; y: number } {
    const t = this.luisleage / 4;
    const y = APEX_Y + t * SPAN;
    const x = MAST_X + t * LEECH_DX;
    return { x, y };
  }

  get luisleageArea(): string {
    const { x, y } = this.indicatorPos;
    const t = this.luisleage / 4;
    const mastY = Math.round(y - t * t * SPAN * 0.6);
    return `${MAST_X},${APEX_Y} ${x},${y} ${MAST_X},${mastY}`;
  }

  private buildUpdatedSession(): Session {
    const start = this.buildDateTime(this.startDate, this.startTimeInput)!;
    const end = this.buildDateTime(this.startDate, this.endTimeInput)!;
    const trainingContents: TrainingContentSelection[] = this.contentStates
      .filter(s => s.selected)
      .map(s => ({ name: s.name, subSelections: [...s.selectedSubs] }));

    return {
      ...this.session!,
      startTime: start.toISOString(),
      spot: this.spotName || this.session!.spot,
      endTime: end.toISOString(),
      isActive: false,
      trainingContents,
      foilRake: this.session!.foilRake ?? null,
      windSpeed: this.windSpeed || undefined,
      gustWind: this.gustWind || undefined,
      backwingspacer: this.backwingspacer,
      materialSetupSatisfied: this.materialSetupSatisfied!,
      materialSetupReasons: this.materialSetupSatisfied ? undefined : [...this.materialSetupReasons],
      windDreher: this.windDreher || undefined,
      energyLevel: this.energyLevel ?? undefined,
      description: this.notes || undefined,
      windRating: this.session?.windRating,
      sessionRating: this.sessionRating,
      trimm: {
        luisleage: this.luisleage,
        mastPosition: this.mastPosition,
        tampenPosition: this.session?.trimm?.tampenPosition ?? 3,
        wellenGefuehlt: this.wellenGefuehlt,
      },
      replays: Object.values(this.savedRacesByPreview)
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(run => ({
          ...run,
          track: run.track.map(point => ({ ...point })),
          notes: run.notes.map(note => ({ ...note })),
          objects: this.cloneReplayObjects(run.objects ?? []),
          customCourse: run.customCourse ? this.cloneCustomCourse(run.customCourse) : undefined
        }))
    };
  }

  saveSession() {
    if (!this.canSave || !this.session) return;
    const updated = this.buildUpdatedSession();
    this.storage.saveSession(updated);
    this.returnTo === 'detail'
      ? this.router.navigate(['/session', updated.id], { queryParams: { source: this.source } })
      : this.router.navigate(['/home']);
  }
}

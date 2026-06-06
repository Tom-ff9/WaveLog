export type RacingClass =
  | 'Junior Men' | 'Junior Women'
  | 'Youth Men'  | 'Youth Women'
  | 'Senior Men' | 'Senior Women';

export interface UserProfile {
  firstName:   string;
  lastName:    string;
  weight:      number | null;
  racingClass: RacingClass | null;
  frontwing:   string;
  gabel:       string;
  segel:       string;
  board:       string;
}

export type WindCondition = 'Am Wind' | 'Halb Wind' | 'Light Wind';
export type CourseType = 'Längskurs' | 'Querkurs' | 'Downwind';
export type TrainingPhase = 'Anfänger' | 'Aufbau' | 'Wettkampf' | 'Sonstiges';
export type LearningCategory =
  | 'Manöver' | 'Rennen' | 'Anpassschläge' | 'Kurse'
  | 'Tonnenrundung' | 'Start Training' | 'Pumpen'
  | 'Regatta Taktik' | 'Taktik' | 'Wenden';

export type WindCharacter = 'böig' | 'konstant';

export interface TrimmDetails {
  luisleage: number;      // 1-4 (which batten)
  mastPosition: number;   // 0-100 (Hinten → Vorne)
  tampenPosition: number; // 1-5
  wellenGefuehlt: number; // 1-5
}

export interface TrainingContentSelection {
  name: string;
  subSelections: string[];
}

export interface EquipmentSetup {
  sail: string;
  board: string;
  mast: string;
  fin: string;
  mastTrackPosition: number;
  notes: string;
}

export interface Learning {
  id: string;
  sessionId: string;
  category: LearningCategory;
  text: string;
  timestamp: string;
}

// Standalone learning register (not tied to sessions)
export interface LearningEntry {
  id: string;
  category: string;
  subCategory?: string;
  text: string;
  timestamp: string;
}

export interface ReplayNote {
  id: string;
  x: number;
  y: number;
  text: string;
  kind?: 'note' | 'maneuver' | 'start' | 'finish';
  trackIndex: number;
}

export interface CustomCoursePoint {
  x: number;
  y: number;
}

export interface CustomCourseLine {
  boat: CustomCoursePoint;
  pin: CustomCoursePoint;
}

export interface CustomCourseMarker {
  id: string;
  x: number;
  y: number;
  label: string;
  kind: 'mark' | 'gate';
  groupId?: string;
  color?: CourseMarkerColor;
}

export type CourseMarkerColor = 'black' | 'white' | 'blue' | 'yellow' | 'orange' | 'green';

export interface CustomCourseDefinition {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  markers: CustomCourseMarker[];
  startLine: CustomCourseLine | null;
  finishLine: CustomCourseLine | null;
  startFinishMerged?: boolean;
}

export type ReplayObjectKind = 'land' | 'berg' | 'hochhaus' | 'wolke' | 'boe' | 'sonstiges';

export interface ReplayObjectStamp {
  x: number;
  y: number;
  radius: number;
}

export interface ReplayObjectArea {
  id: string;
  kind: ReplayObjectKind;
  center: { x: number; y: number };
  stamps: ReplayObjectStamp[];
  label?: string;
}

export interface ReplayRun {
  id: string;
  courseId: string;
  previewKey: string;
  title: string;
  createdAt: string;
  regattaName: string;
  raceName: string;
  raceNumber?: number;
  placement?: number;
  track: Array<{ x: number; y: number }>;
  notes: ReplayNote[];
  objects?: ReplayObjectArea[];
  customCourse?: CustomCourseDefinition;
}

export interface Session {
  id: string;
  startTime: string;
  endTime?: string;
  isActive: boolean;
  spot?: string;
  windSpeed?: number | string;  // entered before session (in session-active); supports ranges like "22-25"
  gustWind?: number | string;
  windSpeedFelt?: number | string;  // felt during session (in session-end); supports ranges like "4-12"
  energyLevel?: number;
  // Session-end fields
  trainingContents?: TrainingContentSelection[];
  foilRake?: number | null;
  backwingspacer?: number;
  materialSetupSatisfied?: boolean;
  materialSetupReasons?: string[];
  windCharacter?: WindCharacter;
  windDreher?: string;
  windRating?: number;
  sessionRating?: number;
  // Legacy fields (kept for existing data)
  trainingPhase?: TrainingPhase;
  description?: string;
  courseType?: CourseType;
  windCondition?: WindCondition;
  trimm?: TrimmDetails;
  setup?: EquipmentSetup;
  replays?: ReplayRun[];
  learnings: Learning[];
}

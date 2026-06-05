import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { ReplayRun, Session, LearningEntry } from '../models/session.model';
import { NavComponent } from '../nav/nav';
import { LearningsComponent } from '../learnings/learnings';

const MONTHS_DE = [
  'Januar','Februar','März','April','Mai','Juni',
  'Juli','August','September','Oktober','November','Dezember'
];

const WIND_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '5-10',  min: 5,   max: 10 },
  { label: '10-15', min: 10,  max: 15 },
  { label: '15-20', min: 15,  max: 20 },
  { label: '20-25', min: 20,  max: 25 },
  { label: '25-30', min: 25,  max: 30 },
  { label: '30-35', min: 30,  max: 35 },
  { label: '35+',   min: 35,  max: Infinity },
];

const CHART_COLORS = [
  '#4FC3F7','#81C784','#FFB74D','#E57373','#BA68C8',
  '#4DB6AC','#F06292','#FFF176','#A1887F','#90A4AE',
  '#7986CB','#FF8A65','#80CBC4','#CE93D8','#FFCC02',
  '#EF9A9A','#80DEEA','#A5D6A7'
];

export interface CalCell {
  day: number | null;
  hasSession: boolean;
  isToday: boolean;
}

export interface TrainingSub {
  name: string;
  count: number;
}

export interface TrainingItem {
  name: string;
  count: number;
  color: string;
  subs: TrainingSub[];
}

export interface PieSliceSub {
  name: string;
  count: number;
  percent: number;
}

export interface PieSlice {
  name: string;
  count: number;
  color: string;
  path: string;
  percent: number;
  labelX: number;
  labelY: number;
  subs: PieSliceSub[];
}

export interface WindBarSubSeg {
  name: string;
  opacity: number;
  y: number;
  height: number;
}

export interface WindBarSegment {
  category: string;
  color: string;
  y: number;
  height: number;
  subs: WindBarSubSeg[];  // empty → render as single block
}

export interface WindBar {
  label: string;
  x: number;
  width: number;
  total: number;
  segments: WindBarSegment[];
}

export interface WindChartData {
  viewBox: string;
  cL: number; cT: number; cB: number; cR: number;
  gridLines: Array<{ y: number }>;
  yLabels: Array<{ y: number; value: number }>;
  bars: WindBar[];
  cats: Array<{ name: string; color: string; subs: Array<{ name: string; opacity: number }> }>;
}

export interface DurationPoint {
  cx: number;
  cy: number;
  color: string;
}

export interface MatPoint {
  cx: number;
  cy: number;
  color: string;
}

export interface MatYTick {
  y: number;
  label: string;
}

export interface MatConfig {
  yLabel: string;
  yTicks: MatYTick[];
}

interface ReplayAnalysisItem extends ReplayRun {
  sessionId: string;
  sessionDate: string;
  spot?: string;
  displayCourseTitle: string;
}

interface ReplayRegattaGroup {
  key: string;
  regattaName: string;
  displayName: string;
  spot?: string;
  runs: ReplayAnalysisItem[];
}

@Component({
  selector: 'app-auswertung',
  standalone: true,
  imports: [NavComponent, LearningsComponent, FormsModule],
  templateUrl: './auswertung.html'
})
export class AuswertungComponent {
  private storage = inject(StorageService);
  private router  = inject(Router);
  private route = inject(ActivatedRoute);

  activeView: 'kalender' | 'daten' | 'learnings' | 'replays' = 'kalender';
  chartType: 'balken' | 'kreis' | 'wind' = 'balken';

  // Shared Daten filter (Trainingsinhalte + Material + Stimmung)
  filterMode: 'gesamt' | 'jahr' | 'monat' = 'gesamt';
  filterYear  = new Date().getFullYear();
  filterMonth = new Date().getMonth(); // 0-based

  // Material view
  readonly MAT_CATS = ['Backwing Spacer', 'Luisleage', 'Mastfuß', 'Tampenposition'];
  matCatIndex = 0;

  viewYear  = new Date().getFullYear();
  viewMonth = new Date().getMonth();   // 0-based
  readonly currentYear = new Date().getFullYear();

  // Calendar drill-down state
  selectedCalDay: number | null = null;
  editingReplayId: string | null = null;
  openReplayGroupName: string | null = null;
  replayEditRegattaName = '';
  replayEditRaceNumber = '';
  replayEditDate = '';
  replayEditSpot = '';
  swipedReplayId: string | null = null;
  private replaySwipeStartX: number | null = null;
  private replaySwipeRunId: string | null = null;
  private replaySwipeActivated = false;
  private suppressReplayItemClickId: string | null = null;
  private replaySwipeDeltaX = 0;
  private replaySwipeBaseOffset = 0;
  confirmDeleteReplayId: string | null = null;

  constructor() {
    const view = this.route.snapshot.queryParamMap.get('view');
    if (view === 'kalender' || view === 'daten' || view === 'learnings' || view === 'replays') {
      this.activeView = view;
    }
    this.openReplayGroupName = this.route.snapshot.queryParamMap.get('regatta');
  }

  private get sessions(): Session[] {
    return this.storage.getSessions().filter(s => !s.isActive);
  }

  private get allSessions(): Session[] {
    return this.storage.getSessions();
  }

  readonly weekdays = ['Mo','Di','Mi','Do','Fr','Sa','So'];

  setView(view: 'kalender' | 'daten' | 'learnings' | 'replays') {
    this.activeView = view;
  }

  get replayGroups(): ReplayRegattaGroup[] {
    const grouped = new Map<string, ReplayAnalysisItem[]>();
    const regattaNameCounts = new Map<string, number>();

    for (const session of this.allSessions) {
      for (const replay of session.replays ?? []) {
        const regattaName = replay.regattaName?.trim() || 'Ohne Regatta';
        const spot = session.spot?.trim() || '';
        const key = this.buildReplayGroupKey(regattaName, spot);
        if (!grouped.has(key)) {
          grouped.set(key, []);
          regattaNameCounts.set(regattaName, (regattaNameCounts.get(regattaName) ?? 0) + 1);
        }
        grouped.get(key)!.push({
          ...replay,
          sessionId: session.id,
          sessionDate: session.startTime,
          spot: session.spot,
          displayCourseTitle: replay.raceName || replay.title || 'Replay'
        });
      }
    }

    return [...grouped.entries()]
      .map(([key, runs]) => {
        const regattaName = runs[0]?.regattaName?.trim() || 'Ohne Regatta';
        const spot = runs[0]?.spot?.trim() || '';
        const displayName = (regattaNameCounts.get(regattaName) ?? 0) > 1 && spot
          ? `${regattaName} · ${spot}`
          : regattaName;
        return {
          key,
          regattaName,
          displayName,
          spot: spot || undefined,
          runs: runs.sort((a, b) => this.compareReplayRuns(a, b))
        };
      })
      .sort((a, b) => {
        const aLatest = a.runs[0] ? new Date(a.runs[0].createdAt).getTime() : 0;
        const bLatest = b.runs[0] ? new Date(b.runs[0].createdAt).getTime() : 0;
        return bLatest - aLatest;
      });
  }

  replayRunLabel(run: ReplayAnalysisItem): string {
    return run.raceNumber ? `Rennen ${run.raceNumber}` : run.displayCourseTitle;
  }

  replayGroupDateLabel(group: ReplayRegattaGroup): string {
    if (group.runs.length === 0) return '';
    const timestamps = group.runs
      .map(run => new Date(run.createdAt).getTime())
      .filter(ts => !Number.isNaN(ts))
      .sort((a, b) => a - b);

    if (timestamps.length === 0) return '';

    const start = this.formatReplayDate(new Date(timestamps[0]).toISOString());
    const end = this.formatReplayDate(new Date(timestamps[timestamps.length - 1]).toISOString());
    return start === end ? start : `${start} - ${end}`;
  }

  replayRunMeta(run: ReplayAnalysisItem): string {
    const base = this.formatReplayDate(run.createdAt);
    return run.spot ? `${base} · ${run.spot}` : base;
  }

  openReplayGroup(group: ReplayRegattaGroup) {
    this.openReplayGroupName = group.key;
    this.swipedReplayId = null;
  }

  closeReplayGroup() {
    this.openReplayGroupName = null;
    this.swipedReplayId = null;
    this.confirmDeleteReplayId = null;
    this.cancelReplayEdit();
  }

  get activeReplayGroup(): ReplayRegattaGroup | null {
    if (!this.openReplayGroupName) return null;
    return this.replayGroups.find(group => group.key === this.openReplayGroupName) ?? null;
  }

  openReplay(run: ReplayAnalysisItem) {
    this.swipedReplayId = null;
    this.router.navigate(['/session/end'], {
      queryParams: {
        id: run.sessionId,
        source: 'analysis',
        replayId: run.id,
        view: 'replays',
        regatta: this.buildReplayGroupKey(run.regattaName?.trim() || 'Ohne Regatta', run.spot?.trim() || '')
      }
    });
  }

  isEditingReplay(run: ReplayAnalysisItem): boolean {
    return this.editingReplayId === run.id;
  }

  startReplayEdit(run: ReplayAnalysisItem) {
    this.swipedReplayId = null;
    this.editingReplayId = run.id;
    this.replayEditRegattaName = run.regattaName;
    this.replayEditRaceNumber = run.raceNumber ? String(run.raceNumber) : '';
    this.replayEditDate = new Date(run.createdAt).toISOString().slice(0, 10);
    this.replayEditSpot = run.spot?.trim() || '';
  }

  cancelReplayEdit() {
    this.editingReplayId = null;
    this.replayEditRegattaName = '';
    this.replayEditRaceNumber = '';
    this.replayEditDate = '';
    this.replayEditSpot = '';
  }

  setReplayEditRaceNumber(raw: string) {
    this.replayEditRaceNumber = raw.replace(/\D+/g, '');
  }

  saveReplayEdit(run: ReplayAnalysisItem) {
    const session = this.allSessions.find(s => s.id === run.sessionId);
    if (!session?.replays) return;

    const updatedReplays = session.replays.map(replay => {
      if (replay.id !== run.id) return replay;
      const raceNumber = this.replayEditRaceNumber.trim()
        ? Math.max(1, parseInt(this.replayEditRaceNumber, 10) || 1)
        : undefined;
      const createdAt = this.replayEditDate
        ? new Date(`${this.replayEditDate}T12:00:00`).toISOString()
        : replay.createdAt;

      return {
        ...replay,
        regattaName: this.replayEditRegattaName.trim() || 'Ohne Regatta',
        raceNumber,
        createdAt,
        title: `${replay.raceName}${raceNumber ? ` · Rennen ${raceNumber}` : ''}`
      };
    });

    this.storage.saveSession({
      ...session,
      spot: this.replayEditSpot.trim() || session.spot,
      replays: updatedReplays
    });

    this.cancelReplayEdit();
  }

  beginReplaySwipe(event: PointerEvent, run: ReplayAnalysisItem) {
    this.replaySwipeStartX = event.clientX;
    this.replaySwipeRunId = run.id;
    this.replaySwipeActivated = false;
    this.replaySwipeBaseOffset = this.swipedReplayId === run.id ? -108 : 0;
    this.replaySwipeDeltaX = this.replaySwipeBaseOffset;
  }

  trackReplaySwipe(event: PointerEvent) {
    if (this.replaySwipeStartX === null || !this.replaySwipeRunId) return;
    const deltaX = event.clientX - this.replaySwipeStartX;
    this.replaySwipeDeltaX = Math.max(-108, Math.min(0, this.replaySwipeBaseOffset + deltaX));
    if (Math.abs(deltaX) > 10) {
      this.replaySwipeActivated = true;
    }
  }

  endReplaySwipe() {
    if (this.replaySwipeRunId) {
      if (this.replaySwipeDeltaX <= -54) {
        this.swipedReplayId = this.replaySwipeRunId;
      } else if (this.swipedReplayId === this.replaySwipeRunId) {
        this.swipedReplayId = null;
      }
    }
    if (this.replaySwipeActivated && this.replaySwipeRunId) {
      const runId = this.replaySwipeRunId;
      this.suppressReplayItemClickId = runId;
      window.setTimeout(() => {
        if (this.suppressReplayItemClickId === runId) {
          this.suppressReplayItemClickId = null;
        }
      }, 220);
    }
    this.replaySwipeStartX = null;
    this.replaySwipeRunId = null;
    this.replaySwipeActivated = false;
    this.replaySwipeBaseOffset = 0;
    this.replaySwipeDeltaX = 0;
  }

  isReplaySwiped(run: ReplayAnalysisItem): boolean {
    return this.swipedReplayId === run.id;
  }

  replaySwipeOffset(run: ReplayAnalysisItem): number {
    if (this.replaySwipeRunId === run.id && this.replaySwipeStartX !== null) {
      return this.replaySwipeDeltaX;
    }
    return this.swipedReplayId === run.id ? -108 : 0;
  }

  onReplayItemTap(run: ReplayAnalysisItem) {
    if (this.suppressReplayItemClickId === run.id) {
      this.suppressReplayItemClickId = null;
      return;
    }

    if (this.isReplaySwiped(run)) {
      this.swipedReplayId = null;
      return;
    }

    this.openReplay(run);
  }

  promptReplayDelete(run: ReplayAnalysisItem) {
    this.confirmDeleteReplayId = run.id;
    this.swipedReplayId = null;
  }

  cancelReplayDelete() {
    this.confirmDeleteReplayId = null;
  }

  deleteReplay(run: ReplayAnalysisItem) {
    const session = this.allSessions.find(s => s.id === run.sessionId);
    if (!session?.replays) return;

    this.storage.saveSession({
      ...session,
      replays: session.replays.filter(replay => replay.id !== run.id)
    });

    this.confirmDeleteReplayId = null;
    this.editingReplayId = this.editingReplayId === run.id ? null : this.editingReplayId;
    this.swipedReplayId = null;

    const group = this.activeReplayGroup;
    if (group && group.runs.length <= 1) {
      this.closeReplayGroup();
    }
  }

  private formatReplayDate(iso: string): string {
    const date = new Date(iso);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }

  private compareReplayRuns(a: ReplayAnalysisItem, b: ReplayAnalysisItem): number {
    const aHasNumber = typeof a.raceNumber === 'number';
    const bHasNumber = typeof b.raceNumber === 'number';
    if (aHasNumber && bHasNumber && a.raceNumber !== b.raceNumber) {
      return (a.raceNumber as number) - (b.raceNumber as number);
    }
    if (aHasNumber !== bHasNumber) {
      return aHasNumber ? -1 : 1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }

  private buildReplayGroupKey(regattaName: string, spot: string): string {
    return `${regattaName}__${spot}`;
  }

  get learningsGrouped(): { category: string; entries: LearningEntry[] }[] {
    const entries = this.storage.getLearningEntries();
    const grouped = new Map<string, LearningEntry[]>();
    for (const e of entries) {
      const key = e.subCategory ? `${e.category} – ${e.subCategory}` : e.category;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(e);
    }
    return [...grouped.entries()].map(([category, entries]) => ({ category, entries }));
  }

  // ── Range filter navigation ───────────────────────────────────

  get filterMonthLabel(): string {
    return `${MONTHS_DE[this.filterMonth]} ${this.filterYear}`;
  }
  prevFilterYear()  { this.filterYear--; }
  nextFilterYear()  { this.filterYear++; }
  prevFilterMonth() {
    if (this.filterMonth === 0) { this.filterMonth = 11; this.filterYear--; }
    else this.filterMonth--;
  }
  nextFilterMonth() {
    if (this.filterMonth === 11) { this.filterMonth = 0; this.filterYear++; }
    else this.filterMonth++;
  }

  // ── Top stat ─────────────────────────────────────────────────

  get displayedCount(): number {
    return this.dataSessions.length;
  }

  // ── Kalender ─────────────────────────────────────────────────

  get monthLabel(): string {
    return `${MONTHS_DE[this.viewMonth]} ${this.viewYear}`;
  }

  get wasserTage(): number {
    return this.sessions.filter(s => {
      const d = new Date(s.startTime);
      return d.getFullYear() === this.viewYear && d.getMonth() === this.viewMonth;
    }).length;
  }

  get jahresWasserTage(): number {
    return this.sessions.filter(s => new Date(s.startTime).getFullYear() === this.viewYear).length;
  }

  get jahresWasserLabel(): string {
    return this.viewYear === this.currentYear ? 'Wassertage in diesem Jahr' : `Wassertage ${this.viewYear}`;
  }

  get monatsWasserLabel(): string {
    const now = new Date();
    if (this.viewYear === now.getFullYear() && this.viewMonth === now.getMonth()) {
      return 'Wassertage in diesem Monat';
    }
    return `Wassertage im ${MONTHS_DE[this.viewMonth]}`;
  }

  prevMonth() {
    if (this.viewMonth === 0) { this.viewMonth = 11; this.viewYear--; }
    else this.viewMonth--;
  }

  nextMonth() {
    if (this.viewMonth === 11) { this.viewMonth = 0; this.viewYear++; }
    else this.viewMonth++;
  }

  // Calendar drill-down
  get calDayLabel(): string {
    if (this.selectedCalDay === null) return '';
    return `${this.selectedCalDay}. ${MONTHS_DE[this.viewMonth]} ${this.viewYear}`;
  }

  get daySessionsList(): Session[] {
    if (this.selectedCalDay === null) return [];
    return this.sessions.filter(s => {
      const d = new Date(s.startTime);
      return d.getFullYear() === this.viewYear
          && d.getMonth() === this.viewMonth
          && d.getDate() === this.selectedCalDay;
    });
  }

  selectCalDay(day: number) {
    this.selectedCalDay = day;
  }

  closeCalDay() {
    this.selectedCalDay = null;
  }

  openCalSession(session: Session) {
    this.router.navigate(['/session', session.id], { queryParams: { source: 'analysis' } });
  }

  sessionDurationLabel(session: Session): string {
    if (!session.endTime) return '–';
    const ms = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
    const min = Math.round(ms / 60000);
    if (min <= 0) return '–';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }

  formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  get calCells(): CalCell[] {
    const sessionDays = new Set(
      this.sessions
        .filter(s => {
          const d = new Date(s.startTime);
          return d.getFullYear() === this.viewYear && d.getMonth() === this.viewMonth;
        })
        .map(s => new Date(s.startTime).getDate())
    );

    const firstDay    = new Date(this.viewYear, this.viewMonth, 1);
    const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();

    let offset = firstDay.getDay() - 1;
    if (offset < 0) offset = 6;

    const now = new Date();
    const todayDay = (now.getFullYear() === this.viewYear && now.getMonth() === this.viewMonth)
      ? now.getDate()
      : null;

    const cells: CalCell[] = [];
    for (let i = 0; i < offset; i++)       cells.push({ day: null, hasSession: false, isToday: false });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, hasSession: sessionDays.has(d), isToday: d === todayDay });
    return cells;
  }

  // ── Unified filtered sessions (all Daten sections) ───────────

  private get dataSessions(): Session[] {
    return this.sessions.filter(s => {
      const d = new Date(s.startTime);
      if (this.filterMode === 'jahr')  return d.getFullYear() === this.filterYear;
      if (this.filterMode === 'monat') return d.getFullYear() === this.filterYear && d.getMonth() === this.filterMonth;
      return true;
    });
  }

  // ── Balken / Kreis chart ──────────────────────────────────────

  get trainingData(): TrainingItem[] {
    const catMap = new Map<string, { count: number; subs: Map<string, number> }>();

    for (const session of this.dataSessions) {
      for (const tc of session.trainingContents ?? []) {
        if (!catMap.has(tc.name)) catMap.set(tc.name, { count: 0, subs: new Map() });
        const entry = catMap.get(tc.name)!;
        entry.count++;
        for (const sub of tc.subSelections ?? []) {
          entry.subs.set(sub, (entry.subs.get(sub) ?? 0) + 1);
        }
      }
    }

    return [...catMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, data], i) => ({
        name,
        count: data.count,
        color: CHART_COLORS[i % CHART_COLORS.length],
        subs: [...data.subs.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([subName, count]) => ({ name: subName, count }))
      }));
  }

  get maxCount(): number {
    return this.trainingData.reduce((m, d) => Math.max(m, d.count), 1);
  }

  get pieSlices(): PieSlice[] {
    const data = this.trainingData;
    const total = data.reduce((s, d) => s + d.count, 0);
    if (total === 0) return [];

    const cx = 50, cy = 50, r = 38;
    let angle = -Math.PI / 2;

    return data.map(item => {
      const slice = (item.count / total) * 2 * Math.PI;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const midAngle = angle + slice / 2;
      angle += slice;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const large = slice > Math.PI ? 1 : 0;
      const lr = r * 0.62;
      return {
        name:    item.name,
        count:   item.count,
        color:   item.color,
        path:    `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`,
        percent: Math.round((item.count / total) * 100),
        labelX:  cx + lr * Math.cos(midAngle),
        labelY:  cy + lr * Math.sin(midAngle),
        subs:    item.subs.map(s => ({
          name:    s.name,
          count:   s.count,
          percent: Math.round((s.count / total) * 100)
        }))
      };
    });
  }

  // ── Wind stacked chart ────────────────────────────────────────

  /** Parse a wind value – supports number or "X-Y" range string → average */
  private parseWind(v: number | string | null | undefined): number | null {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    const m = String(v).match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
    if (m) return (parseFloat(m[1]) + parseFloat(m[2])) / 2;
    const n = parseFloat(String(v));
    return isNaN(n) ? null : n;
  }

  /**
   * Effective wind logic:
   * – both missing → null
   * – one missing → use the other
   * – |felt − measured| > 8 kn → use felt only
   * – otherwise → 70 % felt + 30 % measured
   */
  private effectiveWind(s: Session): number | null {
    const measured = this.parseWind(s.windSpeed);
    const felt     = this.parseWind(s.windSpeedFelt);
    if (felt === null && measured === null) return null;
    if (felt === null) return measured;
    if (measured === null) return felt;
    return Math.abs(felt - measured) > 8
      ? felt
      : 0.7 * felt + 0.3 * measured;
  }

  /**
   * Flat category order is computed once from ALL-TIME sessions so colors
   * stay consistent when switching the time filter.
   */
  private get allTimeFlatOrder(): string[] {
    const counts = new Map<string, number>();
    for (const s of this.sessions) {
      for (const tc of s.trainingContents ?? []) {
        counts.set(tc.name, (counts.get(tc.name) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }

  get windChartData(): WindChartData | null {
    const orderedCats = this.allTimeFlatOrder;
    if (orderedCats.length === 0) return null;

    const colorMap = new Map<string, string>();
    orderedCats.forEach((cat, i) => colorMap.set(cat, CHART_COLORS[i % CHART_COLORS.length]));

    // Accumulate: bucket → cat → count  AND  bucket → cat → sub → count
    const bucketMap    = new Map<string, Map<string, number>>();
    const bucketSubMap = new Map<string, Map<string, Map<string, number>>>();
    // Also track global sub-counts per cat for consistent legend ordering
    const globalSubCounts = new Map<string, Map<string, number>>();

    for (const b of WIND_BUCKETS) {
      bucketMap.set(b.label, new Map());
      bucketSubMap.set(b.label, new Map());
    }

    for (const s of this.dataSessions) {
      const wind = this.effectiveWind(s);
      if (wind === null) continue;
      const bucket = WIND_BUCKETS.find(b => wind >= b.min && wind < b.max);
      if (!bucket) continue;
      const bm  = bucketMap.get(bucket.label)!;
      const bsm = bucketSubMap.get(bucket.label)!;

      for (const tc of s.trainingContents ?? []) {
        bm.set(tc.name, (bm.get(tc.name) ?? 0) + 1);

        if ((tc.subSelections ?? []).length > 0) {
          if (!bsm.has(tc.name)) bsm.set(tc.name, new Map());
          if (!globalSubCounts.has(tc.name)) globalSubCounts.set(tc.name, new Map());
          const bsmCat = bsm.get(tc.name)!;
          const gsc    = globalSubCounts.get(tc.name)!;
          for (const sub of tc.subSelections) {
            bsmCat.set(sub, (bsmCat.get(sub) ?? 0) + 1);
            gsc.set(sub, (gsc.get(sub) ?? 0) + 1);
          }
        }
      }
    }

    const activeBuckets = WIND_BUCKETS.filter(b =>
      [...(bucketMap.get(b.label)!.values())].some(v => v > 0)
    );
    if (activeBuckets.length === 0) return null;

    let maxTotal = 0;
    for (const b of activeBuckets) {
      const total = [...(bucketMap.get(b.label)!.values())].reduce((s, v) => s + v, 0);
      maxTotal = Math.max(maxTotal, total);
    }
    const yMax = Math.ceil(maxTotal / 5) * 5 || 5;

    const cL = 33, cT = 8, cB = 148, cR = 297;
    const chartH = cB - cT;
    const chartW = cR - cL;
    const n = activeBuckets.length;
    const gap = 8;
    const barWidth = Math.min(50, Math.floor((chartW - (n - 1) * gap) / n));
    const totalW = n * barWidth + (n - 1) * gap;
    const startX = cL + (chartW - totalW) / 2;
    const yScale = (v: number) => cB - (v / yMax) * chartH;

    const step = yMax <= 5 ? 1 : yMax <= 10 ? 2 : yMax <= 20 ? 5 : 10;
    const yLabels: { y: number; value: number }[] = [];
    const gridLines: { y: number }[]               = [];
    for (let v = 0; v <= yMax; v += step) {
      const y = yScale(v);
      yLabels.push({ y, value: v });
      if (v > 0) gridLines.push({ y });
    }

    // Opacity levels for sub-category shading (bottom → top = most → least common)
    const SUB_OPACITIES = [1.0, 0.6, 0.38, 0.22];

    const presentCats = new Set<string>();
    const bars: WindBar[] = activeBuckets.map((b, bi) => {
      const bm  = bucketMap.get(b.label)!;
      const bsm = bucketSubMap.get(b.label)!;
      const barX = startX + bi * (barWidth + gap);
      let yBottom = cB;
      const segments: WindBarSegment[] = [];

      for (const cat of orderedCats) {
        const count = bm.get(cat) ?? 0;
        if (count === 0) continue;
        const segH = Math.max(1, (count / yMax) * chartH);
        const segY = yBottom - segH;

        // Build sub-segments (proportion of sub-counts within this parent block)
        const subMap = bsm.get(cat);
        const subs: WindBarSubSeg[] = [];
        if (subMap && subMap.size > 0) {
          const subTotal   = [...subMap.values()].reduce((s, v) => s + v, 0);
          const sortedSubs = [...subMap.entries()].sort((a, b) => b[1] - a[1]);
          let subYBottom   = segY + segH;
          for (let si = 0; si < sortedSubs.length; si++) {
            const [subName, subCount] = sortedSubs[si];
            const subH = Math.max(0.5, (subCount / subTotal) * segH);
            const subY = subYBottom - subH;
            subs.push({ name: subName, opacity: SUB_OPACITIES[si] ?? 0.15, y: subY, height: subH });
            subYBottom = subY;
          }
        }

        segments.push({ category: cat, color: colorMap.get(cat)!, y: segY, height: segH, subs });
        presentCats.add(cat);
        yBottom = segY;
      }

      const total = [...bm.values()].reduce((s, v) => s + v, 0);
      return { label: b.label, x: barX, width: barWidth, total, segments };
    });

    const cats = orderedCats
      .filter(c => presentCats.has(c))
      .map(c => ({
        name:  c,
        color: colorMap.get(c)!,
        subs:  [...(globalSubCounts.get(c) ?? new Map()).entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([sub], i) => ({ name: sub, opacity: SUB_OPACITIES[i] ?? 0.15 }))
      }));

    return { viewBox: '0 0 300 165', cL, cT, cB, cR, gridLines, yLabels, bars, cats };
  }

  // ── Material view ─────────────────────────────────────────────

  prevMatCat() {
    this.matCatIndex = (this.matCatIndex - 1 + this.MAT_CATS.length) % this.MAT_CATS.length;
  }
  nextMatCat() {
    this.matCatIndex = (this.matCatIndex + 1) % this.MAT_CATS.length;
  }

  /** Deterministic jitter so overlapping points spread into a cluster. */
  private hashJitter(id: string, salt: number, range: number): number {
    let h = salt * 997;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
    return ((h % 2000) / 2000 - 0.5) * range * 2;
  }

  // Scatter-plot SVG constants (viewBox 0 0 320 185)
  private readonly MAT_CL = 40;
  private readonly MAT_CT = 12;
  private readonly MAT_CB = 148;
  private readonly MAT_CR = 308;

  /** SVG x-position for a wind value (capped at 40 kn). */
  matWindX(wind: number): number {
    const w = Math.min(Math.max(wind, 0), 40);
    return this.MAT_CL + (w / 40) * (this.MAT_CR - this.MAT_CL);
  }

  /** SVG y-position for a value within [yMin, yMax]. */
  matValY(value: number, yMin: number, yMax: number): number {
    return this.MAT_CB - ((value - yMin) / (yMax - yMin)) * (this.MAT_CB - this.MAT_CT);
  }

  /** Y-axis ticks configuration per category. */
  get matConfig(): MatConfig {
    const y = (v: number, mn: number, mx: number) => this.matValY(v, mn, mx);
    switch (this.MAT_CATS[this.matCatIndex]) {
      case 'Luisleage':
        return {
          yLabel: 'Latte',
          yTicks: [
            { y: y(0, 0, 4), label: '0' },
            { y: y(1, 0, 4), label: '1' },
            { y: y(2, 0, 4), label: '2' },
            { y: y(3, 0, 4), label: '3' },
            { y: y(4, 0, 4), label: '4' },
          ]
        };
      case 'Mastfuß':
        return {
          yLabel: 'Mastfuß',
          yTicks: [
            { y: y(0,   0, 100), label: 'Hinten' },
            { y: y(50,  0, 100), label: '50'     },
            { y: y(100, 0, 100), label: 'Vorne'  },
          ]
        };
      case 'Tampenposition':
        return {
          yLabel: 'Tampen',
          yTicks: [
            { y: y(1, 1, 5), label: '1' },
            { y: y(2, 1, 5), label: '2' },
            { y: y(3, 1, 5), label: '3' },
            { y: y(4, 1, 5), label: '4' },
            { y: y(5, 1, 5), label: '5' },
          ]
        };
      default: // Backwing Spacer
        return {
          yLabel: 'Backwing',
          yTicks: [
            { y: y(0,   0, 1), label: '0'   },
            { y: y(0.5, 0, 1), label: '0,5' },
            { y: y(1,   0, 1), label: '1'   },
          ]
        };
    }
  }

  /** Data points for the currently selected material category. */
  get matPoints(): MatPoint[] {
    const cat = this.MAT_CATS[this.matCatIndex];
    const pts: MatPoint[] = [];

    for (const s of this.dataSessions) {
      const wind = this.effectiveWind(s);
      if (wind === null) continue;

      let value: number | null | undefined;
      let dissKey: string;
      let yMin: number, yMax: number;

      switch (cat) {
        case 'Backwing Spacer':
          value   = s.backwingspacer;
          dissKey = 'Backwingspacer:';
          yMin = 0; yMax = 1;
          break;
        case 'Luisleage':
          value   = s.trimm?.luisleage;
          dissKey = 'Luisleage:';
          yMin = 0; yMax = 4;
          break;
        case 'Mastfuß':
          value   = s.trimm?.mastPosition;
          dissKey = 'Mastfuß:';
          yMin = 0; yMax = 100;
          break;
        case 'Tampenposition':
          value   = s.trimm?.tampenPosition;
          dissKey = 'Trapeztampen:';
          yMin = 1; yMax = 5;
          break;
        default: continue;
      }

      if (value == null) continue;

      const isRed = s.materialSetupSatisfied === false
        && (s.materialSetupReasons ?? []).some(r => r.startsWith(dissKey));

      pts.push({
        cx: this.matWindX(wind)              + this.hashJitter(s.id, 1, 4),
        cy: this.matValY(value, yMin, yMax)  + this.hashJitter(s.id, 2, 3.5),
        color: isRed ? '#ef5350' : '#66bb6a'
      });
    }
    return pts;
  }

  // X-ticks for material charts
  readonly MAT_X_TICKS = [0, 5, 10, 15, 20, 25, 30, 35, 40];

  // ── Stimmung view ─────────────────────────────────────────────

  private get stimmungSessions(): Session[] {
    return this.dataSessions;
  }

  // Info-toggles for the 4 mood quadrants
  moodInfoOpen: Record<string, boolean> = {};
  toggleMoodInfo(key: string, event: Event) {
    event.stopPropagation();
    this.moodInfoOpen[key] = !this.moodInfoOpen[key];
  }

  get moodMatrix(): {
    grind:   { count: number; pct: number };
    peak:    { count: number; pct: number };
    waste:   { count: number; pct: number };
    technik: { count: number; pct: number };
    total: number;
  } {
    const sessions = this.stimmungSessions.filter(
      s => s.energyLevel != null && s.sessionRating != null
    );
    const total = sessions.length;
    let grind = 0, peak = 0, waste = 0, technik = 0;

    for (const s of sessions) {
      const highE = s.energyLevel! > 5;
      const highS = s.sessionRating! > 5;
      if      (!highE &&  highS) grind++;
      else if ( highE &&  highS) peak++;
      else if (!highE && !highS) waste++;
      else                       technik++;
    }

    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
    return {
      grind:   { count: grind,   pct: pct(grind)   },
      peak:    { count: peak,    pct: pct(peak)     },
      waste:   { count: waste,   pct: pct(waste)    },
      technik: { count: technik, pct: pct(technik)  },
      total
    };
  }

  get durationChartData(): {
    cL: number; cT: number; cB: number; cR: number;
    points: DurationPoint[];
    yTicks: Array<{ y: number; emoji: string }>;
    xTicks: Array<{ v: number; x: number }>;
  } | null {
    const cL = 38, cT = 10, cB = 138, cR = 306;
    const ratingColor = (r: number) => {
      if (r <= 2) return '#e57373';
      if (r <= 4) return '#ffb74d';
      if (r <= 6) return '#fff176';
      if (r <= 8) return '#aed581';
      return '#81c784';
    };

    const valid = this.stimmungSessions.filter(
      s => s.sessionRating != null && !!s.endTime
    );
    if (valid.length === 0) return null;

    const durations = valid.map(s =>
      (new Date(s.endTime!).getTime() - new Date(s.startTime).getTime()) / 60000
    );
    const positiveDurs = durations.filter(d => d > 0);
    if (positiveDurs.length === 0) return null;

    const rawMax  = Math.max(...positiveDurs);
    const maxDur  = Math.min(rawMax, 480); // cap at 8 h; outliers render at the right edge
    const step    = maxDur <= 60 ? 15 : maxDur <= 120 ? 30 : maxDur <= 300 ? 60 : 90;
    const xMax    = Math.ceil(maxDur / step) * step;

    const ratingY = (r: number) => cB - ((r - 1) / 9) * (cB - cT);
    const durX    = (d: number) => cL + Math.min(d / xMax, 1) * (cR - cL);

    // Build points from all valid sessions with positive duration
    const points: DurationPoint[] = valid
      .filter((_, i) => durations[i] > 0)
      .map(s => {
        const dur = (new Date(s.endTime!).getTime() - new Date(s.startTime).getTime()) / 60000;
        return {
          cx: durX(dur),
          cy: ratingY(s.sessionRating!),
          color: ratingColor(s.sessionRating!)
        };
      });

    const xTicks: Array<{ v: number; x: number }> = [];
    for (let v = 0; v <= xMax; v += step) xTicks.push({ v, x: durX(v) });

    const yTicks = [1, 3, 5, 7, 10].map(r => ({ y: ratingY(r), emoji: String(r) }));

    return { cL, cT, cB, cR, points, yTicks, xTicks };
  }

  goHome() { this.router.navigate(['/home']); }
}

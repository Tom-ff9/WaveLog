import { Injectable } from '@angular/core';
import { Session, Learning, UserProfile, LearningEntry, CustomCourseDefinition } from '../models/session.model';

const STORAGE_KEY        = 'wavelog_sessions';
const SPOT_KEY           = 'wavelog_spot';
const FOIL_RAKE_KEY      = 'wavelog_foil_rake';
const PROFILE_KEY        = 'wavelog_profile';
const LEARNING_ENTRIES_KEY = 'wavelog_learning_entries';
const LEARNING_CATS_KEY    = 'wavelog_learning_custom_cats';
const THEME_KEY            = 'wavelog_theme';
const CUSTOM_COURSES_KEY   = 'wavelog_custom_courses';

const DEFAULT_PROFILE: UserProfile = {
  firstName: '', lastName: '', weight: null, racingClass: null,
  frontwing: '', gabel: '', segel: '', board: ''
};

@Injectable({ providedIn: 'root' })
export class StorageService {
  private themeMediaQuery = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  getSessions(): Session[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  saveSession(session: Session): void {
    const sessions = this.getSessions();
    const index = sessions.findIndex(s => s.id === session.id);
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }

  deleteSession(id: string): void {
    const sessions = this.getSessions().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }

  getActiveSession(): Session | null {
    return this.getSessions().find(s => s.isActive) ?? null;
  }

  getLearnings(): Learning[] {
    return this.getSessions().flatMap(s => s.learnings);
  }

  saveLearning(learning: Learning): void {
    const sessions = this.getSessions();
    const session = sessions.find(s => s.id === learning.sessionId);
    if (!session) return;
    const index = session.learnings.findIndex(l => l.id === learning.id);
    if (index >= 0) {
      session.learnings[index] = learning;
    } else {
      session.learnings.push(learning);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }

  getSpot(): string { return localStorage.getItem(SPOT_KEY) ?? ''; }
  saveSpot(spot: string): void { localStorage.setItem(SPOT_KEY, spot); }

  getCustomCourses(): CustomCourseDefinition[] {
    const raw = localStorage.getItem(CUSTOM_COURSES_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  saveCustomCourse(course: CustomCourseDefinition): void {
    const courses = this.getCustomCourses();
    const index = courses.findIndex(entry => entry.id === course.id);
    if (index >= 0) {
      courses[index] = course;
    } else {
      courses.unshift(course);
    }
    localStorage.setItem(CUSTOM_COURSES_KEY, JSON.stringify(courses));
  }

  deleteCustomCourse(id: string): void {
    const courses = this.getCustomCourses().filter(course => course.id !== id);
    localStorage.setItem(CUSTOM_COURSES_KEY, JSON.stringify(courses));
  }

  getFoilRake(): number | null {
    const raw = localStorage.getItem(FOIL_RAKE_KEY);
    return raw !== null ? parseFloat(raw) : null;
  }
  saveFoilRake(rake: number | null): void {
    rake !== null
      ? localStorage.setItem(FOIL_RAKE_KEY, String(rake))
      : localStorage.removeItem(FOIL_RAKE_KEY);
  }

  getProfile(): UserProfile {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : { ...DEFAULT_PROFILE };
  }

  saveProfile(profile: UserProfile): void {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  getLearningEntries(): LearningEntry[] {
    const raw = localStorage.getItem(LEARNING_ENTRIES_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  saveLearningEntry(entry: LearningEntry): void {
    const entries = this.getLearningEntries();
    entries.push(entry);
    localStorage.setItem(LEARNING_ENTRIES_KEY, JSON.stringify(entries));
  }

  updateLearningEntry(id: string, text: string): void {
    const entries = this.getLearningEntries().map(e => e.id === id ? { ...e, text } : e);
    localStorage.setItem(LEARNING_ENTRIES_KEY, JSON.stringify(entries));
  }

  deleteLearningEntry(id: string): void {
    const entries = this.getLearningEntries().filter(e => e.id !== id);
    localStorage.setItem(LEARNING_ENTRIES_KEY, JSON.stringify(entries));
  }

  getCustomLearningCategories(): string[] {
    const raw = localStorage.getItem(LEARNING_CATS_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  saveCustomLearningCategories(cats: string[]): void {
    localStorage.setItem(LEARNING_CATS_KEY, JSON.stringify(cats));
  }

  getThemeOverride(): 'dark' | 'light' | null {
    const theme = localStorage.getItem(THEME_KEY);
    return theme === 'light' || theme === 'dark' ? theme : null;
  }

  getSystemTheme(): 'dark' | 'light' {
    return this.themeMediaQuery?.matches ? 'dark' : 'light';
  }

  getTheme(): 'dark' | 'light' {
    return this.getThemeOverride() ?? this.getSystemTheme();
  }

  saveTheme(theme: 'dark' | 'light'): void {
    localStorage.setItem(THEME_KEY, theme);
    this.applyTheme(theme);
  }

  applyTheme(theme = this.getTheme()): void {
    document.body.classList.toggle('light-theme', theme === 'light');
  }

  watchSystemTheme(): (() => void) | void {
    if (!this.themeMediaQuery) return;

    const onChange = () => {
      if (!this.getThemeOverride()) {
        this.applyTheme(this.getSystemTheme());
      }
    };

    this.themeMediaQuery.addEventListener('change', onChange);
    return () => this.themeMediaQuery?.removeEventListener('change', onChange);
  }

  deleteLearning(id: string): void {
    const sessions = this.getSessions().map(s => ({
      ...s,
      learnings: s.learnings.filter(l => l.id !== id)
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }
}

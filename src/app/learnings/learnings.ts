import { Component, inject, Input, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../services/storage.service';
import { LearningEntry } from '../models/session.model';
import { NavComponent } from '../nav/nav';

interface UiCat {
  name:      string;
  subs:      string[];
  expanded:  boolean;
  isCustom:  boolean;
  newText:   string;
  subInputs: Record<string, string>;
}

const DEFAULT_CATEGORY_DEFS: { name: string; subs: string[] }[] = [
  { name: 'Manöver',        subs: ['Halsen', 'Wenden'] },
  { name: 'Rennen',         subs: ['Course Racing', 'Slalom'] },
  { name: 'Anpassschläge',  subs: [] },
  { name: 'Kurse',          subs: ['Am Wind', 'Halb Wind', 'Downwind'] },
  { name: 'Tonnenrundung',  subs: [] },
  { name: 'Start Training', subs: ['Am Wind', 'Halb Wind'] },
  { name: 'Pumpen',         subs: ['Am Wind', 'Halb Wind', 'Light Wind'] },
  { name: 'Regatta Taktik', subs: [] },
  { name: 'Taktik',         subs: [] },
  { name: 'Strategie',      subs: [] },
  { name: 'Winde',          subs: [] },
  { name: 'Spots',          subs: [] },  // subs filled dynamically from sessions
];

const DEFAULT_CATEGORY_NAMES = new Set(DEFAULT_CATEGORY_DEFS.map(d => d.name));

@Component({
  selector: 'app-learnings',
  standalone: true,
  imports: [RouterLink, NavComponent, FormsModule],
  templateUrl: './learnings.html'
})
export class LearningsComponent implements OnInit {
  private storage = inject(StorageService);

  @Input() embedded = false;

  uiCats:     UiCat[] = [];
  entries:    LearningEntry[] = [];
  newCatName  = '';

  // Confirm delete state
  pendingDeleteCat:   UiCat | null   = null;
  pendingDeleteEntry: string | null  = null;

  // Edit state
  editingEntry: LearningEntry | null = null;
  editText = '';

  ngOnInit() {
    this.entries = this.storage.getLearningEntries();

    const visitedSpots = this.buildSpotList();

    const customCats = this.storage.getCustomLearningCategories();
    const allDefs = [
      ...DEFAULT_CATEGORY_DEFS,
      ...customCats.map(name => ({ name, subs: [] as string[] }))
    ];

    this.uiCats = allDefs.map(def => {
      const subs = def.name === 'Spots' ? visitedSpots : def.subs;
      return {
        name:      def.name,
        subs,
        expanded:  false,
        isCustom:  !DEFAULT_CATEGORY_NAMES.has(def.name),
        newText:   '',
        subInputs: Object.fromEntries(subs.map(s => [s, '']))
      };
    });
  }

  /** Spots from: current setting + sessions + entries with learnings in Spots category */
  private buildSpotList(): string[] {
    return [...new Set([
      ...this.storage.getSessions().map(s => s.spot),
      ...this.entries
        .filter(e => e.category === 'Spots' && e.subCategory)
        .map(e => e.subCategory!)
    ].filter((s): s is string => !!s))];
  }

  private refreshSpotSubs() {
    const spotsCat = this.uiCats.find(c => c.name === 'Spots');
    if (!spotsCat) return;
    const newSubs = this.buildSpotList();
    // Add any newly seen spots
    for (const sub of newSubs) {
      if (!spotsCat.subs.includes(sub)) {
        spotsCat.subs.push(sub);
        spotsCat.subInputs[sub] = '';
      }
    }
    // Remove spots that no longer qualify (no sessions, no learnings, not current)
    spotsCat.subs = spotsCat.subs.filter(s => newSubs.includes(s));
  }

  toggleCat(cat: UiCat) {
    cat.expanded = !cat.expanded;
  }

  countFor(catName: string): number {
    return this.entries.filter(e => e.category === catName).length;
  }

  entriesFor(catName: string, subName?: string): LearningEntry[] {
    return this.entries.filter(e =>
      e.category === catName &&
      (subName ? e.subCategory === subName : !e.subCategory)
    );
  }

  addEntry(cat: UiCat, sub?: string) {
    const text = sub ? cat.subInputs[sub]?.trim() : cat.newText.trim();
    if (!text) return;
    const entry: LearningEntry = {
      id:          crypto.randomUUID(),
      category:    cat.name,
      subCategory: sub,
      text,
      timestamp:   new Date().toISOString()
    };
    this.storage.saveLearningEntry(entry);
    this.entries = this.storage.getLearningEntries();
    if (sub) cat.subInputs[sub] = '';
    else     cat.newText = '';
  }

  onKeydown(event: KeyboardEvent, cat: UiCat, sub?: string) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addEntry(cat, sub);
    }
  }

  // Entry delete with confirmation
  requestDeleteEntry(id: string) {
    this.pendingDeleteEntry = id;
  }

  // Category delete with confirmation
  requestDeleteCategory(cat: UiCat) {
    this.pendingDeleteCat = cat;
  }

  cancelDelete() {
    this.pendingDeleteCat   = null;
    this.pendingDeleteEntry = null;
  }

  confirmDelete() {
    if (this.pendingDeleteEntry) {
      this.storage.deleteLearningEntry(this.pendingDeleteEntry);
      this.entries = this.storage.getLearningEntries();
      this.refreshSpotSubs();
      this.pendingDeleteEntry = null;
    } else if (this.pendingDeleteCat) {
      const name = this.pendingDeleteCat.name;
      this.uiCats = this.uiCats.filter(c => c.name !== name);
      const custom = this.storage.getCustomLearningCategories().filter(n => n !== name);
      this.storage.saveCustomLearningCategories(custom);
      this.pendingDeleteCat = null;
    }
  }

  addCategory() {
    const name = this.newCatName.trim();
    if (!name || this.uiCats.some(c => c.name === name)) return;
    this.uiCats.push({ name, subs: [], expanded: false, isCustom: true, newText: '', subInputs: {} });
    const custom = this.storage.getCustomLearningCategories();
    this.storage.saveCustomLearningCategories([...custom, name]);
    this.newCatName = '';
  }

  addCatKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addCategory();
    }
  }

  requestEditEntry(entry: LearningEntry) {
    this.editingEntry = entry;
    this.editText = entry.text;
  }

  cancelEdit() {
    this.editingEntry = null;
    this.editText = '';
  }

  confirmEdit() {
    if (!this.editingEntry || !this.editText.trim()) return;
    this.storage.updateLearningEntry(this.editingEntry.id, this.editText.trim());
    this.entries = this.storage.getLearningEntries();
    this.cancelEdit();
  }
}

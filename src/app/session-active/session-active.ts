import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { StorageService } from '../services/storage.service';
import { Session } from '../models/session.model';
import { NavComponent } from '../nav/nav';
import { SpotHeaderComponent } from '../spot-header/spot-header';

@Component({
  selector: 'app-session-active',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe, NavComponent, SpotHeaderComponent],
  templateUrl: './session-active.html'
})
export class SessionActiveComponent implements OnInit, OnDestroy {
  private storage = inject(StorageService);
  private router = inject(Router);

  session: Session | null = null;
  now = new Date();
  windSpeed = '';
  energyLevel: number | null = null;
  activeOffset: number | null = null;
  editingTime = false;
  manualTime = '';
  foilRake: number | null = null;
  editingFoilRake = false;
  tempFoilRake = '';
  private interval: ReturnType<typeof setInterval> | null = null;

  /** Parses a single number or "X-Y" range → average. Returns null if invalid. */
  parseWindInput(v: string): number | null {
    const s = v.trim();
    if (!s) return null;
    const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
    if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  get canEnd(): boolean {
    const parsed = this.parseWindInput(this.windSpeed);
    return parsed !== null && parsed > 0 && this.energyLevel !== null;
  }

  ngOnInit() {
    this.router.navigate(['/session/end']);
  }

  ngOnDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  startEditingTime() {
    const h = this.now.getHours().toString().padStart(2, '0');
    const m = this.now.getMinutes().toString().padStart(2, '0');
    this.manualTime = `${h}:${m}`;
    this.editingTime = true;
  }

  confirmManualTime() {
    if (!this.session || !this.manualTime) { this.editingTime = false; return; }
    const [h, m] = this.manualTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    this.session = { ...this.session, startTime: d.toISOString() };
    this.storage.saveSession(this.session);
    this.activeOffset = null;
    this.editingTime = false;
  }

  setStartOffset(minutes: number) {
    if (!this.session) return;
    this.activeOffset = minutes;
    const newStart = new Date(Date.now() + minutes * 60 * 1000);
    this.session = { ...this.session, startTime: newStart.toISOString() };
    this.storage.saveSession(this.session);
  }

  startEditFoilRake() {
    this.tempFoilRake = this.foilRake != null ? String(this.foilRake) : '';
    this.editingFoilRake = true;
  }

  confirmFoilRake() {
    const val = parseFloat(this.tempFoilRake);
    this.foilRake = isNaN(val) ? null : val;
    this.storage.saveFoilRake(this.foilRake);
    this.editingFoilRake = false;
  }

  endSession() {
    if (!this.session) return;
    const updated = {
      ...this.session,
      windSpeed: this.windSpeed || undefined,
      energyLevel: this.energyLevel ?? undefined
    };
    this.storage.saveSession(updated);
    this.router.navigate(['/session/end']);
  }
}

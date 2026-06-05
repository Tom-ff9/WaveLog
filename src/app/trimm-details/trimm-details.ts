import { Component, inject, OnInit } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../services/storage.service';
import { Session } from '../models/session.model';
import { NavComponent } from '../nav/nav';
import { SpotHeaderComponent } from '../spot-header/spot-header';

// SVG viewBox: 0 0 220 300, rendered at SAIL_H px
// Sail triangle: apex (30, APEX_Y), mast-bottom (30, BOT_Y), boom-end (165, BOT_Y)
// Leech line: from apex to boom end (top-right diagonal)
// Thumb center for a 22px thumb on a SAIL_H slider: min→11px, max→(SAIL_H-11)px
// → APEX_Y/300*SAIL_H = 11  →  APEX_Y = 11*300/SAIL_H ≈ 13  (with SAIL_H=260)
// → BOT_Y /300*SAIL_H = 249  →  BOT_Y  = 249*300/SAIL_H ≈ 288
const SAIL_H   = 260;  // rendered SVG height in px
const APEX_Y   = 13;   // SVG y of sail apex  (aligns with slider min thumb centre)
const BOT_Y    = 288;  // SVG y of sail bottom (aligns with slider max thumb centre)
const MAST_X   = 30;
const BOOM_X   = 165;
const SPAN     = BOT_Y - APEX_Y;          // 275
const LEECH_DX = BOOM_X - MAST_X;        // 135

// 4 battens equally between apex and bottom (5 sections)
function battenY(n: number) { return Math.round(APEX_Y + n * SPAN / 5); }
function battenX(y: number) { return Math.round(MAST_X + LEECH_DX * (y - APEX_Y) / SPAN); }

export const BATTENS = [1, 2, 3, 4].map(n => {
  const y = battenY(n);
  return { y, x: battenX(y) };
});

@Component({
  selector: 'app-trimm-details',
  standalone: true,
  imports: [FormsModule, NavComponent, SpotHeaderComponent],
  templateUrl: './trimm-details.html'
})
export class TrimmDetailsComponent implements OnInit {
  private storage  = inject(StorageService);
  private route    = inject(ActivatedRoute);
  private router   = inject(Router);
  private location = inject(Location);
  private returnTo: 'detail' | 'home' = 'home';
  private source: 'analysis' | 'home' = 'home';

  goBack() { this.location.back(); }

  session: Session | null = null;
  showLuisInfo   = false;

  // luisleage: 0 = apex, 4 = at batten 4; decimals allowed
  luisleage      = 2.0;
  mastPosition   = 50;   // 0–100
  tampenPosition = 3.0;  // 1–5, decimals allowed
  wellenGefuehlt = 3;    // 1–5

  readonly battens = BATTENS;
  readonly sailH   = SAIL_H;

  ngOnInit() {
    const id = this.route.snapshot.queryParamMap.get('id');
    this.returnTo = this.route.snapshot.queryParamMap.get('returnTo') === 'detail' ? 'detail' : 'home';
    this.source = this.route.snapshot.queryParamMap.get('source') === 'analysis' ? 'analysis' : 'home';
    if (!id) { this.router.navigate(['/home']); return; }
    this.session = this.storage.getSessions().find(s => s.id === id) ?? null;
    if (!this.session) { this.router.navigate(['/home']); return; }
    if (this.session.trimm) {
      this.luisleage      = this.session.trimm.luisleage;
      this.mastPosition   = this.session.trimm.mastPosition;
      this.tampenPosition = this.session.trimm.tampenPosition;
      this.wellenGefuehlt = this.session.trimm.wellenGefuehlt;
    }
  }

  /** Indicator position interpolated continuously from slider value */
  get indicatorPos(): { x: number; y: number } {
    const t = this.luisleage / 4;   // 0..1
    const y = APEX_Y + t * SPAN;
    const x = MAST_X + t * LEECH_DX;
    return { x, y };
  }

  /** Red area: triangle apex → indicator → mast point above indicator */
  get luisleageArea(): string {
    const { x, y } = this.indicatorPos;
    const t = this.luisleage / 4;
    const mastY = Math.round(y - t * t * SPAN * 0.6);
    return `${MAST_X},${APEX_Y} ${x},${y} ${MAST_X},${mastY}`;
  }

  save() {
    if (!this.session) return;
    const updated: Session = {
      ...this.session,
      trimm: {
        luisleage:      this.luisleage,
        mastPosition:   this.mastPosition,
        tampenPosition: this.session.trimm?.tampenPosition ?? this.tampenPosition,
        wellenGefuehlt: this.wellenGefuehlt,
      }
    };
    this.storage.saveSession(updated);
    this.returnTo === 'detail'
      ? this.router.navigate(['/session', updated.id], { queryParams: { source: this.source } })
      : this.router.navigate(['/home']);
  }
}

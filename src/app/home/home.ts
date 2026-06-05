import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { StorageService } from '../services/storage.service';
import { Session } from '../models/session.model';
import { NavComponent } from '../nav/nav';
import { SpotHeaderComponent } from '../spot-header/spot-header';
import { ProfileComponent } from '../profile/profile';

interface HomeCalDay {
  day: number;
  isToday: boolean;
  hasSession: boolean;
  isOtherMonth: boolean;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, NavComponent, DatePipe, SpotHeaderComponent, ProfileComponent],
  templateUrl: './home.html'
})
export class HomeComponent implements OnInit {
  private storage = inject(StorageService);

  recentSessions: Session[] = [];
  profileOpen = false;

  readonly weekdays = ['Mo','Di','Mi','Do','Fr','Sa','So'];

  get currentMonthCount(): number {
    const now = new Date();
    return this.storage.getSessions()
      .filter(s => !s.isActive)
      .filter(s => {
        const d = new Date(s.startTime);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length;
  }

  get homeCal3Weeks(): HomeCalDay[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Monday of the current week
    const dow = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + mondayOffset);

    // Go back 2 full weeks to get the start of the 3-week window
    const start = new Date(weekStart);
    start.setDate(start.getDate() - 14);

    const todayMonth = today.getMonth();
    const todayYear  = today.getFullYear();

    const sessionKeys = new Set(
      this.storage.getSessions()
        .filter(s => !s.isActive)
        .map(s => {
          const d = new Date(s.startTime);
          return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        })
    );

    const days: HomeCalDay[] = [];
    for (let i = 0; i < 21; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      days.push({
        day:          d.getDate(),
        isToday:      d.getTime() === today.getTime(),
        hasSession:   sessionKeys.has(key),
        isOtherMonth: d.getMonth() !== todayMonth || d.getFullYear() !== todayYear,
      });
    }
    return days;
  }

  ngOnInit() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);

    this.recentSessions = this.storage.getSessions()
      .filter(s => !s.isActive && new Date(s.startTime) >= cutoff)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  private readonly emojis = ['😤', '😕', '😊', '😄', '😍'];

  getDuration(session: Session): string {
    if (!session.endTime) return '-';
    const ms = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
    const min = Math.floor(ms / 60000);
    return `${min} min`;
  }

  getEmoji(rating: number | undefined): string {
    if (!rating) return '';
    const index = Math.max(0, Math.min(4, Math.ceil(rating / 2) - 1));
    return this.emojis[index] ?? '';
  }
}

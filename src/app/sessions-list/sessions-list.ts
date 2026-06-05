import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { StorageService } from '../services/storage.service';
import { Session } from '../models/session.model';
import { NavComponent } from '../nav/nav';

@Component({
  selector: 'app-sessions-list',
  standalone: true,
  imports: [RouterLink, NavComponent, DatePipe],
  templateUrl: './sessions-list.html'
})
export class SessionsListComponent implements OnInit {
  private storage = inject(StorageService);
  sessions: Session[] = [];

  ngOnInit() {
    this.sessions = this.storage.getSessions()
      .filter(s => !s.isActive)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  getDuration(session: Session): string {
    if (!session.endTime) return '-';
    const ms = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
    const min = Math.floor(ms / 60000);
    return `${Math.floor(min / 60)}h ${min % 60}min`;
  }
}

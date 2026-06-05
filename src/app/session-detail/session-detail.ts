import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { StorageService } from '../services/storage.service';
import { Session } from '../models/session.model';
import { NavComponent } from '../nav/nav';

@Component({
  selector: 'app-session-detail',
  standalone: true,
  imports: [NavComponent, DatePipe],
  templateUrl: './session-detail.html'
})
export class SessionDetailComponent implements OnInit {
  private storage = inject(StorageService);
  private route   = inject(ActivatedRoute);
  private router  = inject(Router);

  session: Session | null = null;
  confirmDelete = false;
  confirmEdit = false;
  private source: 'analysis' | 'home' = 'home';

  private readonly emojis = ['😤', '😕', '😊', '😄', '😍'];

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    this.source = this.route.snapshot.queryParamMap.get('source') === 'analysis' ? 'analysis' : 'home';
    if (!id) { this.router.navigate(['/home']); return; }
    this.session = this.storage.getSessions().find(s => s.id === id) ?? null;
    if (!this.session) { this.router.navigate(['/home']); return; }
  }

  getDuration(): string {
    if (!this.session?.endTime) return '—';
    const ms = new Date(this.session.endTime).getTime() - new Date(this.session.startTime).getTime();
    const min = Math.floor(ms / 60000);
    return `${min} min`;
  }

  getMastLabel(value: number): string {
    if (value <= 10) return 'Ganz hinten';
    if (value <= 22) return 'Fast ganz hinten';
    if (value <= 37) return 'Zwischen Mitte und Hinten';
    if (value <= 48) return 'Mitte hinten';
    if (value <= 52) return 'Mitte';
    if (value <= 63) return 'Mitte vorne';
    if (value <= 77) return 'Zwischen Mitte und Vorne';
    if (value <= 89) return 'Fast ganz vorne';
    return 'Ganz vorne';
  }

  getEmoji(rating: number | undefined): string {
    if (!rating) return '—';
    return this.emojis[Math.round(rating) - 1] ?? '—';
  }

  deleteSession() {
    if (!this.session) return;
    this.storage.deleteSession(this.session.id);
    this.router.navigate(['/home']);
  }

  editSession() {
    if (!this.session) return;
    this.confirmEdit = false;
    this.router.navigate(['/session/end'], { queryParams: { id: this.session.id, returnTo: 'detail', source: this.source } });
  }

  goBack() {
    this.router.navigate([this.source === 'analysis' ? '/auswertung' : '/home']);
  }
}

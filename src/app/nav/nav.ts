import { Component, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { StorageService } from '../services/storage.service';
import { Session } from '../models/session.model';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './nav.html'
})
export class NavComponent {
  private storage = inject(StorageService);
  private router = inject(Router);
  readonly forceHomeActive = input(false);
  readonly forceAnalysisActive = input(false);

  isHomeActive(): boolean {
    if (this.forceHomeActive()) return true;
    return this.router.url.startsWith('/home');
  }

  isAnalysisActive(): boolean {
    if (this.forceAnalysisActive()) return true;
    return this.router.url.startsWith('/auswertung')
      || (this.router.url.startsWith('/session/end')
        && this.router.url.includes('source=analysis')
        && this.router.url.includes('replayId='));
  }

  startSession() {
    const existing = this.storage.getActiveSession();
    if (!existing) {
      const session: Session = {
        id: crypto.randomUUID(),
        startTime: new Date().toISOString(),
        isActive: true,
        spot: this.storage.getSpot() || undefined,
        foilRake: this.storage.getFoilRake(),
        trainingPhase: 'Aufbau',
        description: '',
        courseType: 'Längskurs',
        windCondition: 'Am Wind',
        learnings: []
      };
      this.storage.saveSession(session);
    }
    this.router.navigate(['/session/end']);
  }
}

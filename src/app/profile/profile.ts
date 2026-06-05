import { Component, Output, EventEmitter, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../services/storage.service';
import { RacingClass } from '../models/session.model';

const CLASS_PRESETS: Record<RacingClass, { frontwing: string; gabel: string; segel: string; board: string }> = {
  'Junior Men':   { frontwing: '800', gabel: 'Junior',  segel: '7.0', board: 'Youth/Junior' },
  'Junior Women': { frontwing: '800', gabel: 'Junior',  segel: '7.0', board: 'Youth/Junior' },
  'Youth Men':    { frontwing: '900', gabel: 'Youth',   segel: '8.0', board: 'Youth/Junior' },
  'Youth Women':  { frontwing: '900', gabel: 'Youth',   segel: '7.3', board: 'Youth/Junior' },
  'Senior Men':   { frontwing: '900', gabel: 'Carbon',  segel: '8.0', board: 'Senior'       },
  'Senior Women': { frontwing: '900', gabel: 'Carbon',  segel: '7.3', board: 'Senior'       },
};

const ALL_CLASSES: RacingClass[] = [
  'Junior Men', 'Junior Women',
  'Youth Men',  'Youth Women',
  'Senior Men', 'Senior Women',
];

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profile.html'
})
export class ProfileComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  private storage = inject(StorageService);

  firstName   = '';
  lastName    = '';
  weight:      number | null = null;
  racingClass: RacingClass | null = null;
  frontwing   = '';
  gabel       = '';
  segel       = '';
  board       = '';
  theme: 'dark' | 'light' = 'dark';

  showClassPicker = false;
  personalDataOpen = false;
  readonly allClasses = ALL_CLASSES;

  ngOnInit() {
    const p = this.storage.getProfile();
    this.firstName   = p.firstName;
    this.lastName    = p.lastName;
    this.weight      = p.weight;
    this.racingClass = p.racingClass;
    this.frontwing   = p.frontwing;
    this.gabel       = p.gabel;
    this.segel       = p.segel;
    this.board       = p.board;
    this.theme       = this.storage.getTheme();
  }

  selectClass(cls: RacingClass) {
    this.racingClass     = cls;
    this.showClassPicker = false;
    const preset         = CLASS_PRESETS[cls];
    this.frontwing       = preset.frontwing;
    this.gabel           = preset.gabel;
    this.segel           = preset.segel;
    this.board           = preset.board;
  }

  saveProfile() {
    this.storage.saveProfile({
      firstName:   this.firstName,
      lastName:    this.lastName,
      weight:      this.weight,
      racingClass: this.racingClass,
      frontwing:   this.frontwing,
      gabel:       this.gabel,
      segel:       this.segel,
      board:       this.board,
    });
    this.personalDataOpen = false;
    this.showClassPicker = false;
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this.storage.saveTheme(this.theme);
  }

  openPersonalData() {
    this.personalDataOpen = true;
  }

  closePersonalData() {
    this.personalDataOpen = false;
    this.showClassPicker = false;
  }

  backupPlaceholder() {
    window.alert('Backup kommt als Nächstes. Der Button ist aktuell nur ein Platzhalter.');
  }

  cancel() {
    this.closed.emit();
  }
}

import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { StorageService } from './services/storage.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  private storage = inject(StorageService);
  private stopThemeWatch?: () => void;

  ngOnInit(): void {
    this.storage.applyTheme();
    this.stopThemeWatch = this.storage.watchSystemTheme() ?? undefined;
  }

  ngOnDestroy(): void {
    this.stopThemeWatch?.();
  }
}

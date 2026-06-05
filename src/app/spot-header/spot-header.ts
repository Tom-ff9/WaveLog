import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../services/storage.service';

@Component({
  selector: 'app-spot-header',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './spot-header.html'
})
export class SpotHeaderComponent implements OnInit {
  private storage = inject(StorageService);

  spot = '';
  modalOpen = false;
  tempSpot = '';

  ngOnInit() {
    this.spot = this.storage.getSpot();
  }

  openModal() {
    this.tempSpot = this.spot;
    this.modalOpen = true;
  }

  closeModal() {
    this.modalOpen = false;
  }

  saveModal() {
    this.spot = this.tempSpot;
    this.storage.saveSpot(this.spot);
    this.modalOpen = false;
  }
}

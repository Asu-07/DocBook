import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { LoadingSpinner } from '../../components/loading-spinner/loading-spinner';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-profile',
  imports: [RouterLink, LoadingSpinner],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnInit {
  private api = inject(ApiService);
  user = signal<User | null>(null);

  ngOnInit(): void {
    this.api.getMe().subscribe((data) => {
      this.user.set(data);
    });
  }
}

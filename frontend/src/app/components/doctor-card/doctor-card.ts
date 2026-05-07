import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-doctor-card',
  imports: [RouterLink],
  templateUrl: './doctor-card.html',
  styleUrl: './doctor-card.scss',
})
export class DoctorCard {
  doctorId = input.required<number>();
  name = input.required<string>();
  specialization = input.required<string>();
  experience = input.required<number>();
  rating = input.required<number>();
  image = input.required<string>();
}

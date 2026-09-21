import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BookingService, Appointment } from '../../../core/services/booking.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-appointments',
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent],
  templateUrl: './appointments.component.html',
  styleUrls: ['./appointments.component.scss']
})
export class AppointmentsComponent implements OnInit {
  appointments: Appointment[] = [];
  filterTab: 'all' | 'upcoming' | 'history' = 'all';
  loading = true;

  constructor(
    private bookingService: BookingService, 
    private authService: AuthService, 
    private toastService: ToastService,
    private router: Router
  ) { }

  async ngOnInit(): Promise<void> {
    const authUser = await this.authService.getAuthenticatedUser();
    if (authUser) {
      this.loadAppointments(authUser.id);
    } else {
      this.authService.currentUser$.subscribe(user => {
        if (user) {
          this.loadAppointments(user.id);
        } else {
          this.loading = false;
        }
      });
    }
  }

  loadAppointments(userId: string) {
    this.loading = true;
    this.bookingService.getUserAppointments(userId).subscribe({
      next: (apps) => {
        this.appointments = apps || [];
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
      }
    });
  }

  get filteredAppointments(): Appointment[] {
    if (this.filterTab === 'upcoming') {
      return this.appointments.filter(a => a.estado === 'pendiente' || a.estado === 'confirmada');
    }
    if (this.filterTab === 'history') {
      return this.appointments.filter(a => a.estado === 'completada' || a.estado === 'cancelada');
    }
    return this.appointments;
  }

  goToBooking() {
    this.router.navigate(['/booking']);
  }

  reprogram(app: Appointment) {
    this.router.navigate(['/booking'], {
      queryParams: {
        serviceId: app.service_id,
        precio: app.precio
      }
    });
  }

  async cancelAppointment(id: string) {
    const confirmed = await this.toastService.confirm('Esta acción liberará tu turno asignado', '¿Cancelar cita?');
    if (confirmed) {
      this.bookingService.cancelAppointment(id).subscribe({
        next: () => {
          this.toastService.success('Cita cancelada correctamente');
          const user = this.authService.currentUser;
          if (user) {
            this.loadAppointments(user.id);
          }
        },
        error: (err) => {
          this.toastService.error('No se pudo cancelar la cita');
          console.error(err);
        }
      });
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
  }

  getServiceIcon(serviceName: string): string {
    const name = (serviceName || '').toLowerCase();
    if (name.includes('barba')) return 'face_retouching_natural';
    if (name.includes('combo') || name.includes('completo')) return 'style';
    if (name.includes('color')) return 'palette';
    if (name.includes('spa') || name.includes('facial')) return 'spa';
    return 'content_cut';
  }
}

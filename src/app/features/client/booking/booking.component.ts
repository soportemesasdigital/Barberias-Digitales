import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BookingService, Barber, Service, Appointment } from '../../../core/services/booking.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ToastService } from '../../../core/services/toast.service';

export interface CalendarDay {
  dateString: string; // YYYY-MM-DD
  dayNumber: number;
  dayNameShort: string;
  isCurrentMonth: boolean;
  isPast: boolean;
  isToday: boolean;
  isSelected: boolean;
  isAvailable: boolean;
}

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent],
  templateUrl: './booking.component.html',
  styleUrls: ['./booking.component.scss']
})
export class BookingComponent implements OnInit {
  // 4 Main Steps: 1: Service, 2: Barber, 3: Date & Time, 4: Confirmation
  step: 1 | 2 | 3 | 4 = 1;

  // Services
  services: Service[] = [];
  selectedService: Service | null = null;
  selectedServiceId: string | null = null;
  selectedServicePrecio: number = 0;
  loadingServices = false;

  // Barbers
  barbers: Barber[] = [];
  selectedBarber: Barber | null = null;
  loadingBarbers = false;

  // Custom Calendar
  currentCalendarDate = new Date();
  calendarDays: CalendarDay[] = [];
  quickDates: { label: string; dateString: string; dayName: string; dayNum: number }[] = [];
  selectedDate: string = '';

  // Time Slots
  morningSlots: string[] = [];
  afternoonSlots: string[] = [];
  selectedTime: string = '';
  loadingSlots = false;

  // Confirmation
  submitting = false;
  userInfo: any = null;

  // Phone Verification Modal
  showPhoneModal = false;
  phoneModalNumber = '';
  savingPhone = false;
  countryCodes = [
    { code: '+57', country: 'CO', flag: '🇨🇴', label: 'Colombia (+57)' },
    { code: '+1', country: 'US', flag: '🇺🇸', label: 'EE.UU. (+1)' },
    { code: '+52', country: 'MX', flag: '🇲🇽', label: 'México (+52)' },
    { code: '+34', country: 'ES', flag: '🇪🇸', label: 'España (+34)' },
    { code: '+54', country: 'AR', flag: '🇦🇷', label: 'Argentina (+54)' },
    { code: '+56', country: 'CL', flag: '🇨🇱', label: 'Chile (+56)' }
  ];
  selectedCountry = this.countryCodes[0];

  constructor(
    private bookingService: BookingService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private toastService: ToastService
  ) { }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.userInfo = user;
    });

    this.loadServicesAndBarbers();
    this.initQuickDates();
    this.generateCalendarDays();
  }

  loadServicesAndBarbers() {
    this.loadingServices = true;
    this.loadingBarbers = true;

    this.bookingService.getActiveServices().subscribe({
      next: (services) => {
        this.services = services;
        this.loadingServices = false;

        // Check query params
        this.route.queryParams.subscribe(params => {
          const serviceId = params['serviceId'];
          const precio = params['precio'];
          if (serviceId) {
            this.selectedServiceId = serviceId;
            this.selectedServicePrecio = precio ? Number(precio) : 0;
            const match = this.services.find(s => s.id === serviceId);
            if (match) {
              this.selectedService = match;
              this.selectedServicePrecio = match.precio;
            }
            // Move directly to barber selection if service was provided
            this.step = 2;
          }
        });
      },
      error: () => {
        this.loadingServices = false;
      }
    });

    this.bookingService.getActiveBarbers().subscribe({
      next: (barbers) => {
        this.barbers = barbers;
        this.loadingBarbers = false;
      },
      error: () => {
        this.loadingBarbers = false;
      }
    });
  }

  // --- Step 1: Select Service ---
  selectService(service: Service) {
    this.selectedService = service;
    this.selectedServiceId = service.id;
    this.selectedServicePrecio = service.precio;
    this.step = 2;
  }

  getServiceIcon(serviceName: string): string {
    const name = (serviceName || '').toLowerCase();
    if (name.includes('barba')) return 'face_retouching_natural';
    if (name.includes('combo') || name.includes('completo')) return 'style';
    if (name.includes('color') || name.includes('tinte')) return 'palette';
    if (name.includes('spa') || name.includes('facial') || name.includes('masaje')) return 'spa';
    if (name.includes('cejas') || name.includes('diseño')) return 'auto_fix_high';
    return 'content_cut';
  }

  // --- Step 2: Select Barber ---
  selectBarber(barber: Barber) {
    this.selectedBarber = barber;
    this.step = 3;
    // If a date was already selected, reload slots
    if (this.selectedDate) {
      this.loadSlots();
    } else {
      // Default to today or tomorrow
      const todayString = this.formatDateIso(new Date());
      this.onSelectDate(todayString);
    }
  }

  // --- Step 3: Calendar & Slots ---
  initQuickDates() {
    this.quickDates = [];
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      let label = dayNames[d.getDay()];
      if (i === 0) label = 'Hoy';
      if (i === 1) label = 'Mañ.';
      this.quickDates.push({
        label,
        dateString: this.formatDateIso(d),
        dayName: dayNames[d.getDay()],
        dayNum: d.getDate()
      });
    }
  }

  generateCalendarDays() {
    const year = this.currentCalendarDate.getFullYear();
    const month = this.currentCalendarDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Days in week: 0 = Sun, 1 = Mon ... adjust for Monday start
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Prev month pad
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      d.setHours(0, 0, 0, 0);
      days.push({
        dateString: this.formatDateIso(d),
        dayNumber: d.getDate(),
        dayNameShort: '',
        isCurrentMonth: false,
        isPast: true,
        isToday: false,
        isSelected: false,
        isAvailable: false
      });
    }

    // Current month days
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      const d = new Date(year, month, i);
      d.setHours(0, 0, 0, 0);
      const isPast = d.getTime() < today.getTime();
      const isToday = d.getTime() === today.getTime();
      const dateString = this.formatDateIso(d);

      days.push({
        dateString,
        dayNumber: i,
        dayNameShort: '',
        isCurrentMonth: true,
        isPast,
        isToday,
        isSelected: this.selectedDate === dateString,
        isAvailable: !isPast
      });
    }

    this.calendarDays = days;
  }

  get calendarMonthYearLabel(): string {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return `${months[this.currentCalendarDate.getMonth()]} ${this.currentCalendarDate.getFullYear()}`;
  }

  prevMonth() {
    const today = new Date();
    const prev = new Date(this.currentCalendarDate.getFullYear(), this.currentCalendarDate.getMonth() - 1, 1);
    if (prev.getFullYear() < today.getFullYear() || (prev.getFullYear() === today.getFullYear() && prev.getMonth() < today.getMonth())) {
      return; // Do not go to past months
    }
    this.currentCalendarDate = prev;
    this.generateCalendarDays();
  }

  nextMonth() {
    this.currentCalendarDate = new Date(this.currentCalendarDate.getFullYear(), this.currentCalendarDate.getMonth() + 1, 1);
    this.generateCalendarDays();
  }

  onSelectDate(dateString: string) {
    this.selectedDate = dateString;
    this.selectedTime = '';
    this.calendarDays.forEach(d => {
      d.isSelected = d.dateString === dateString;
    });
    this.loadSlots();
  }

  loadSlots() {
    if (!this.selectedBarber || !this.selectedDate) return;
    this.loadingSlots = true;
    this.morningSlots = [];
    this.afternoonSlots = [];

    const selectedDateObj = new Date(this.selectedDate + 'T00:00:00');
    const diaSemana = selectedDateObj.getDay() === 0 ? 7 : selectedDateObj.getDay();

    Promise.all([
      this.bookingService.getBarberSchedule(this.selectedBarber.id, diaSemana).toPromise(),
      this.bookingService.getBlockedTimes(this.selectedBarber.id, this.selectedDate).toPromise(),
      this.bookingService.getAppointmentsForBarber(this.selectedBarber.id, this.selectedDate).toPromise(),
      this.bookingService.getBarberiaConfig().toPromise()
    ]).then(([schedule, blockedTimes, appointments, config]) => {
      let startTime = '09:00';
      let endTime = '19:30';

      if (schedule) {
        startTime = schedule.hora_inicio.substring(0, 5);
        endTime = schedule.hora_fin.substring(0, 5);
      } else if (config) {
        startTime = config.horario_apertura.substring(0, 5);
        endTime = config.horario_cierre.substring(0, 5);
      }

      const allSlots = this.generateTimeSlots(startTime, endTime, 30);
      const bookedTimes = (appointments || []).map(a => a.hora.substring(0, 5));
      const blockedSlots = (blockedTimes || []).map(bt => bt.hora?.substring(0, 5)).filter(Boolean);
      const unavailable = [...bookedTimes, ...blockedSlots];

      const available = allSlots.filter(s => !unavailable.includes(s));

      // Separate into Morning (< 12:30) and Afternoon (>= 12:30)
      this.morningSlots = available.filter(time => {
        const hour = parseInt(time.split(':')[0], 10);
        return hour < 13;
      });

      this.afternoonSlots = available.filter(time => {
        const hour = parseInt(time.split(':')[0], 10);
        return hour >= 13;
      });

      this.loadingSlots = false;
    }).catch(err => {
      console.error('Error loading slots:', err);
      this.loadingSlots = false;
    });
  }

  selectTime(time: string) {
    this.selectedTime = time;
  }

  goToConfirmation() {
    if (!this.selectedService) {
      this.toastService.warning('Por favor selecciona un servicio');
      this.step = 1;
      return;
    }
    if (!this.selectedBarber) {
      this.toastService.warning('Por favor selecciona un barbero');
      this.step = 2;
      return;
    }
    if (!this.selectedDate || !this.selectedTime) {
      this.toastService.warning('Por favor selecciona fecha y hora');
      return;
    }

    this.step = 4;
  }

  // --- Step 4: Confirm Booking ---
  async confirmBooking() {
    this.submitting = true;

    // 1. Obtener la sesión activa de forma asíncrona de Supabase Auth
    const user = await this.authService.getAuthenticatedUser();

    if (!user) {
      this.submitting = false;
      this.toastService.warning('Debes iniciar sesión para agendar tu cita.');
      this.router.navigate(['/login']);
      return;
    }

    // Actualizar userInfo localmente con el usuario autenticado real
    this.userInfo = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.['full_name'] || user.user_metadata?.['nombre'] || 'Cliente'
    };

    if (!this.selectedServiceId || !this.selectedBarber || !this.selectedDate || !this.selectedTime) {
      this.submitting = false;
      this.toastService.error('Faltan datos de la reserva');
      return;
    }

    // 2. Consultar fila en public.profiles para telefono y asegurar su existencia
    try {
      let { data: profile } = await this.authService.getProfile(user.id);
      
      // Si el perfil no existe aún, crearlo/asegurarlo
      if (!profile) {
        await this.authService.updateProfile(user.id, {
          nombre: user.user_metadata?.['full_name'] || user.user_metadata?.['nombre'] || user.email?.split('@')[0] || 'Cliente'
        });
        const refetch = await this.authService.getProfile(user.id);
        profile = refetch.data;
      }

      const telefono = profile?.telefono?.trim();
      if (!telefono) {
        this.submitting = false;
        this.phoneModalNumber = '';
        this.showPhoneModal = true;
        return;
      }

      // Si ya tiene teléfono registrado, agendar la cita con user.id garantizado
      this.executeBooking(user.id);
    } catch (err) {
      console.error('Error checking profile telefono:', err);
      this.executeBooking(user.id);
    }
  }

  async savePhoneAndConfirm() {
    const rawDigits = this.phoneModalNumber.replace(/\D/g, '');
    if (!rawDigits || rawDigits.length < 7) {
      this.toastService.warning('Por favor ingresa un número de teléfono válido');
      return;
    }

    const fullPhone = `${this.selectedCountry.code}${rawDigits}`;
    this.savingPhone = true;

    // Obtener usuario autenticado de forma asíncrona
    const user = await this.authService.getAuthenticatedUser();
    if (!user) {
      this.savingPhone = false;
      this.showPhoneModal = false;
      this.toastService.warning('Debes iniciar sesión para agendar tu cita.');
      this.router.navigate(['/login']);
      return;
    }

    try {
      const { error } = await this.authService.updateProfile(user.id, { telefono: fullPhone });
      if (error) {
        this.toastService.error('No se pudo guardar el teléfono. Intenta nuevamente.');
        console.error(error);
        this.savingPhone = false;
        return;
      }

      this.toastService.success('Número guardado correctamente');
      this.showPhoneModal = false;
      this.savingPhone = false;

      // Complete reservation immediately con el ID autenticado
      this.submitting = true;
      this.executeBooking(user.id);
    } catch (err) {
      this.toastService.error('Error al actualizar el perfil');
      console.error(err);
      this.savingPhone = false;
    }
  }

  closePhoneModal() {
    if (this.savingPhone) return;
    this.showPhoneModal = false;
  }

  private executeBooking(userId: string) {
    const appointment: Appointment = {
      cliente_id: userId,
      service_id: this.selectedServiceId!,
      barber_id: this.selectedBarber!.id,
      fecha: this.selectedDate,
      hora: this.selectedTime,
      precio: this.selectedServicePrecio,
      estado: 'pendiente'
    };

    this.bookingService.createAppointment(appointment).subscribe({
      next: () => {
        this.submitting = false;
        this.toastService.success('¡Tu cita ha sido agendada con éxito!', 'Reserva Confirmada');
        setTimeout(() => this.router.navigate(['/appointments']), 800);
      },
      error: (err) => {
        this.submitting = false;
        this.toastService.error('No se pudo confirmar tu cita. Intenta de nuevo.');
        console.error('Error creating appointment in Supabase:', err);
      }
    });
  }

  // Helpers
  get formattedSelectedDate(): string {
    if (!this.selectedDate) return '';
    const [y, m, d] = this.selectedDate.split('-');
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return `${dayNames[dateObj.getDay()]}, ${d} de ${monthNames[dateObj.getMonth()]} de ${y}`;
  }

  private formatDateIso(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private generateTimeSlots(start: string, end: string, interval: number): string[] {
    const slots = [];
    let current = new Date(`2000-01-01T${start}`);
    const endTime = new Date(`2000-01-01T${end}`);

    while (current < endTime) {
      const timeString = current.toTimeString().substring(0, 5);
      slots.push(timeString);
      current.setMinutes(current.getMinutes() + interval);
    }
    return slots;
  }
}

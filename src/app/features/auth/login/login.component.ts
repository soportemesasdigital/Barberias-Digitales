import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ToastService } from '../../../core/services/toast.service';

interface CountryCode {
  code: string;
  country: string;
  flag: string;
  label: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, OnDestroy {
  mode: 'client' | 'admin' = 'client';

  // Client OTP Flow
  clientStep: 'phone' | 'otp' | 'name' = 'phone';
  clientPhone: string = '';
  clientName: string = '';

  countryCodes: CountryCode[] = [
    { code: '+57', country: 'CO', flag: '🇨🇴', label: 'Colombia (+57)' },
    { code: '+1', country: 'US', flag: '🇺🇸', label: 'EE.UU. (+1)' },
    { code: '+52', country: 'MX', flag: '🇲🇽', label: 'México (+52)' },
    { code: '+34', country: 'ES', flag: '🇪🇸', label: 'España (+34)' },
    { code: '+54', country: 'AR', flag: '🇦🇷', label: 'Argentina (+54)' },
    { code: '+56', country: 'CL', flag: '🇨🇱', label: 'Chile (+56)' }
  ];
  selectedCountry: CountryCode = this.countryCodes[0];

  // 6 Digits OTP
  otpDigits: string[] = ['', '', '', '', '', ''];
  resendCountdown = 45;
  canResend = false;
  private countdownTimer: any = null;

  // Admin Data
  adminEmail: string = '';
  adminPass: string = '';
  showPassword = false;

  loading = false;
  error: string | null = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService
  ) { }

  ngOnInit(): void {
    // Check if user is already logged in
    const user = this.authService.currentUser;
    if (user) {
      if (user.role === 'admin') {
        this.router.navigate(['/admin/dashboard']);
      } else {
        this.router.navigate(['/home']);
      }
    }
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  toggleMode(newMode: 'client' | 'admin') {
    this.mode = newMode;
    this.error = null;
    this.clientStep = 'phone';
    this.clearTimer();
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  get fullPhoneNumber(): string {
    const rawDigits = this.clientPhone.replace(/\D/g, '');
    return `${this.selectedCountry.code}${rawDigits}`;
  }

  // --- Step 1: Request OTP ---
  onRequestOtp() {
    const cleanNumber = this.clientPhone.replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 7) {
      this.toastService.warning('Ingresa un número de celular válido');
      return;
    }

    this.loading = true;
    this.error = null;

    // Simulate OTP dispatch (or ready Supabase client verification)
    setTimeout(() => {
      this.loading = false;
      this.clientStep = 'otp';
      this.otpDigits = ['', '', '', '', '', ''];
      this.startCountdown();
      this.toastService.success(`Código de verificación enviado a ${this.selectedCountry.code} ${this.clientPhone}`);

      // Focus first digit box after render
      setTimeout(() => {
        const firstInput = document.getElementById('otp-0');
        if (firstInput) (firstInput as HTMLInputElement).focus();
      }, 100);
    }, 700);
  }

  // --- Step 2: OTP Input Handling ---
  onDigitInput(index: number, event: any) {
    const value = event.target.value;
    if (value.length > 1) {
      this.otpDigits[index] = value.slice(-1);
    }

    // Auto advance to next box
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      if (nextInput) {
        (nextInput as HTMLInputElement).focus();
      }
    }

    // If all digits filled, auto-verify
    if (this.otpDigits.every(d => d.trim() !== '')) {
      this.verifyOtp();
    }
  }

  onDigitKeyDown(index: number, event: KeyboardEvent) {
    if (event.key === 'Backspace' && !this.otpDigits[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      if (prevInput) {
        (prevInput as HTMLInputElement).focus();
      }
    }
  }

  onOtpPaste(event: ClipboardEvent) {
    event.preventDefault();
    const pastedData = event.clipboardData?.getData('text') || '';
    const digits = pastedData.replace(/\D/g, '').split('').slice(0, 6);
    digits.forEach((digit, i) => {
      if (i < 6) this.otpDigits[i] = digit;
    });

    const focusIndex = Math.min(digits.length, 5);
    const targetInput = document.getElementById(`otp-${focusIndex}`);
    if (targetInput) (targetInput as HTMLInputElement).focus();

    if (this.otpDigits.every(d => d.trim() !== '')) {
      this.verifyOtp();
    }
  }

  // --- Step 3: Verify OTP & Login ---
  async verifyOtp() {
    const code = this.otpDigits.join('');
    if (code.length < 4) {
      this.toastService.warning('Ingresa el código completo');
      return;
    }

    this.loading = true;
    this.error = null;

    const phoneToAuthenticate = this.clientPhone.replace(/\D/g, '');

    // Connect to existing AuthService client login logic
    const { error } = await this.authService.loginAsClient(phoneToAuthenticate, this.clientName);
    this.loading = false;

    if (error === 'USER_NOT_FOUND_NEED_NAME') {
      // New user detected! Transition to name step
      this.clientStep = 'name';
      this.toastService.info('¡Bienvenido! Déjanos saber tu nombre para tus reservas.');
    } else if (error) {
      this.toastService.error(error || 'Error al validar el código');
    } else {
      this.toastService.success('¡Acceso concedido!');
      setTimeout(() => this.router.navigate(['/home']), 500);
    }
  }

  // --- Step 4: Register Name (New Clients) ---
  async onNameSubmit() {
    if (!this.clientName || this.clientName.trim().length < 2) {
      this.toastService.warning('Por favor ingresa tu nombre completo');
      return;
    }

    this.loading = true;
    const phoneToAuthenticate = this.clientPhone.replace(/\D/g, '');
    const { error } = await this.authService.loginAsClient(phoneToAuthenticate, this.clientName.trim());
    this.loading = false;

    if (error) {
      this.toastService.error(error || 'No se pudo completar el registro');
    } else {
      this.toastService.success(`¡Todo listo, ${this.clientName.trim()}!`);
      setTimeout(() => this.router.navigate(['/home']), 500);
    }
  }

  editPhoneNumber() {
    this.clientStep = 'phone';
    this.clearTimer();
  }

  resendCode() {
    if (!this.canResend) return;
    this.startCountdown();
    this.toastService.info('Hemos reenviado un nuevo código a tu celular');
  }

  private startCountdown() {
    this.clearTimer();
    this.resendCountdown = 45;
    this.canResend = false;
    this.countdownTimer = setInterval(() => {
      this.resendCountdown--;
      if (this.resendCountdown <= 0) {
        this.canResend = true;
        this.clearTimer();
      }
    }, 1000);
  }

  private clearTimer() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  // --- Admin Login ---
  async onAdminSubmit() {
    if (!this.adminEmail || !this.adminPass) {
      this.toastService.warning('Ingresa correo y contraseña');
      return;
    }

    this.loading = true;
    this.error = null;

    const { error } = await this.authService.loginAsAdmin(this.adminEmail, this.adminPass);
    this.loading = false;

    if (error) {
      this.toastService.error(error);
    } else {
      this.toastService.success('Bienvenido, Administrador');
      setTimeout(() => this.router.navigate(['/admin/dashboard']), 500);
    }
  }
}

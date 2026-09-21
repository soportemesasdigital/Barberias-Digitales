import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  // Form Fields
  email: string = '';
  password: string = '';
  showPassword = false;

  loading = false;
  error: string | null = null;

  // Unregistered User Modal
  showRegisterPromptModal = false;
  registerName: string = '';
  registering = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService
  ) { }

  async ngOnInit(): Promise<void> {
    // 1. Check if active Supabase session exists (e.g. from Google OAuth redirect)
    try {
      const { data: { session } } = await this.authService.getSupabaseSession();
      if (session?.user) {
        const user = await this.authService.syncSessionUser(session.user);
        if (user.role === 'admin') {
          this.router.navigate(['/admin/dashboard']);
        } else {
          this.router.navigate(['/booking']);
        }
        return;
      }
    } catch (e) {
      console.error('Error checking active Supabase session:', e);
    }

    // 2. Check local user state
    const user = this.authService.currentUser;
    if (user) {
      if (user.role === 'admin') {
        this.router.navigate(['/admin/dashboard']);
      } else {
        this.router.navigate(['/booking']);
      }
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  async loginWithGoogle() {
    this.loading = true;
    this.error = null;
    const { error } = await this.authService.loginWithGoogle();
    if (error) {
      this.loading = false;
      this.toastService.error('Error con Google OAuth: ' + error);
      console.error('Google OAuth Error:', error);
    }
  }

  async onSubmit() {
    const cleanEmail = this.email.trim();
    const cleanPassword = this.password.trim();

    if (!cleanEmail || !this.isValidEmail(cleanEmail)) {
      this.toastService.warning('Por favor ingresa un correo electrónico válido');
      return;
    }
    if (!cleanPassword) {
      this.toastService.warning('Por favor ingresa tu contraseña');
      return;
    }

    this.loading = true;
    this.error = null;

    const { error, user } = await this.authService.loginWithEmail(cleanEmail, cleanPassword);

    if (error) {
      // Check if user exists in database
      const exists = await this.authService.checkEmailExists(cleanEmail);
      this.loading = false;

      if (!exists) {
        // User not registered: Open prompt modal to register!
        this.registerName = '';
        this.showRegisterPromptModal = true;
      } else {
        // User exists, password was wrong
        this.error = 'Contraseña incorrecta. Por favor verifica tus datos.';
        this.toastService.error(this.error);
      }
      return;
    }

    this.loading = false;
    this.toastService.success('¡Acceso concedido!');
    setTimeout(() => {
      if (user?.role === 'admin') {
        this.router.navigate(['/admin/dashboard']);
      } else {
        this.router.navigate(['/booking']);
      }
    }, 400);
  }

  async onConfirmRegister() {
    const cleanName = this.registerName.trim();
    const cleanEmail = this.email.trim();
    const cleanPassword = this.password.trim();

    if (!cleanName || cleanName.length < 2) {
      this.toastService.warning('Por favor ingresa tu nombre completo');
      return;
    }
    if (cleanPassword.length < 6) {
      this.toastService.warning('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    this.registering = true;
    const { error, user } = await this.authService.signUpWithEmail(cleanName, cleanEmail, cleanPassword);
    this.registering = false;

    if (error) {
      this.toastService.error(error);
      return;
    }

    this.showRegisterPromptModal = false;
    this.toastService.success(`¡Cuenta creada exitosamente! Bienvenido, ${cleanName}.`);
    setTimeout(() => {
      if (user?.role === 'admin') {
        this.router.navigate(['/admin/dashboard']);
      } else {
        this.router.navigate(['/booking']);
      }
    }, 400);
  }

  closeRegisterModal() {
    if (this.registering) return;
    this.showRegisterPromptModal = false;
  }

  private isValidEmail(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }
}

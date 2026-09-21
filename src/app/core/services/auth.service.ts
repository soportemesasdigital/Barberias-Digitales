import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Session, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Router } from '@angular/router';

export type UserRole = 'admin' | 'client' | null;

export interface AppUser {
    id: string; // Supabase Auth ID for admin, or Client UUID for client
    name: string;
    role: UserRole;
    phone?: string;
    email?: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private _currentUser = new BehaviorSubject<AppUser | null>(null);

    constructor(private supabaseService: SupabaseService, private router: Router) {
        this.recoverSession();
        this.initAuthListener();
    }

    private initAuthListener() {
        this.supabaseService.client.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                const user = await this.syncSessionUser(session.user);
                if (window.location.pathname === '/login' || window.location.pathname === '/') {
                    if (user.role === 'admin') {
                        this.router.navigate(['/admin/dashboard']);
                    } else {
                        this.router.navigate(['/booking']);
                    }
                }
            } else if (event === 'SIGNED_OUT') {
                localStorage.removeItem('barber_app_user');
                this._currentUser.next(null);
            }
        });
    }

    get currentUser$(): Observable<AppUser | null> {
        return this._currentUser.asObservable();
    }

    get currentUser(): AppUser | null {
        return this._currentUser.value;
    }

    async getSupabaseSession(): Promise<{ data: { session: Session | null }; error: any }> {
        return this.supabaseService.client.auth.getSession();
    }

    async getAuthenticatedUser(): Promise<User | null> {
        try {
            const { data: { user }, error } = await this.supabaseService.client.auth.getUser();
            if (user) return user;
            if (error) {
                const { data: { session } } = await this.supabaseService.client.auth.getSession();
                return session?.user || null;
            }
        } catch {
            const { data: { session } } = await this.supabaseService.client.auth.getSession();
            return session?.user || null;
        }
        return null;
    }

    async syncSessionUser(user: User): Promise<AppUser> {
        let profile = null;
        try {
            const { data } = await this.supabaseService.client
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();
            profile = data;
        } catch (e) {
            console.error('Error fetching user profile:', e);
        }

        const fullName = profile?.nombre || 
            user.user_metadata?.['full_name'] || 
            user.user_metadata?.['name'] || 
            user.email?.split('@')[0] || 
            'Cliente';

        const role: UserRole = (profile?.rol === 'admin') ? 'admin' : 'client';

        const appUser: AppUser = {
            id: user.id,
            name: fullName,
            role: role,
            email: user.email,
            phone: profile?.telefono || user.phone || undefined
        };

        this.saveLocalUser(appUser);
        return appUser;
    }

    // --- Google OAuth ---
    async loginWithGoogle(): Promise<{ error?: string }> {
        try {
            const { data, error } = await this.supabaseService.client.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/booking`
                }
            });

            if (error) {
                console.error('Supabase Google OAuth error:', error);
                return { error: error.message };
            }

            if (data?.url) {
                window.location.href = data.url;
            }

            return {};
        } catch (err: any) {
            console.error('Google OAuth unexpected error:', err);
            return { error: err?.message || 'Error al conectar con Google' };
        }
    }

    async checkEmailExists(email: string): Promise<boolean> {
        try {
            const { data } = await this.supabaseService.client
                .from('profiles')
                .select('id')
                .eq('email', email.trim().toLowerCase())
                .maybeSingle();
            return !!data;
        } catch {
            return false;
        }
    }

    // --- Email & Password Auth ---
    async loginWithEmail(email: string, pass: string): Promise<{ error?: string; user?: AppUser }> {
        const { data, error } = await this.supabaseService.client.auth.signInWithPassword({
            email,
            password: pass
        });

        if (error) {
            let errorMsg = error.message;
            if (errorMsg.toLowerCase().includes('invalid login credentials')) {
                errorMsg = 'Correo o contraseña incorrectos. Si no tienes cuenta, regístrate primero.';
            }
            return { error: errorMsg };
        }

        if (data.user) {
            const appUser = await this.syncSessionUser(data.user);
            return { user: appUser };
        }
        return {};
    }

    async signUpWithEmail(nombre: string, email: string, pass: string): Promise<{ error?: string; user?: AppUser }> {
        const { data, error } = await this.supabaseService.client.auth.signUp({
            email,
            password: pass,
            options: {
                data: {
                    full_name: nombre,
                    nombre: nombre
                }
            }
        });

        if (error) {
            let errorMsg = error.message;
            if (errorMsg.toLowerCase().includes('already registered')) {
                errorMsg = 'Este correo ya está registrado. Por favor inicia sesión.';
            }
            return { error: errorMsg };
        }

        if (data.user) {
            // Update profile with name in case trigger didn't pick up metadata
            try {
                await this.updateProfile(data.user.id, { nombre });
            } catch (e) {
                console.error('Profile update error on signup:', e);
            }

            const appUser = await this.syncSessionUser(data.user);
            return { user: appUser };
        }
        return {};
    }

    // Keep legacy loginAsAdmin for backward-compatibility if needed
    async loginAsAdmin(email: string, pass: string): Promise<{ error?: string }> {
        return this.loginWithEmail(email, pass);
    }

    logout() {
        this.supabaseService.client.auth.signOut(); // Just in case
        localStorage.removeItem('barber_app_user');
        this._currentUser.next(null);
        this.router.navigate(['/login']);
    }

    // --- Profile Management ---
    async getProfile(userId: string): Promise<{ data?: any; error?: string }> {
        const { data, error } = await this.supabaseService.client
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        if (error) return { error: error.message };
        return { data };
    }

    async updateProfile(userId: string, updates: { telefono?: string; nombre?: string }): Promise<{ error?: string }> {
        const { error } = await this.supabaseService.client
            .from('profiles')
            .update(updates)
            .eq('id', userId);

        if (error) return { error: error.message };

        // Also update local user state if phone or name is updated
        if (this._currentUser.value && this._currentUser.value.id === userId) {
            const updatedUser: AppUser = {
                ...this._currentUser.value,
                phone: updates.telefono !== undefined ? updates.telefono : this._currentUser.value.phone,
                name: updates.nombre !== undefined ? updates.nombre : this._currentUser.value.name
            };
            this.saveLocalUser(updatedUser);
        }
        return {};
    }

    // --- Internal Session Handling ---
    private saveLocalUser(user: AppUser) {
        localStorage.setItem('barber_app_user', JSON.stringify(user));
        this._currentUser.next(user);
    }

    private recoverSession() {
        const stored = localStorage.getItem('barber_app_user');
        if (stored) {
            try {
                const user = JSON.parse(stored);
                this._currentUser.next(user);
            } catch {
                localStorage.removeItem('barber_app_user');
            }
        }
    }
}

/**
 * Credential Validation Infrastructure
 *
 * Provides validation for various credential types (email, PayPal, OAuth tokens).
 * Ensures credentials meet format requirements before attempting connections.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EmailCredentials {
  host: string;
  port: number;
  user: string;
  password?: string;
  tls: boolean;
}

export interface PayPalCredentials {
  clientId: string;
  clientSecret?: string;
  mode: 'sandbox' | 'live';
  email: string;
}

export class CredentialValidator {
  /**
   * Validate email credentials
   */
  static validateEmail(credentials: EmailCredentials): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate host
    if (!credentials.host || credentials.host.trim().length === 0) {
      errors.push('Host is required');
    } else if (!this.isValidHostname(credentials.host)) {
      errors.push('Invalid hostname format');
    }

    // Validate port
    if (!credentials.port || credentials.port < 1 || credentials.port > 65535) {
      errors.push('Port must be between 1 and 65535');
    }

    // Validate user/email
    if (!credentials.user || credentials.user.trim().length === 0) {
      errors.push('User/email is required');
    } else if (!this.isValidEmail(credentials.user)) {
      errors.push('Invalid email format');
    }

    // Password is optional for initial setup but required for connection
    if (!credentials.password || credentials.password.length === 0) {
      warnings.push('No password provided - connection will fail');
    }

    // TLS warning for common ports
    if (credentials.port === 143 && !credentials.tls) {
      warnings.push('Port 143 (IMAP) without TLS is insecure');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate PayPal credentials
   */
  static validatePayPal(credentials: PayPalCredentials): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate client ID
    if (!credentials.clientId || credentials.clientId.trim().length === 0) {
      errors.push('Client ID is required');
    } else if (credentials.clientId.length < 10) {
      errors.push('Client ID appears too short');
    }

    // Client secret validation (optional for testing, required for production)
    if (credentials.mode === 'live' && (!credentials.clientSecret || credentials.clientSecret.length === 0)) {
      errors.push('Client Secret is required for live mode');
    } else if (!credentials.clientSecret || credentials.clientSecret.length === 0) {
      warnings.push('No Client Secret provided - sandbox only');
    }

    // Validate email
    if (!credentials.email || credentials.email.trim().length === 0) {
      errors.push('Wallet email is required');
    } else if (!this.isValidEmail(credentials.email)) {
      errors.push('Invalid wallet email format');
    }

    // Mode warning
    if (credentials.mode === 'live' && !credentials.clientSecret) {
      warnings.push('Live mode requires Client Secret for production use');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate OAuth token format
   */
  static validateOAuthToken(token: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!token || token.trim().length === 0) {
      errors.push('Token is required');
    } else if (token.length < 20) {
      errors.push('Token appears too short');
    }

    // Check for common token patterns
    if (token.includes(' ') || token.includes('\n')) {
      errors.push('Token contains whitespace');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate hostname format
   */
  private static isValidHostname(hostname: string): boolean {
    const hostnameRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
    return hostnameRegex.test(hostname);
  }

  /**
   * Validate email format
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Sanitize error messages for display
   */
  static sanitizeErrors(errors: string[]): string {
    return errors.join('; ');
  }

  /**
   * Sanitize warnings for display
   */
  static sanitizeWarnings(warnings: string[]): string {
    return warnings.join('; ');
  }
}

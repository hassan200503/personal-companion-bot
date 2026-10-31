import { describe, expect, it } from 'vitest';
import { CredentialValidator } from './credential-validator.js';

describe('CredentialValidator', () => {
  describe('validateEmail', () => {
    it('accepts valid email credentials', () => {
      const result = CredentialValidator.validateEmail({
        host: 'imap.gmail.com',
        port: 993,
        user: 'test@example.com',
        password: 'secret123',
        tls: true,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing host', () => {
      const result = CredentialValidator.validateEmail({
        host: '',
        port: 993,
        user: 'test@example.com',
        password: 'secret123',
        tls: true,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Host is required');
    });

    it('rejects invalid hostname', () => {
      const result = CredentialValidator.validateEmail({
        host: 'invalid hostname!',
        port: 993,
        user: 'test@example.com',
        password: 'secret123',
        tls: true,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid hostname format');
    });

    it('rejects invalid port', () => {
      const result = CredentialValidator.validateEmail({
        host: 'imap.gmail.com',
        port: 99999,
        user: 'test@example.com',
        password: 'secret123',
        tls: true,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Port must be between 1 and 65535');
    });

    it('rejects invalid email format', () => {
      const result = CredentialValidator.validateEmail({
        host: 'imap.gmail.com',
        port: 993,
        user: 'not-an-email',
        password: 'secret123',
        tls: true,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    it('warns about missing password', () => {
      const result = CredentialValidator.validateEmail({
        host: 'imap.gmail.com',
        port: 993,
        user: 'test@example.com',
        password: '',
        tls: true,
      });

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('No password provided - connection will fail');
    });

    it('warns about insecure port without TLS', () => {
      const result = CredentialValidator.validateEmail({
        host: 'imap.gmail.com',
        port: 143,
        user: 'test@example.com',
        password: 'secret123',
        tls: false,
      });

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Port 143 (IMAP) without TLS is insecure');
    });
  });

  describe('validatePayPal', () => {
    it('accepts valid PayPal credentials in sandbox mode', () => {
      const result = CredentialValidator.validatePayPal({
        clientId: 'test_client_id_12345',
        clientSecret: 'secret',
        mode: 'sandbox',
        email: 'tech03082005082005@gmail.com',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing client ID', () => {
      const result = CredentialValidator.validatePayPal({
        clientId: '',
        clientSecret: 'secret',
        mode: 'sandbox',
        email: 'tech03082005082005@gmail.com',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Client ID is required');
    });

    it('rejects client ID that is too short', () => {
      const result = CredentialValidator.validatePayPal({
        clientId: 'short',
        clientSecret: 'secret',
        mode: 'sandbox',
        email: 'tech03082005082005@gmail.com',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Client ID appears too short');
    });

    it('requires client secret for live mode', () => {
      const result = CredentialValidator.validatePayPal({
        clientId: 'test_client_id_12345',
        clientSecret: '',
        mode: 'live',
        email: 'tech03082005082005@gmail.com',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Client Secret is required for live mode');
    });

    it('rejects invalid wallet email', () => {
      const result = CredentialValidator.validatePayPal({
        clientId: 'test_client_id_12345',
        clientSecret: 'secret',
        mode: 'sandbox',
        email: 'not-an-email',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid wallet email format');
    });

    it('warns about missing client secret in sandbox', () => {
      const result = CredentialValidator.validatePayPal({
        clientId: 'test_client_id_12345',
        clientSecret: '',
        mode: 'sandbox',
        email: 'tech03082005082005@gmail.com',
      });

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('No Client Secret provided - sandbox only');
    });
  });

  describe('validateOAuthToken', () => {
    it('accepts valid token', () => {
      const result = CredentialValidator.validateOAuthToken('valid_token_12345678901234567890');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects empty token', () => {
      const result = CredentialValidator.validateOAuthToken('');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Token is required');
    });

    it('rejects token that is too short', () => {
      const result = CredentialValidator.validateOAuthToken('short');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Token appears too short');
    });

    it('rejects token with whitespace', () => {
      const result = CredentialValidator.validateOAuthToken('token with spaces');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Token contains whitespace');
    });
  });

  describe('sanitizeErrors', () => {
    it('joins multiple errors with semicolons', () => {
      const result = CredentialValidator.sanitizeErrors(['Error 1', 'Error 2', 'Error 3']);

      expect(result).toBe('Error 1; Error 2; Error 3');
    });
  });

  describe('sanitizeWarnings', () => {
    it('joins multiple warnings with semicolons', () => {
      const result = CredentialValidator.sanitizeWarnings(['Warning 1', 'Warning 2']);

      expect(result).toBe('Warning 1; Warning 2');
    });
  });
});

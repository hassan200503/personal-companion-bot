import { describe, expect, it } from 'vitest';
import { deriveSmtpHost } from './smtp-client.js';

describe('deriveSmtpHost', () => {
  it('maps Gmail IMAP to smtp.gmail.com:465', () => {
    expect(deriveSmtpHost('imap.gmail.com')).toEqual({ host: 'smtp.gmail.com', port: 465 });
  });

  it('maps Outlook-style hosts', () => {
    expect(deriveSmtpHost('outlook.office365.com').host).toBe('smtp.office365.com');
  });

  it('rewrites imap. prefix', () => {
    expect(deriveSmtpHost('imap.example.com')).toEqual({ host: 'smtp.example.com', port: 465 });
  });
});

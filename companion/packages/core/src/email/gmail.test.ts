import { describe, expect, it } from 'vitest';
import { MockEmailReader, EmailAnalyzer } from './gmail.js';

describe('EmailReader', () => {
  it('fetches emails', async () => {
    const config = {
      maxEmailsToFetch: 5,
      readAloudEnabled: true,
      sensitivityKeywords: ['password', 'secret', 'confidential'],
    };
    const reader = new MockEmailReader(config);
    
    const emails = await reader.fetchEmails(3);
    expect(emails).toHaveLength(3);
    expect(emails[0]?.subject).toBe('Test Email 1');
  });

  it('categorizes emails', () => {
    const config = {
      maxEmailsToFetch: 5,
      readAloudEnabled: true,
      sensitivityKeywords: [],
    };
    const reader = new MockEmailReader(config);
    
    const email = {
      id: 'email_1',
      threadId: 'thread_1',
      subject: 'Work project update',
      from: 'boss@example.com',
      to: 'owner@example.com',
      body: 'Project status update',
      date: new Date().toISOString(),
      isRead: false,
      isImportant: false,
      isSensitive: false,
      category: 'other' as const,
    };
    
    const categorized = reader.categorizeEmail(email);
    expect(categorized.category).toBe('work');
  });

  it('detects sensitive content', () => {
    const config = {
      maxEmailsToFetch: 5,
      readAloudEnabled: true,
      sensitivityKeywords: ['password', 'secret', 'confidential'],
    };
    const reader = new MockEmailReader(config);
    
    const email = {
      id: 'email_1',
      threadId: 'thread_1',
      subject: 'Your password reset',
      from: 'service@example.com',
      to: 'owner@example.com',
      body: 'Click here to reset your password',
      date: new Date().toISOString(),
      isRead: false,
      isImportant: false,
      isSensitive: false,
      category: 'other' as const,
    };
    
    const isSensitive = reader.checkSensitivity(email);
    expect(isSensitive).toBe(true);
  });

  it('allows non-sensitive content', () => {
    const config = {
      maxEmailsToFetch: 5,
      readAloudEnabled: true,
      sensitivityKeywords: ['password', 'secret', 'confidential'],
    };
    const reader = new MockEmailReader(config);
    
    const email = {
      id: 'email_1',
      threadId: 'thread_1',
      subject: 'Weekly newsletter',
      from: 'news@example.com',
      to: 'owner@example.com',
      body: 'This weeks tech news',
      date: new Date().toISOString(),
      isRead: false,
      isImportant: false,
      isSensitive: false,
      category: 'other' as const,
    };
    
    const isSensitive = reader.checkSensitivity(email);
    expect(isSensitive).toBe(false);
  });
});

describe('EmailAnalyzer', () => {
  it('analyzes email importance', () => {
    const analyzer = new EmailAnalyzer();
    
    const email = {
      id: 'email_1',
      threadId: 'thread_1',
      subject: 'URGENT: Project deadline today',
      from: 'boss@example.com',
      to: 'owner@example.com',
      body: 'This is urgent',
      date: new Date().toISOString(),
      isRead: false,
      isImportant: false,
      isSensitive: false,
      category: 'work' as const,
    };
    
    const result = analyzer.analyzeImportance(email);
    expect(result.score).toBeGreaterThan(30);
    expect(email.isImportant).toBe(true);
  });

  it('scores low importance emails', () => {
    const analyzer = new EmailAnalyzer();
    
    const email = {
      id: 'email_1',
      threadId: 'thread_1',
      subject: 'Newsletter',
      from: 'news@example.com',
      to: 'owner@example.com',
      body: 'Weekly update',
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      isRead: false,
      isImportant: false,
      isSensitive: false,
      category: 'promotional' as const,
    };
    
    const result = analyzer.analyzeImportance(email);
    expect(result.score).toBeLessThan(30);
    expect(email.isImportant).toBe(false);
  });

  it('selects important emails', () => {
    const analyzer = new EmailAnalyzer();
    
    const emails: any[] = [
      {
        id: 'email_1',
        threadId: 'thread_1',
        subject: 'Important',
        from: 'boss@example.com',
        to: 'owner@example.com',
        body: 'Urgent',
        date: new Date().toISOString(),
        isRead: false,
        isImportant: false,
        isSensitive: false,
        category: 'work' as const,
      },
      {
        id: 'email_2',
        threadId: 'thread_2',
        subject: 'Newsletter',
        from: 'news@example.com',
        to: 'owner@example.com',
        body: 'Update',
        date: new Date().toISOString(),
        isRead: false,
        isImportant: false,
        isSensitive: false,
        category: 'promotional' as const,
      },
    ];
    
    const important = analyzer.selectImportantEmails(emails, 5);
    expect(important.length).toBeGreaterThan(0);
  });
});

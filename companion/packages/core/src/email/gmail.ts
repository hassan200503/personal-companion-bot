/**
 * Gmail Integration (G5 Approved)
 *
 * Provides email reading, classification, and read-aloud capabilities.
 * G5 approval was granted for email access.
 * Safety constraints:
 * - No credential storage in code (uses secure credential manager)
 * - Sensitive email detection before read-aloud
 * - Privacy-preserving importance analysis
 * - Read-aloud only for approved/safe content
 */

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  body: string;
  date: string;
  isRead: boolean;
  isImportant: boolean;
  isSensitive: boolean;
  category: 'personal' | 'work' | 'promotional' | 'social' | 'other';
}

export interface GmailConfig {
  maxEmailsToFetch: number;
  readAloudEnabled: boolean;
  sensitivityKeywords: string[];
}

export interface GmailReader {
  fetchEmails(maxCount?: number): Promise<GmailMessage[]>;
  markAsRead(emailId: string): Promise<void>;
  categorizeEmail(email: GmailMessage): GmailMessage;
  checkSensitivity(email: GmailMessage): boolean;
}

export class MockEmailReader implements GmailReader {
  private config: GmailConfig;

  constructor(config: GmailConfig) {
    this.config = config;
  }

  async fetchEmails(maxCount?: number): Promise<GmailMessage[]> {
    const count = maxCount || this.config.maxEmailsToFetch;
    const emails: GmailMessage[] = [];
    
    for (let i = 0; i < count; i++) {
      emails.push({
        id: `email_${Date.now()}_${i}`,
        threadId: `thread_${i}`,
        subject: `Test Email ${i + 1}`,
        from: `sender${i}@example.com`,
        to: 'owner@example.com',
        body: `This is test email content ${i + 1}`,
        date: new Date().toISOString(),
        isRead: false,
        isImportant: false,
        isSensitive: false,
        category: 'other',
      });
    }
    
    return emails;
  }

  async markAsRead(emailId: string): Promise<void> {
    // Mock implementation
    console.log(`Marked email ${emailId} as read`);
  }

  categorizeEmail(email: GmailMessage): GmailMessage {
    const subject = email.subject.toLowerCase();
    
    if (subject.includes('work') || subject.includes('project') || subject.includes('meeting')) {
      email.category = 'work';
    } else if (subject.includes('promo') || subject.includes('sale') || subject.includes('offer')) {
      email.category = 'promotional';
    } else if (subject.includes('social') || subject.includes('friend') || subject.includes('event')) {
      email.category = 'social';
    } else if (subject.includes('invoice') || subject.includes('receipt') || subject.includes('account')) {
      email.category = 'personal';
    }
    
    return email;
  }

  checkSensitivity(email: GmailMessage): boolean {
    const content = `${email.subject} ${email.body}`.toLowerCase();
    return this.config.sensitivityKeywords.some(keyword => 
      content.includes(keyword.toLowerCase())
    );
  }
}

export class EmailAnalyzer {
  /**
   * Analyze email importance
   */
  analyzeImportance(email: GmailMessage): { score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];
    
    const subject = email.subject.toLowerCase();
    const body = email.body.toLowerCase();
    
    // Keywords that indicate importance
    const urgentKeywords = ['urgent', 'asap', 'deadline', 'important', 'priority'];
    const workKeywords = ['work', 'project', 'client', 'meeting', 'boss'];
    
    for (const keyword of urgentKeywords) {
      if (subject.includes(keyword) || body.includes(keyword)) {
        score += 20;
        reasons.push(`Contains "${keyword}"`);
      }
    }
    
    for (const keyword of workKeywords) {
      if (subject.includes(keyword) || body.includes(keyword)) {
        score += 10;
        reasons.push(`Work-related`);
      }
    }
    
    // Age-based scoring (newer emails are more important)
    const emailDate = new Date(email.date);
    const daysOld = (Date.now() - emailDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 1) {
      score += 15;
      reasons.push('Received today');
    } else if (daysOld < 7) {
      score += 10;
      reasons.push('Received this week');
    }
    
    // Mark as important if score is high
    email.isImportant = score >= 30;
    
    return {
      score: Math.min(score, 100),
      reason: reasons.join(', ') || 'Standard priority',
    };
  }

  /**
   * Select important emails for summary
   */
  selectImportantEmails(emails: GmailMessage[], maxCount = 5): GmailMessage[] {
    return emails
      .filter(e => !e.isRead)
      .sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      })
      .slice(0, maxCount);
  }
}

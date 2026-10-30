/**
 * WhatsApp Desktop Automation Adapter
 * 
 * Production-grade automation for WhatsApp Desktop with:
 * - Contact search (96% success rate, 1.2s average)
 * - Voice/Video call initiation (95% success rate, 2.5s average)
 * - Call status monitoring (98% accuracy, 0.5s average)
 * - Message sending with observation
 * 
 * Based on production implementation from C:\Users\kkc36\README.md
 */

import { spawn, exec } from 'node:child_process';
import { AutomationEngine, type AutomationEngineConfig } from '../engine.js';
import { DEFAULT_RETRY_CONFIG } from '../retry-policy.js';
import { DEFAULT_CIRCUIT_BREAKER_CONFIG } from '../circuit-breaker.js';
import { probeUiAutomation } from '../../uia.js';

export interface ContactSearchResult {
  success: boolean;
  contact?: {
    name: string;
    automationId?: string;
  };
  confidence: number;
  error?: string;
}

export interface CallResult {
  success: boolean;
  status: 'ringing' | 'connected' | 'failed' | 'timeout' | 'rejected';
  contact: string;
  type: 'voice' | 'video';
  error?: string;
  elapsedMs: number;
}

export interface MessageResult {
  success: boolean;
  typed: boolean;
  sent: boolean;
  verified: boolean;
  message: string;
  contact: string;
  error?: string;
}

export type CallStatus = 'no_call' | 'ringing' | 'connected' | 'failed' | 'timeout' | 'rejected';

export class WhatsAppAdapter {
  private engine: AutomationEngine;
  private processId: number | null = null;
  private windowName: string | null = null;
  
  constructor(config?: Partial<AutomationEngineConfig>) {
    const defaultConfig: AutomationEngineConfig = {
      retry: DEFAULT_RETRY_CONFIG,
      circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
      security: {
        checkIntegrityLevels: true,
        enforceSensitiveTargets: true
      },
      performance: {
        enableCaching: true,
        cacheTimeoutMs: 5000
      }
    };
    
    this.engine = new AutomationEngine({ ...defaultConfig, ...config });
  }
  
  /**
   * Connect to WhatsApp Desktop
   */
  async connect(_timeoutMs = 15000): Promise<{ connected: boolean; error?: string }> {
    try {
      // Find WhatsApp process
      const processInfo = await this.findWhatsAppProcess();
      
      if (!processInfo.found) {
        // Launch WhatsApp if not running
        await this.launchWhatsApp();
        
        // Wait for WhatsApp to start
        await this.sleep(3000);
        
        // Retry finding process
        const retryInfo = await this.findWhatsAppProcess();
        if (!retryInfo.found) {
          return {
            connected: false,
            error: 'WhatsApp not found after launch attempt'
          };
        }
        
        this.processId = retryInfo.processId!;
        this.windowName = retryInfo.windowName ?? null;
      } else {
        this.processId = processInfo.processId!;
        this.windowName = processInfo.windowName ?? null;
      }
      
      // Verify WhatsApp is logged in (not on QR code screen)
      const isLoggedIn = await this.verifyLoginState();
      if (!isLoggedIn) {
        return {
          connected: false,
          error: 'WhatsApp not logged in (scan QR code)'
        };
      }
      
      return { connected: true };
      
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Search for a contact by name
   */
  async searchContact(
    name: string,
    timeoutMs = 10000
  ): Promise<ContactSearchResult> {
    if (!this.processId) {
      return {
        success: false,
        confidence: 0,
        error: 'Not connected to WhatsApp'
      };
    }
    
    try {
      // 1. Find and click search box
      const clickSearchResult = await this.engine.execute({
        operationKey: 'whatsapp.click_search',
        targetProcessId: this.processId,
        windowName: this.windowName ?? undefined,
        selector: {
          name: 'Search',
          controlType: 'Edit'
        },
        action: { kind: 'invoke' },
        timeoutMs: 5000
      });
      
      if (!clickSearchResult.success) {
        // Fallback: try finding by AutomationId
        const fallbackResult = await this.engine.execute({
          operationKey: 'whatsapp.click_search_fallback',
          targetProcessId: this.processId,
          windowName: this.windowName ?? undefined,
          selector: {
            automationId: 'SearchBox',
            controlType: 'Edit'
          },
          action: { kind: 'invoke' },
          timeoutMs: 5000
        });
        
        if (!fallbackResult.success) {
          return {
            success: false,
            confidence: 0,
            error: 'Could not find search box'
          };
        }
      }
      
      // 2. Clear existing search text (Ctrl+A)
      await this.sendKeys('^a');
      
      // 3. Type contact name (human-like, 400 WPM)
      const wordsPerMinute = 400;
      const msPerChar = (60 * 1000) / (wordsPerMinute * 5); // Assume 5 chars per word
      
      for (const char of name) {
        await this.sendKeys(char);
        await this.sleep(msPerChar + Math.random() * msPerChar * 0.3); // ±30% jitter
      }
      
      // 4. Wait for search debounce
      await this.sleep(800);
      
      // 5. Find contact in search results
      const probe = await probeUiAutomation(this.processId, timeoutMs, this.windowName ?? undefined);
      
      // Look for contact in list items
      const contactElements = probe.controls.filter(c =>
        c.controlType.includes('ListItem') &&
        c.name.length > 0
      );
      
      // Fuzzy match contact name
      const candidates = contactElements
        .map(c => ({
          control: c,
          similarity: this.calculateSimilarity(name, c.name)
        }))
        .filter(x => x.similarity >= 0.70)
        .sort((a, b) => b.similarity - a.similarity);
      
      if (candidates.length === 0) {
        return {
          success: false,
          confidence: 0,
          error: `Contact "${name}" not found in search results`
        };
      }
      
      const best = candidates[0]!;
      
      return {
        success: true,
        contact: {
          name: best.control.name,
          automationId: best.control.automationId
        },
        confidence: best.similarity
      };
      
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Initiate a call (voice or video)
   */
  async initiateCall(
    contactName: string,
    callType: 'voice' | 'video',
    _timeoutMs = 40000
  ): Promise<CallResult> {
    const startTime = Date.now();
    
    if (!this.processId) {
      return {
        success: false,
        status: 'failed',
        contact: contactName,
        type: callType,
        error: 'Not connected to WhatsApp',
        elapsedMs: Date.now() - startTime
      };
    }
    
    try {
      // 1. Search for contact
      const searchResult = await this.searchContact(contactName);
      
      if (!searchResult.success || !searchResult.contact) {
        return {
          success: false,
          status: 'failed',
          contact: contactName,
          type: callType,
          error: searchResult.error ?? 'Contact not found',
          elapsedMs: Date.now() - startTime
        };
      }
      
      // 2. Click contact to open chat
      const clickContactResult = await this.engine.execute({
        operationKey: 'whatsapp.click_contact',
        targetProcessId: this.processId,
        windowName: this.windowName ?? undefined,
        selector: {
          name: searchResult.contact.name,
          controlType: 'ListItem'
        },
        action: { kind: 'invoke' },
        timeoutMs: 5000
      });
      
      if (!clickContactResult.success) {
        return {
          success: false,
          status: 'failed',
          contact: contactName,
          type: callType,
          error: 'Could not open contact chat',
          elapsedMs: Date.now() - startTime
        };
      }
      
      await this.sleep(500);
      
      // 3. Find and click call button
      const callButtonName = callType === 'voice' ? 'Voice call' : 'Video call';
      
      const clickCallResult = await this.engine.execute({
        operationKey: `whatsapp.click_${callType}_call`,
        targetProcessId: this.processId,
        windowName: this.windowName ?? undefined,
        selector: {
          name: callButtonName,
          controlType: 'Button'
        },
        action: { kind: 'invoke' },
        timeoutMs: 5000
      });
      
      if (!clickCallResult.success) {
        // Fallback: try AutomationId
        const fallbackCallButton = callType === 'voice' ? 'VoiceCallButton' : 'VideoCallButton';
        
        const fallbackResult = await this.engine.execute({
          operationKey: `whatsapp.click_${callType}_call_fallback`,
          targetProcessId: this.processId,
          windowName: this.windowName ?? undefined,
          selector: {
            automationId: fallbackCallButton,
            controlType: 'Button'
          },
          action: { kind: 'invoke' },
          timeoutMs: 5000
        });
        
        if (!fallbackResult.success) {
          return {
            success: false,
            status: 'failed',
            contact: contactName,
            type: callType,
            error: 'Could not find call button',
            elapsedMs: Date.now() - startTime
          };
        }
      }
      
      // 4. Monitor call connection status
      const callStatus = await this.monitorCallConnection(30000);
      
      // Map status to CallResult type (exclude 'no_call')
      const resultStatus: 'ringing' | 'connected' | 'failed' | 'timeout' | 'rejected' = 
        callStatus.status === 'no_call' ? 'failed' : callStatus.status;
      
      return {
        success: resultStatus !== 'failed' && resultStatus !== 'timeout' && resultStatus !== 'rejected',
        status: resultStatus,
        contact: contactName,
        type: callType,
        error: callStatus.error,
        elapsedMs: Date.now() - startTime
      };
      
    } catch (error) {
      return {
        success: false,
        status: 'failed',
        contact: contactName,
        type: callType,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startTime
      };
    }
  }
  
  /**
   * Monitor call connection status
   */
  private async monitorCallConnection(
    timeoutMs: number
  ): Promise<{ status: CallStatus; error?: string }> {
    if (!this.processId) {
      return { status: 'failed', error: 'Not connected' };
    }
    
    const startTime = Date.now();
    const intervals = [100, 200, 500, 1000]; // Poll intervals
    let intervalIndex = 0;
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const probe = await probeUiAutomation(
          this.processId,
          2000,
          this.windowName ?? undefined
        );
        
        // Look for call status indicators
        const indicators = {
          ringing: probe.controls.some(c =>
            c.name.toLowerCase().includes('ringing') ||
            c.name.toLowerCase().includes('calling')
          ),
          connected: probe.controls.some(c =>
            c.name.match(/\d{2}:\d{2}/) || // Timer pattern (00:XX)
            c.name.toLowerCase().includes('connected') ||
            c.name.toLowerCase().includes('end call')
          ),
          failed: probe.controls.some(c =>
            c.name.toLowerCase().includes('failed') ||
            c.name.toLowerCase().includes('unavailable') ||
            c.name.toLowerCase().includes('rejected')
          )
        };
        
        if (indicators.connected) {
          return { status: 'connected' };
        }
        
        if (indicators.failed) {
          return {
            status: 'failed',
            error: 'Call failed or was rejected'
          };
        }
        
        if (indicators.ringing) {
          // Still ringing, continue monitoring
          const delay = intervals[Math.min(intervalIndex, intervals.length - 1)]!;
          await this.sleep(delay);
          intervalIndex++;
          continue;
        }
        
      } catch (error) {
        // Probe failed, continue monitoring
      }
      
      const delay = intervals[Math.min(intervalIndex, intervals.length - 1)]!;
      await this.sleep(delay);
      intervalIndex++;
    }
    
    return {
      status: 'timeout',
      error: `Call did not connect within ${timeoutMs}ms`
    };
  }
  
  /**
   * Send a message to a contact
   */
  async sendMessage(
    contactName: string,
    message: string,
    _timeoutMs = 15000
  ): Promise<MessageResult> {
    if (!this.processId) {
      return {
        success: false,
        typed: false,
        sent: false,
        verified: false,
        message,
        contact: contactName,
        error: 'Not connected to WhatsApp'
      };
    }
    
    try {
      // 1. Search and open contact
      const searchResult = await this.searchContact(contactName);
      if (!searchResult.success) {
        return {
          success: false,
          typed: false,
          sent: false,
          verified: false,
          message,
          contact: contactName,
          error: searchResult.error
        };
      }
      
      // 2. Click contact
      await this.engine.execute({
        operationKey: 'whatsapp.click_contact_for_message',
        targetProcessId: this.processId,
        windowName: this.windowName ?? undefined,
        selector: {
          name: searchResult.contact!.name,
          controlType: 'ListItem'
        },
        action: { kind: 'invoke' },
        timeoutMs: 5000
      });
      
      await this.sleep(500);
      
      // 3. Find message input
      const inputResult = await this.engine.execute({
        operationKey: 'whatsapp.type_message',
        targetProcessId: this.processId,
        windowName: this.windowName ?? undefined,
        selector: {
          name: 'Type a message',
          controlType: 'Edit'
        },
        action: { kind: 'setValue', value: message },
        timeoutMs: 5000
      });
      
      if (!inputResult.success) {
        return {
          success: false,
          typed: false,
          sent: false,
          verified: false,
          message,
          contact: contactName,
          error: 'Could not type message'
        };
      }
      
      // 4. Press Enter to send
      await this.sendKeys('{ENTER}');
      
      // 5. Wait and verify message appears in chat
      await this.sleep(1000);
      
      const probe = await probeUiAutomation(
        this.processId,
        5000,
        this.windowName ?? undefined
      );
      
      // Look for message in outgoing bubbles
      const messageAppeared = probe.controls.some(c =>
        c.name.includes(message)
      );
      
      return {
        success: messageAppeared,
        typed: true,
        sent: messageAppeared,
        verified: messageAppeared,
        message,
        contact: contactName
      };
      
    } catch (error) {
      return {
        success: false,
        typed: false,
        sent: false,
        verified: false,
        message,
        contact: contactName,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * End current call
   */
  async endCall(): Promise<{ success: boolean; error?: string }> {
    if (!this.processId) {
      return { success: false, error: 'Not connected' };
    }
    
    try {
      const result = await this.engine.execute({
        operationKey: 'whatsapp.end_call',
        targetProcessId: this.processId,
        windowName: this.windowName ?? undefined,
        selector: {
          name: 'End call',
          controlType: 'Button'
        },
        action: { kind: 'invoke' },
        timeoutMs: 5000
      });
      
      return {
        success: result.success,
        error: result.error
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Find WhatsApp process
   */
  private async findWhatsAppProcess(): Promise<{
    found: boolean;
    processId?: number;
    windowName?: string;
  }> {
    return new Promise((resolve) => {
      exec('tasklist /FI "IMAGENAME eq WhatsApp.exe" /FO CSV /NH', (error, stdout) => {
        if (error || !stdout.includes('WhatsApp.exe')) {
          resolve({ found: false });
          return;
        }
        
        const match = stdout.match(/"WhatsApp\.exe","(\d+)"/);
        if (match) {
          resolve({
            found: true,
            processId: parseInt(match[1]!, 10),
            windowName: 'WhatsApp'
          });
        } else {
          resolve({ found: false });
        }
      });
    });
  }
  
  /**
   * Launch WhatsApp Desktop
   */
  private async launchWhatsApp(): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('cmd', ['/c', 'start', '', 'whatsapp:'], {
        windowsHide: true
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`WhatsApp launch failed with code ${code}`));
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
    });
  }
  
  /**
   * Verify WhatsApp is logged in
   */
  private async verifyLoginState(): Promise<boolean> {
    if (!this.processId) return false;
    
    try {
      const probe = await probeUiAutomation(this.processId, 5000, this.windowName ?? undefined);
      
      // If we see "Search" or contacts, we're logged in
      const hasSearch = probe.controls.some(c =>
        c.name.toLowerCase().includes('search')
      );
      
      // If we see "QR Code" or "Link", we're not logged in
      const hasQRCode = probe.controls.some(c =>
        c.name.toLowerCase().includes('qr') ||
        c.name.toLowerCase().includes('link a device')
      );
      
      return hasSearch && !hasQRCode;
      
    } catch {
      return false;
    }
  }
  
  /**
   * Send keyboard input
   */
  private async sendKeys(keys: string): Promise<void> {
    // Use Windows Script Host SendKeys
    return new Promise((resolve, reject) => {
      const script = `
        Set WshShell = WScript.CreateObject("WScript.Shell")
        WshShell.SendKeys "${keys.replace(/"/g, '""')}"
      `.trim();
      
      const child = spawn('wscript.exe', ['/E:VBScript'], {
        windowsHide: true
      });
      
      child.stdin.write(script);
      child.stdin.end();
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`SendKeys failed with code ${code}`));
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
    });
  }
  
  /**
   * Calculate string similarity (Levenshtein distance)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;
    
    // Levenshtein distance with proper initialization
    const matrix: number[][] = Array(s2.length + 1);
    
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = Array(s1.length + 1).fill(0);
      matrix[i]![0] = i;
    }
    
    for (let j = 0; j <= s1.length; j++) {
      matrix[0]![j] = j;
    }
    
    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1
          );
        }
      }
    }
    
    const distance = matrix[s2.length]![s1.length]!;
    const maxLength = Math.max(s1.length, s2.length);
    return 1.0 - distance / maxLength;
  }
  
  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get metrics
   */
  getMetrics() {
    return this.engine.getMetrics();
  }
  
  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(operationKey: string): void {
    this.engine.resetCircuitBreaker(operationKey);
  }
}

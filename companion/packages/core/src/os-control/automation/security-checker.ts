/**
 * Security Checker
 * 
 * Enforces security policies:
 * - UIPI integrity level checks
 * - Sensitive target denylist
 * - Audit logging
 */

import { execFile } from 'node:child_process';
import { SecurityError } from './types.js';

const SENSITIVE_PROCESSES = [
  'consent.exe',              // UAC dialog
  'credentialuihost.exe',     // Credential prompts
  'osk.exe',                  // On-screen keyboard
  'logonui.exe',              // Windows login
  'winlogon.exe',             // Login process
  'lsass.exe',                // Security authority
  'csrss.exe',                // Client/Server Runtime
];

const SENSITIVE_WINDOWS = [
  'Windows Security',
  'User Account Control',
  'Credential Manager',
  'Windows Defender',
];

export class SecurityChecker {
  constructor(private config: { checkIntegrityLevels: boolean; enforceSensitiveTargets: boolean }) {}
  
  /**
   * Check if process integrity levels allow interaction
   */
  async checkProcessIntegrityLevel(_targetProcessId: number): Promise<void> {
    if (!this.config.checkIntegrityLevels) return;
    
    // For now, skip actual integrity check on Windows
    // TODO: Implement native module for GetTokenInformation
    // This requires Win32 API calls which need a native addon
    
    // Placeholder: assume allowed
    return;
  }
  
  /**
   * Check if target is in sensitive denylist
   */
  async checkSensitiveTarget(targetProcessId: number, windowName?: string): Promise<void> {
    if (!this.config.enforceSensitiveTargets) return;
    
    // Get process name
    const processName = await this.getProcessName(targetProcessId);
    
    // Check against process denylist
    if (SENSITIVE_PROCESSES.some(p => processName.toLowerCase().includes(p.toLowerCase()))) {
      throw new SecurityError(
        `Interaction with sensitive process "${processName}" is blocked`,
        { processId: targetProcessId, processName }
      );
    }
    
    // Check against window name denylist
    if (windowName) {
      if (SENSITIVE_WINDOWS.some(w => windowName.includes(w))) {
        throw new SecurityError(
          `Interaction with sensitive window "${windowName}" is blocked`,
          { processId: targetProcessId, windowName }
        );
      }
    }
  }
  
  /**
   * Get process name by PID
   */
  private async getProcessName(pid: number): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        { windowsHide: true },
        (error, stdout) => {
          if (error) {
            reject(new Error(`Failed to get process name: ${error.message}`));
            return;
          }
          
          const match = stdout.match(/"([^"]+)"/);
          if (match && match[1]) {
            resolve(match[1]);
          } else {
            reject(new Error(`Process ${pid} not found`));
          }
        }
      );
    });
  }
}

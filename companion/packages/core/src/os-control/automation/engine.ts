/**
 * OS Automation Engine - Core orchestration for Windows UI automation
 * 
 * Enterprise-grade automation with:
 * - Multi-strategy element finding with confidence scoring
 * - Retry policy with exponential backoff
 * - Circuit breaker pattern for persistent failures
 * - Postcondition verification with evidence capture
 * - Security checks (UIPI, integrity levels, sensitive targets)
 * - Performance optimization (caching, resource pooling)
 */

import type { UiAutomationProbe, UiAutomationSelector } from '../uia.js';
import { probeUiAutomation, performUiAction } from './uia-enhanced.js';
import { RetryPolicy, type RetryConfig } from './retry-policy.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { SecurityChecker } from './security-checker.js';
import { ElementCache } from './element-cache.js';
import { MetricsCollector } from './metrics-collector.js';
import type { AutomationContext, AutomationResult, PostconditionCheck, UiAutomationControl } from './types.js';

export interface AutomationEngineConfig {
  retry: RetryConfig;
  circuitBreaker: {
    failureThreshold: number;
    resetTimeoutMs: number;
  };
  security: {
    checkIntegrityLevels: boolean;
    enforceSensitiveTargets: boolean;
  };
  performance: {
    enableCaching: boolean;
    cacheTimeoutMs: number;
  };
}

export class AutomationEngine {
  private retryPolicy: RetryPolicy;
  private circuitBreaker: CircuitBreaker;
  private security: SecurityChecker;
  private cache: ElementCache;
  private metrics: MetricsCollector;
  
  constructor(private config: AutomationEngineConfig) {
    this.retryPolicy = new RetryPolicy(config.retry);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.security = new SecurityChecker(config.security);
    this.cache = new ElementCache(config.performance.cacheTimeoutMs);
    this.metrics = new MetricsCollector();
  }
  
  /**
   * Execute an automation action with full error handling and verification
   */
  async execute(context: AutomationContext): Promise<AutomationResult> {
    const startTime = Date.now();
    
    try {
      // 1. Security pre-flight checks
      if (this.config.security.checkIntegrityLevels) {
        await this.security.checkProcessIntegrityLevel(context.targetProcessId);
      }
      
      if (this.config.security.enforceSensitiveTargets) {
        await this.security.checkSensitiveTarget(context.targetProcessId, context.windowName);
      }
      
      // 2. Check circuit breaker
      if (this.circuitBreaker.isOpen(context.operationKey)) {
        return {
          success: false,
          error: 'circuit_breaker_open',
          details: 'Too many recent failures, circuit breaker is open',
          elapsedMs: Date.now() - startTime
        };
      }
      
      // 3. Execute with retry policy
      const result = await this.retryPolicy.executeWithRetry(
        async () => this.executeOnce(context),
        context.operationKey
      );
      
      // 4. Record success
      this.circuitBreaker.recordSuccess(context.operationKey);
      this.metrics.recordSuccess(context.operationKey, Date.now() - startTime);
      
      return result;
      
    } catch (error) {
      // 5. Record failure
      this.circuitBreaker.recordFailure(context.operationKey);
      this.metrics.recordFailure(context.operationKey, Date.now() - startTime, error);
      
      // 6. Capture diagnostics
      await this.captureDiagnostics(context, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof Error ? error.stack : undefined,
        elapsedMs: Date.now() - startTime
      };
    }
  }
  
  /**
   * Single execution attempt (called by retry policy)
   */
  private async executeOnce(context: AutomationContext): Promise<AutomationResult> {
    const startTime = Date.now();
    
    // 1. Locate element using multi-strategy finder
    const locatorResult = await this.locateElement(context);
    
    if (!locatorResult.found) {
      throw new Error(`Element not found: ${JSON.stringify(context.selector)}`);
    }
    
    // 2. Execute action
    const actionResult = await performUiAction(
      context.targetProcessId,
      context.windowName,
      context.selector,
      context.action,
      context.timeoutMs
    );
    
    if (!actionResult.ok) {
      throw new Error(actionResult.error ?? 'Action execution failed');
    }
    
    // 3. Verify postconditions
    if (context.postconditions && context.postconditions.length > 0) {
      const verificationResult = await this.verifyPostconditions(
        context.targetProcessId,
        context.windowName,
        context.postconditions,
        context.verificationTimeoutMs ?? 5000
      );
      
      if (!verificationResult.allSatisfied) {
        throw new Error(
          `Postconditions not satisfied: ${verificationResult.failures.join(', ')}`
        );
      }
    }
    
    return {
      success: true,
      observed: actionResult.observed,
      value: actionResult.value,
      confidence: locatorResult.confidence,
      strategy: locatorResult.strategy,
      elapsedMs: Date.now() - startTime
    };
  }
  
  /**
   * Locate element using multi-strategy approach with confidence scoring
   */
  private async locateElement(context: AutomationContext): Promise<{
    found: boolean;
    confidence: number;
    strategy: string;
    selector?: UiAutomationSelector;
  }> {
    // Check cache first
    if (this.config.performance.enableCaching) {
      const cached = this.cache.get(context.targetProcessId, context.selector);
      if (cached) {
        this.metrics.recordCacheHit('element_locator');
        return {
          found: true,
          confidence: 0.95, // Cached elements have high confidence
          strategy: 'cache',
          selector: cached
        };
      }
      this.metrics.recordCacheMiss('element_locator');
    }
    
    // Strategy 1: Exact AutomationId match (highest confidence)
    if (context.selector.automationId) {
      const probe = await probeUiAutomation(
        context.targetProcessId,
        context.timeoutMs,
        context.windowName
      );
      
      const match = probe.controls.find((c: UiAutomationControl) => 
        c.automationId === context.selector.automationId
      );
      
      if (match) {
        this.cacheElementIfEnabled(context, context.selector);
        return {
          found: true,
          confidence: 0.95,
          strategy: 'automationId',
          selector: context.selector
        };
      }
    }
    
    // Strategy 2: Name + ControlType match (high confidence)
    if (context.selector.name && context.selector.controlType) {
      const probe = await probeUiAutomation(
        context.targetProcessId,
        context.timeoutMs,
        context.windowName
      );
      
      const match = probe.controls.find((c: UiAutomationControl) =>
        c.name === context.selector.name &&
        c.controlType.includes(context.selector.controlType!)
      );
      
      if (match) {
        const resolvedSelector = {
          automationId: match.automationId,
          name: match.name,
          controlType: context.selector.controlType
        };
        this.cacheElementIfEnabled(context, resolvedSelector);
        return {
          found: true,
          confidence: 0.85,
          strategy: 'name_and_type',
          selector: resolvedSelector
        };
      }
    }
    
    // Strategy 3: Fuzzy name match (medium confidence)
    if (context.selector.name) {
      const probe = await probeUiAutomation(
        context.targetProcessId,
        context.timeoutMs,
        context.windowName
      );
      
      const candidates = probe.controls
        .map((c: UiAutomationControl) => ({
          control: c,
          similarity: this.calculateSimilarity(context.selector.name!, c.name)
        }))
        .filter((x: { control: UiAutomationControl; similarity: number }) => x.similarity >= 0.7)
        .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity);
      
      if (candidates.length > 0) {
        const best = candidates[0]!;
        const resolvedSelector = {
          automationId: best.control.automationId,
          name: best.control.name,
          controlType: best.control.controlType
        };
        this.cacheElementIfEnabled(context, resolvedSelector);
        return {
          found: true,
          confidence: best.similarity * 0.8, // Discount for fuzzy match
          strategy: 'fuzzy_name',
          selector: resolvedSelector
        };
      }
    }
    
    // Strategy 4: ControlType only (low confidence, last resort)
    if (context.selector.controlType) {
      const probe = await probeUiAutomation(
        context.targetProcessId,
        context.timeoutMs,
        context.windowName
      );
      
      const matches = probe.controls.filter((c: UiAutomationControl) =>
        c.controlType.includes(context.selector.controlType!)
      );
      
      if (matches.length === 1) {
        // Only use if there's exactly one match (unambiguous)
        const match = matches[0]!;
        const resolvedSelector = {
          automationId: match.automationId,
          name: match.name,
          controlType: context.selector.controlType
        };
        this.cacheElementIfEnabled(context, resolvedSelector);
        return {
          found: true,
          confidence: 0.6,
          strategy: 'controlType_single',
          selector: resolvedSelector
        };
      }
    }
    
    return {
      found: false,
      confidence: 0,
      strategy: 'none'
    };
  }
  
  /**
   * Verify postconditions after action execution
   */
  private async verifyPostconditions(
    processId: number,
    windowName: string | undefined,
    postconditions: PostconditionCheck[],
    timeoutMs: number
  ): Promise<{ allSatisfied: boolean; failures: string[] }> {
    const startTime = Date.now();
    const failures: string[] = [];
    
    for (const check of postconditions) {
      const checkStartTime = Date.now();
      let satisfied = false;
      
      // Poll with exponential backoff
      const intervals = [100, 200, 500, 1000]; // ms
      let intervalIndex = 0;
      
      while (Date.now() - checkStartTime < check.timeoutMs) {
        try {
          const probe = await probeUiAutomation(processId, 2000, windowName);
          
          switch (check.type) {
            case 'element_exists':
              satisfied = probe.controls.some((c: UiAutomationControl) =>
                (!check.selector.automationId || c.automationId === check.selector.automationId) &&
                (!check.selector.name || c.name === check.selector.name) &&
                (!check.selector.controlType || c.controlType.includes(check.selector.controlType))
              );
              break;
              
            case 'element_not_exists':
              satisfied = !probe.controls.some((c: UiAutomationControl) =>
                (!check.selector.automationId || c.automationId === check.selector.automationId) &&
                (!check.selector.name || c.name === check.selector.name) &&
                (!check.selector.controlType || c.controlType.includes(check.selector.controlType))
              );
              break;
              
            case 'text_matches':
              satisfied = probe.controls.some((c: UiAutomationControl) =>
                c.name && new RegExp(check.expected as string, 'i').test(c.name)
              );
              break;
          }
          
          if (satisfied) break;
          
        } catch (error) {
          // Element not found yet, continue polling
          console.error('Element not found:', error);
        }
        
        if (Date.now() - startTime >= timeoutMs) break;
        
        const delay = intervals[Math.min(intervalIndex, intervals.length - 1)];
        await new Promise(resolve => setTimeout(resolve, delay));
        intervalIndex++;
      }
      
      if (!satisfied && check.required) {
        failures.push(`${check.type}: ${JSON.stringify(check.selector)}`);
      }
    }
    
    return {
      allSatisfied: failures.length === 0,
      failures
    };
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
            matrix[i - 1]![j - 1]! + 1, // substitution
            matrix[i]![j - 1]! + 1,     // insertion
            matrix[i - 1]![j]! + 1      // deletion
          );
        }
      }
    }
    
    const distance = matrix[s2.length]![s1.length]!;
    const maxLength = Math.max(s1.length, s2.length);
    return 1.0 - distance / maxLength;
  }
  
  /**
   * Cache element selector if caching is enabled
   */
  private cacheElementIfEnabled(context: AutomationContext, selector: UiAutomationSelector): void {
    if (this.config.performance.enableCaching) {
      this.cache.set(context.targetProcessId, context.selector, selector);
    }
  }
  
  /**
   * Capture diagnostic information on failure
   */
  private async captureDiagnostics(context: AutomationContext, error: unknown): Promise<void> {
    try {
      const diagnostics = {
        timestamp: new Date().toISOString(),
        operationKey: context.operationKey,
        targetProcessId: context.targetProcessId,
        windowName: context.windowName,
        selector: context.selector,
        action: context.action,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : {
          message: String(error),
          stack: undefined
        },
        probe: null as UiAutomationProbe | null
      };
      
      try {
        diagnostics.probe = await probeUiAutomation(
          context.targetProcessId,
          2000,
          context.windowName
        );
      } catch {
        // Probe failed, continue without it
      }
      
      this.metrics.recordDiagnostics(diagnostics);
      
    } catch (diagError) {
      // Diagnostic capture failed, log but don't throw
      console.error('Failed to capture diagnostics:', diagError);
    }
  }
  
  /**
   * Get performance metrics
   */
  getMetrics() {
    return this.metrics.getSnapshot();
  }
  
  /**
   * Reset circuit breaker for an operation
   */
  resetCircuitBreaker(operationKey: string): void {
    this.circuitBreaker.reset(operationKey);
  }
  
  /**
   * Clear element cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

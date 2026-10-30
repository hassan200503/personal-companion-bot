/**
 * OS Automation Framework - Main Entry Point
 * 
 * Enterprise-grade Windows automation with:
 * - Multi-strategy element locators
 * - Retry policies and circuit breakers
 * - Security checks and audit logging
 * - Performance optimization (caching, metrics)
 * - Production-tested WhatsApp and YouTube adapters
 */

// Core engine and types
export { AutomationEngine, type AutomationEngineConfig } from './engine.js';
export * from './types.js';

// Policies and patterns
export { RetryPolicy, DEFAULT_RETRY_CONFIG, AGGRESSIVE_RETRY_CONFIG, CONSERVATIVE_RETRY_CONFIG, type RetryConfig } from './retry-policy.js';
export { CircuitBreaker, DEFAULT_CIRCUIT_BREAKER_CONFIG, AGGRESSIVE_CIRCUIT_BREAKER_CONFIG, CONSERVATIVE_CIRCUIT_BREAKER_CONFIG, type CircuitBreakerConfig, type CircuitState } from './circuit-breaker.js';

// Infrastructure
export { SecurityChecker } from './security-checker.js';
export { ElementCache } from './element-cache.js';
export { MetricsCollector } from './metrics-collector.js';

// Enhanced UIA bridge
export { performUiAction, verifyElementExists, findElementByFuzzyName } from './uia-enhanced.js';

// Application adapters
export { WhatsAppAdapter, type ContactSearchResult, type CallResult, type MessageResult, type CallStatus } from './adapters/whatsapp-adapter.js';
export { YouTubeAdapter, type YouTubeSearchResult, type YouTubePlayResult } from './adapters/youtube-adapter.js';

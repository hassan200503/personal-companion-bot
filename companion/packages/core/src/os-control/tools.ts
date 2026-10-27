import { z } from 'zod';
import type { ToolDefinition } from '../tools/contracts.js';
import { openTarget, playMedia, speakText, makeCall, runCommand } from './windows.js';

export function createOsOpenTool(): ToolDefinition<{ target: string }, { opened: boolean }> {
  return {
    name: 'os.open',
    version: '1.0.0',
    description: 'Open a file, folder, URL, or application using the OS default handler.',
    inputSchema: z.object({ target: z.string().min(1) }),
    outputSchema: z.object({ opened: z.boolean() }),
    requiredPermissions: ['os.open'],
    dataClassification: 'personal',
    riskClass: 2,
    reversible: false,
    timeoutMs: 10_000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async (_ctx, input) => {
      await openTarget(input.target);
      return { opened: true };
    },
  };
}

export function createOsPlayTool(): ToolDefinition<{ target: string }, { played: boolean }> {
  return {
    name: 'os.play',
    version: '1.0.0',
    description: 'Play a media file or URL using the default media player.',
    inputSchema: z.object({ target: z.string().min(1) }),
    outputSchema: z.object({ played: z.boolean() }),
    requiredPermissions: ['os.media'],
    dataClassification: 'personal',
    riskClass: 2,
    reversible: false,
    timeoutMs: 10_000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async (_ctx, input) => {
      await playMedia(input.target);
      return { played: true };
    },
  };
}

export function createOsSpeakTool(): ToolDefinition<{ text: string; voice?: string }, { spoken: boolean }> {
  return {
    name: 'os.speak',
    version: '1.0.0',
    description: 'Speak text aloud using the OS text-to-speech engine.',
    inputSchema: z.object({ text: z.string().min(1), voice: z.string().optional() }),
    outputSchema: z.object({ spoken: z.boolean() }),
    requiredPermissions: ['os.speak'],
    dataClassification: 'personal',
    riskClass: 1,
    reversible: true,
    timeoutMs: 60_000,
    cancellable: true,
    audit: 'none',
    platforms: ['all'],
    execute: async (_ctx, input) => {
      await speakText(input.text, input.voice);
      return { spoken: true };
    },
  };
}

export function createOsCallTool(): ToolDefinition<{ number: string }, { initiated: boolean }> {
  return {
    name: 'os.call',
    version: '1.0.0',
    description: 'Initiate a phone call to a number using the default dialer.',
    inputSchema: z.object({ number: z.string().min(3) }),
    outputSchema: z.object({ initiated: z.boolean() }),
    requiredPermissions: ['os.telephony'],
    dataClassification: 'personal',
    riskClass: 3,
    reversible: false,
    requiresConfirmation: true,
    timeoutMs: 10_000,
    cancellable: true,
    audit: 'full',
    platforms: ['all'],
    execute: async (_ctx, input) => {
      await makeCall(input.number);
      return { initiated: true };
    },
  };
}

export function createOsRunTool(): ToolDefinition<{ command: string; args?: string[] }, { stdout: string; stderr: string; code: number }> {
  return {
    name: 'os.run',
    version: '1.0.0',
    description: 'Run a system command and return its output. Requires confirmation.',
    inputSchema: z.object({ command: z.string().min(1), args: z.array(z.string()).optional() }),
    outputSchema: z.object({ stdout: z.string(), stderr: z.string(), code: z.number() }),
    requiredPermissions: ['os.exec'],
    dataClassification: 'personal',
    riskClass: 3,
    reversible: false,
    requiresConfirmation: true,
    timeoutMs: 60_000,
    cancellable: true,
    audit: 'full',
    platforms: ['all'],
    execute: async (_ctx, input) => {
      return runCommand(input.command, input.args ?? []);
    },
  };
}

export function createOsControlTools(): ToolDefinition<unknown, unknown>[] {
  return [
    createOsOpenTool() as ToolDefinition<unknown, unknown>,
    createOsPlayTool() as ToolDefinition<unknown, unknown>,
    createOsSpeakTool() as ToolDefinition<unknown, unknown>,
    createOsCallTool() as ToolDefinition<unknown, unknown>,
    createOsRunTool() as ToolDefinition<unknown, unknown>,
  ];
}

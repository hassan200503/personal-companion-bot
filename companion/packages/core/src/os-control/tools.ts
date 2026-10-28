import { z } from 'zod';
import type { ToolDefinition } from '../tools/contracts.js';
import { openTarget, playMedia, speakText, makeCall, runCommand, takeScreenshot, takePhoto, recordVideo, sendWhatsAppMessage } from './windows.js';

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
      const r = await openTarget(input.target);
      return { opened: r.opened };
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
      const r = await playMedia(input.target);
      return { played: r.played };
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
      const r = await speakText(input.text, input.voice);
      return { spoken: r.spoken };
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
      const r = await makeCall(input.number);
      return { initiated: r.called };
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


export function createOsScreenshotTool(): ToolDefinition<Record<string, never>, { ok: boolean; path?: string }> {
  return {
    name: 'os.screenshot',
    version: '1.0.0',
    description: 'Capture a screenshot of the primary screen and save it to Pictures/Screenshots.',
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.boolean(), path: z.string().optional() }),
    requiredPermissions: ['os.media'],
    dataClassification: 'personal',
    riskClass: 1,
    reversible: true,
    timeoutMs: 15_000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async () => {
      return takeScreenshot();
    },
  };
}

export function createOsCameraTool(): ToolDefinition<{ mode?: 'photo' | 'video' }, { opened: boolean }> {
  return {
    name: 'os.camera',
    version: '1.0.0',
    description: 'Open the system camera app (photo or video mode).',
    inputSchema: z.object({ mode: z.enum(['photo', 'video']).optional() }),
    outputSchema: z.object({ opened: z.boolean() }),
    requiredPermissions: ['os.open'],
    dataClassification: 'personal',
    riskClass: 1,
    reversible: true,
    timeoutMs: 10_000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async () => {
      const r = await openTarget('camera');
      return { opened: r.opened };
    },
  };
}

export function createOsPhotoTool(): ToolDefinition<Record<string, never>, { ok: boolean; path?: string }> {
  return {
    name: 'os.photo',
    version: '1.0.0',
    description: 'Capture a photo using the system camera and save it to Pictures.',
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.boolean(), path: z.string().optional() }),
    requiredPermissions: ['os.media'],
    dataClassification: 'personal',
    riskClass: 1,
    reversible: true,
    timeoutMs: 20_000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async () => {
      const r = await takePhoto();
      if (!r.ok) {
        // Fallback: open camera app so user can capture manually.
        await openTarget('camera');
        return { ok: false, path: r.error };
      }
      return { ok: r.ok, path: r.path };
    },
  };
}

export function createOsVideoTool(): ToolDefinition<{ seconds?: number }, { ok: boolean; path?: string }> {
  return {
    name: 'os.video',
    version: '1.0.0',
    description: 'Record a short video (default 5 seconds) using the system camera and save it to Videos.',
    inputSchema: z.object({ seconds: z.number().int().positive().optional() }),
    outputSchema: z.object({ ok: z.boolean(), path: z.string().optional() }),
    requiredPermissions: ['os.media'],
    dataClassification: 'personal',
    riskClass: 1,
    reversible: true,
    timeoutMs: 30_000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async (_ctx, input) => {
      const r = await recordVideo(input?.seconds ?? 5);
      return { ok: r.ok, path: r.path ?? r.error };
    },
  };
}

export function createOsWhatsAppTool(): ToolDefinition<{ contact: string; message: string }, { sent: boolean }> {
  return {
    name: 'os.whatsappSend',
    version: '1.0.0',
    description: 'Send a WhatsApp message to a contact (phone number or name).',
    inputSchema: z.object({ contact: z.string().min(1), message: z.string().min(1) }),
    outputSchema: z.object({ sent: z.boolean() }),
    requiredPermissions: ['os.open'],
    dataClassification: 'personal',
    riskClass: 2,
    reversible: false,
    timeoutMs: 15_000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async (_ctx, input) => {
      const r = await sendWhatsAppMessage(input.contact, input.message);
      return { sent: r.sent };
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
    createOsScreenshotTool() as ToolDefinition<unknown, unknown>,
    createOsCameraTool() as ToolDefinition<unknown, unknown>,
    createOsPhotoTool() as ToolDefinition<unknown, unknown>,
    createOsVideoTool() as ToolDefinition<unknown, unknown>,
    createOsWhatsAppTool() as ToolDefinition<unknown, unknown>,
  ];
}

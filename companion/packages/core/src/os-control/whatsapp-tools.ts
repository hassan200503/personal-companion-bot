/**
 * WhatsApp Tools
 *
 * Tools for WhatsApp Desktop automation including:
 * - Contact search
 * - Voice/Video calling
 * - Message sending (existing)
 */

import { z } from 'zod';
import type { ToolExecutionContext } from '../tools/contracts.js';
import { WhatsAppAdapter } from './automation/adapters/whatsapp-adapter.js';

export const whatsappCallInputSchema = z.object({
  contact: z.string().describe('Contact name to call'),
  type: z.enum(['voice', 'video']).default('voice').describe('Call type: voice or video'),
});

export const whatsappCallOutputSchema = z.object({
  success: z.boolean(),
  status: z.enum(['ringing', 'connected', 'failed', 'timeout', 'rejected']),
  contact: z.string(),
  type: z.enum(['voice', 'video']),
  elapsedMs: z.number(),
  error: z.string().optional(),
});

export async function whatsappCallTool(
  _ctx: ToolExecutionContext,
  input: z.infer<typeof whatsappCallInputSchema>
): Promise<z.infer<typeof whatsappCallOutputSchema>> {
  const adapter = new WhatsAppAdapter();

  try {
    // Connect to WhatsApp
    const connectResult = await adapter.connect();
    if (!connectResult.connected) {
      return {
        success: false,
        status: 'failed',
        contact: input.contact,
        type: input.type,
        elapsedMs: 0,
        error: connectResult.error || 'Failed to connect to WhatsApp',
      };
    }

    // Search for contact
    const searchResult = await adapter.searchContact(input.contact);
    if (!searchResult.success) {
      return {
        success: false,
        status: 'failed',
        contact: input.contact,
        type: input.type,
        elapsedMs: 0,
        error: searchResult.error || 'Contact not found',
      };
    }

    // Initiate call
    const callResult = await adapter.initiateCall(
      searchResult.contact!.name,
      input.type
    );

    return {
      success: callResult.success,
      status: callResult.status,
      contact: searchResult.contact!.name,
      type: input.type,
      elapsedMs: callResult.elapsedMs,
      error: callResult.error,
    };
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      contact: input.contact,
      type: input.type,
      elapsedMs: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const whatsappCallToolDefinition = {
  name: 'whatsapp.call',
  version: '1.0.0',
  description: 'Initiate a voice or video call to a WhatsApp contact by name',
  inputSchema: whatsappCallInputSchema,
  outputSchema: whatsappCallOutputSchema,
  execute: whatsappCallTool,
  riskClass: 3 as const, // Requires confirmation per policy
  requiredPermissions: ['whatsapp.call'] as const,
  dataClassification: 'personal' as const,
  reversible: false as const,
  requiresConfirmation: true as const,
  timeoutMs: 15000,
  cancellable: true as const,
  platforms: ['windows'] as const,
  postcondition: async (_ctx: ToolExecutionContext, _input: unknown, result: unknown) => {
    const output = whatsappCallOutputSchema.parse(result);
    // Call is successful if status is ringing or connected
    return output.success && (output.status === 'ringing' || output.status === 'connected');
  },
  audit: {
    category: 'whatsapp',
    sensitivity: 'medium',
  },
};

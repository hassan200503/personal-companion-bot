import type { IntentSource } from './contracts.js';

/** Content that may be inspected as data, but can never establish owner intent. */
export type ExternalContentKind =
  | 'web'
  | 'email'
  | 'file'
  | 'screen'
  | 'filename'
  | 'notification'
  | 'audio';

export interface UntrustedContent {
  kind: ExternalContentKind;
  text: string;
  reference?: string;
}

export interface RoutedContent extends UntrustedContent {
  source: Extract<IntentSource, 'untrusted_content'>;
}

/** The only supported route for text originating outside an owner command. */
export function routeExternalContent(content: UntrustedContent): RoutedContent {
  return { ...content, source: 'untrusted_content' };
}

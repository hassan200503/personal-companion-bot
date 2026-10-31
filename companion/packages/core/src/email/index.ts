export {
  ImapClient,
  ImapError,
  listRecentMessages,
  fetchOneMessage,
  assertEmailConfig,
} from './imap-client.js';
export type {
  EmailConfig,
  EmailAddress,
  EmailMessage,
  EmailMessageMeta,
} from './imap-client.js';

export {
  IMPORTANCE_KEYWORDS,
  scoreMessage,
  rankMessages,
  pickImportant,
  summarizeMessages,
  speakableDigest,
  speakableMessage,
} from './importance.js';
export type { RankableMessage, RankedMessage } from './importance.js';

export {
  EMAIL_SETTINGS_KEY,
  EMAIL_KEYTAR_ACCOUNT,
  EMAIL_KEYTAR_SERVICE,
  normalizeEmailAccountInput,
  publicEmailAccount,
  loadEmailConfig,
  saveEmailPassword,
  clearEmailPassword,
  emailSettingsBlob,
} from './credentials.js';
export type { EmailAccountPublic, EmailAccountInput } from './credentials.js';

export {
  createEmailTools,
  createEmailListRecentTool,
  createEmailSummarizeTool,
  createEmailImportantTool,
  createEmailReadAloudTool,
  createEmailSendTool,
} from './tools.js';
export type { EmailConfigResolver } from './tools.js';

export { SmtpClient, deriveSmtpHost } from './smtp-client.js';
export type { SmtpSendInput, SmtpSendResult } from './smtp-client.js';

export {
  MockEmailReader,
  EmailAnalyzer,
} from './gmail.js';
export type {
  GmailMessage,
  GmailConfig,
  GmailReader,
} from './gmail.js';

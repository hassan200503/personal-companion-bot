# Secure Setup Guide

This guide explains how to securely configure credentials for the Windows AI Companion. All credentials are stored using Windows Credential Manager or encrypted local storage - never in source code or plain text files.

## 🔒 Security Principles

1. **Never hardcode credentials** in source code, environment files, or configuration files
2. **Use Windows Credential Manager** for storing sensitive data (API keys, passwords, tokens)
3. **Validate credentials** before attempting connections
4. **Use sandbox mode** for testing before switching to production
5. **Rotate credentials** periodically if compromised

## 📧 Email Configuration (IMAP)

### Gmail Setup

1. **Enable 2-Factor Authentication** on your Google Account
2. **Generate an App Password**:
   - Go to Google Account > Security > 2-Step Verification
   - Select "App passwords"
   - Create a new app password for "Companion"
   - Copy the 16-character password

3. **Configure in Companion**:
   - Open Companion
   - Go to Settings > Email
   - Enter:
     - Host: `imap.gmail.com`
     - Port: `993`
     - User: Your Gmail address
     - App Password: The 16-character password from step 2
     - TLS: Enabled
   - Click "Save"
   - Click "Test connection" to verify

### Security Notes

- The app password is stored in Windows Credential Manager
- Companion never invents inbox contents when disconnected
- TLS is required for secure IMAP connections
- Gmail app passwords can be revoked from Google Account settings

## 💳 PayPal Wallet Configuration

### PayPal Developer Setup

1. **Create PayPal Developer Account**:
   - Go to https://developer.paypal.com
   - Sign in with your PayPal account
   - Navigate to "My Apps & Credentials"

2. **Create a New App**:
   - Click "Create App"
   - App name: "Companion AI"
   - Select "Sandbox" for testing
   - Note your Client ID and Client Secret

3. **Configure in Companion**:
   - Open Companion
   - Go to Settings > Payments
   - Enter:
     - Client ID: From PayPal Developer Portal
     - Client Secret: From PayPal Developer Portal
     - Mode: Sandbox (for testing)
     - Wallet Email: `tech03082005082005@gmail.com` (your PayPal email)
   - Click "Save"
   - Click "Test connection" to verify

### Production Setup

1. **Switch to Live Mode**:
   - In PayPal Developer Portal, create a live app
   - Copy the live Client ID and Client Secret
   - In Companion Settings > Payments:
     - Change Mode to "Live"
     - Enter live credentials
     - Save and test

### Security Notes

- Credentials are stored in Windows Credential Manager
- Client Secret is never displayed after saving
- Use Sandbox mode for all development and testing
- Live mode requires explicit Client Secret
- Monitor PayPal account for unauthorized transactions

## 🔐 Gmail API / OAuth Setup (Optional)

For advanced email features (read-aloud, importance analysis):

1. **Create Google Cloud Project**:
   - Go to https://console.cloud.google.com
   - Create a new project
   - Enable Gmail API

2. **Configure OAuth Consent Screen**:
   - Go to APIs & Services > OAuth consent screen
   - Select "External" user type
   - Add required scopes: `https://www.googleapis.com/auth/gmail.readonly`

3. **Create OAuth Credentials**:
   - Go to APIs & Services > Credentials
   - Create OAuth 2.0 Client ID
   - Application type: Desktop application
   - Download the credentials JSON

4. **Configure in Companion**:
   - Open Companion
   - Go to Settings > Email
   - Follow the OAuth flow when prompted
   - Grant permissions to Companion

### Security Notes

- OAuth tokens are stored in Windows Credential Manager
- Tokens are automatically refreshed when expired
- Read-only scope ensures Companion cannot send emails
- You can revoke access from Google Account settings

## 📱 WhatsApp Integration

### WhatsApp Web Setup

1. **Open WhatsApp Web**:
   - Go to https://web.whatsapp.com
   - Link your phone by scanning QR code

2. **Grant Permissions in Companion**:
   - Open Companion
   - Go to Settings > Privacy
   - Grant "WhatsApp messaging" permission
   - Grant "WhatsApp calling" permission (optional)

### Security Notes

- WhatsApp Web must be open on your PC
- Companion uses UI Automation to interact with WhatsApp
- Phone must be connected to the internet
- WhatsApp actions require confirmation for Class 3 risks

## 🔍 Credential Validation

Companion validates all credentials before attempting connections:

### Email Validation
- Hostname format check
- Port range validation (1-65535)
- Email format validation
- TLS security warnings

### PayPal Validation
- Client ID length check
- Client Secret requirement for live mode
- Email format validation
- Mode-specific warnings

### OAuth Token Validation
- Token length check
- Whitespace detection
- Format validation

## 🚨 Troubleshooting

### Email Connection Fails
- Verify app password is correct
- Check Gmail 2FA is enabled
- Ensure IMAP is enabled in Gmail settings
- Try testing with TLS disabled (not recommended for production)

### PayPal Connection Fails
- Verify Client ID and Secret are correct
- Ensure Sandbox mode is enabled for testing
- Check PayPal Developer Portal for app status
- Verify wallet email matches PayPal account

### OAuth Fails
- Ensure OAuth consent screen is configured
- Verify redirect URIs match
- Check that Gmail API is enabled
- Try revoking and re-authorizing

## 📋 Security Checklist

Before using Companion in production:

- [ ] All credentials stored in Windows Credential Manager
- [ ] No credentials in source code or config files
- [ ] 2FA enabled on all accounts
- [ ] TLS enabled for all connections
- [ ] Sandbox mode tested before live mode
- [ ] OAuth scopes are read-only where possible
- [ ] Regular credential rotation scheduled
- [ ] Account monitoring enabled

## 🔄 Credential Rotation

To rotate credentials:

1. **Generate new credentials** (app password, API keys, tokens)
2. **Update in Companion Settings**
3. **Test connection**
4. **Revoke old credentials** from provider settings
5. **Verify old credentials no longer work**

## 📞 Support

For security issues or credential problems:
- Check the logs in Companion Settings > Data
- Review credential validation errors
- Consult provider documentation
- Revoke access immediately if compromise suspected

---

**Remember**: Never share your credentials, and always use secure storage mechanisms. Companion is designed to handle credentials securely - let it do its job.

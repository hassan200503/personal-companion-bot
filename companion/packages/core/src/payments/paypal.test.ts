import { describe, expect, it } from 'vitest';
import { PayPalWalletService, DEFAULT_PAYPAL_CONFIG } from './paypal.js';

describe('PayPalWalletService', () => {
  it('connects wallet with email', async () => {
    const service = new PayPalWalletService();
    const wallet = await service.connectWallet('test@example.com');
    
    expect(wallet).toBeTruthy();
    expect(wallet.email).toBe('test@example.com');
    expect(wallet.connected).toBe(true);
  });

  it('disconnects wallet', async () => {
    const service = new PayPalWalletService();
    await service.connectWallet('test@example.com');
    await service.disconnectWallet();
    
    // After disconnect, getBalance should throw
    await expect(service.getBalance()).rejects.toThrow('Wallet not initialized');
  });

  it('throws error when getting balance without wallet', async () => {
    const service = new PayPalWalletService();
    
    await expect(service.getBalance()).rejects.toThrow('Wallet not initialized');
  });

  it('creates transaction with pending status', async () => {
    const service = new PayPalWalletService();
    // Initialize with config first
    await service.initialize({
      clientId: 'test_client',
      clientSecret: 'test_secret',
      mode: 'sandbox',
      email: 'test@example.com',
    });
    
    const transaction = await service.createTransaction(100, 'Test payment');
    
    expect(transaction).toBeTruthy();
    expect(transaction.amount).toBe(100);
    expect(transaction.status).toBe('pending');
  });

  it('throws error when creating transaction without config', async () => {
    const service = new PayPalWalletService();
    
    await expect(service.createTransaction(100, 'Test')).rejects.toThrow('PayPal not configured');
  });

  it('has default config with owner email', () => {
    expect(DEFAULT_PAYPAL_CONFIG.email).toBe('tech03082005082005@gmail.com');
    expect(DEFAULT_PAYPAL_CONFIG.mode).toBe('sandbox');
  });
});

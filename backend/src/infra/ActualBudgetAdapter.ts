import api from '@actual-app/api';
import { ActualBudgetError } from '../domain/errors.js';
import { logger } from './logger.js';
import type { Env } from './env.js';
import type { Transaction, Category } from '../domain/entities/BudgetSnapshot.js';

/**
 * Payee with a known category from historical transactions
 * Used for fuzzy matching to suggest categories
 */
export interface CategorizedPayee {
  payeeId: string;
  payeeName: string;
  categoryId: string;
  categoryName: string;
  transactionCount: number;
}

/**
 * Actual Budget API adapter following P5 (separation of concerns)
 * Wraps @actual-app/api with explicit error handling (P7)
 */
export class ActualBudgetAdapter {
  private env: Env;
  private initialized = false;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Initialize connection to Actual Budget server
   * P7 (Explicit error handling): Fail-fast if connection fails
   */
  async initialize(): Promise<void> {
    try {
      await api.init({
        dataDir: this.env.DATA_DIR,
        serverURL: this.env.ACTUAL_SERVER_URL,
        password: this.env.ACTUAL_PASSWORD,
      });

      // Use sync ID if provided, otherwise use budget ID
      const budgetIdentifier = this.env.ACTUAL_SYNC_ID || this.env.ACTUAL_BUDGET_ID;
      
      await api.downloadBudget(budgetIdentifier, {
        password: this.env.ACTUAL_ENCRYPTION_KEY,
      });

      this.initialized = true;
      logger.info('Actual Budget API initialized', {
        budgetId: budgetIdentifier,
      });
    } catch (error) {
      logger.error('Actual Budget initialization failed', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new ActualBudgetError('Failed to initialize Actual Budget API', { error });
    }
  }

  /**
   * Get all transactions from the budget
   * P4 (Explicitness): Returns strongly-typed Transaction array
   */
  async getTransactions(): Promise<Transaction[]> {
    this.ensureInitialized();

    try {
      const [accounts, payees, categories] = await Promise.all([
        api.getAccounts(),
        api.getPayees(),
        api.getCategories(),
      ]);

      const allTransactions: Transaction[] = [];

      for (const account of accounts) {
        if (account.closed || account.offbudget) {
          continue; // Skip closed and off-budget accounts
        }

        const accountTransactions = await api.getTransactions(
          account.id,
          '1970-01-01',
          new Date().toISOString().split('T')[0]
        );

        for (const txn of accountTransactions) {
          const payee = txn.payee ? payees.find((p: any) => p.id === txn.payee) : null;
          const category = txn.category ? categories.find((c: any) => c.id === txn.category) : null;

          allTransactions.push({
            id: txn.id,
            accountId: account.id,
            accountName: account.name || null,
            date: txn.date,
            payeeId: txn.payee || null,
            payeeName: payee?.name || null,
            notes: txn.notes || null,
            categoryId: txn.category || null,
            categoryName: category?.name || null,
            amount: txn.amount,
            cleared: txn.cleared || false,
            isTransfer: Boolean((txn as any).transfer_id),
          });
        }
      }

      logger.info('Retrieved transactions', { count: allTransactions.length });
      return allTransactions;
    } catch (error) {
      throw new ActualBudgetError('Failed to fetch transactions', { error });
    }
  }

  /**
   * Get all categories from the budget
   * P4 (Explicitness): Returns strongly-typed Category array
   */
  async getCategories(): Promise<Category[]> {
    this.ensureInitialized();

    try {
      const rawCategories = await api.getCategories();
      const categoryGroups = await api.getCategoryGroups();

      const categories: Category[] = rawCategories
        .filter((cat: any) => !cat.hidden && cat.id && cat.name) // Filter out groups
        .map((cat: any) => {
          const group = categoryGroups.find((g: any) => g.id === cat.group_id);
          return {
            id: cat.id,
            name: cat.name,
            groupId: cat.group_id || 'unknown',
            groupName: group?.name || 'Unknown',
            isIncome: group?.is_income || false,
            hidden: cat.hidden || false,
          };
        });

      logger.info('Retrieved categories', { count: categories.length });
      return categories;
    } catch (error) {
      throw new ActualBudgetError('Failed to fetch categories', { error });
    }
  }

  /**
   * Update transaction category
   * P7 (Explicit error handling): Wraps API call with error context
   */
  async updateTransactionCategory(
    transactionId: string,
    categoryId: string | null
  ): Promise<void> {
    this.ensureInitialized();

    try {
      await api.updateTransaction(transactionId, {
        category: categoryId || undefined,
      });

      logger.info('Updated transaction category', {
        transactionId,
        categoryId,
      });
    } catch (error) {
      throw new ActualBudgetError('Failed to update transaction category', {
        transactionId,
        categoryId,
        error,
      });
    }
  }

  /**
   * Update transaction payee
   */
  async updateTransactionPayee(
    transactionId: string,
    payeeId: string | null
  ): Promise<void> {
    this.ensureInitialized();

    try {
      await api.updateTransaction(transactionId, {
        payee: payeeId || undefined,
      });

      logger.info('Updated transaction payee', {
        transactionId,
        payeeId,
      });
    } catch (error) {
      throw new ActualBudgetError('Failed to update transaction payee', {
        transactionId,
        payeeId,
        error,
      });
    }
  }

  /**
   * Update transaction with multiple fields (category and/or payee)
   */
  async updateTransaction(
    transactionId: string,
    updates: { categoryId?: string | null; payeeId?: string | null }
  ): Promise<void> {
    this.ensureInitialized();

    try {
      const updatePayload: Record<string, unknown> = {};
      
      if (updates.categoryId !== undefined) {
        updatePayload.category = updates.categoryId || undefined;
      }
      if (updates.payeeId !== undefined) {
        updatePayload.payee = updates.payeeId || undefined;
      }

      if (Object.keys(updatePayload).length === 0) {
        return; // Nothing to update
      }

      await api.updateTransaction(transactionId, updatePayload);

      logger.info('Updated transaction', {
        transactionId,
        updates,
      });
    } catch (error) {
      throw new ActualBudgetError('Failed to update transaction', {
        transactionId,
        updates,
        error,
      });
    }
  }

  /**
   * Get all payees from the budget
   */
  async getPayees(): Promise<{ id: string; name: string }[]> {
    this.ensureInitialized();

    try {
      const payees = await api.getPayees();
      return payees
        .filter((p: any) => p.id && p.name)
        .map((p: any) => ({ id: p.id, name: p.name }));
    } catch (error) {
      throw new ActualBudgetError('Failed to fetch payees', { error });
    }
  }

  /**
   * Find a payee by name (case-insensitive)
   */
  async findPayeeByName(name: string): Promise<{ id: string; name: string } | null> {
    const payees = await this.getPayees();
    const normalizedName = name.toLowerCase().trim();
    return payees.find(p => p.name.toLowerCase().trim() === normalizedName) || null;
  }

  /**
   * Create a new payee
   */
  async createPayee(name: string): Promise<string> {
    this.ensureInitialized();

    try {
      const payeeId = await api.createPayee({ name });
      logger.info('Created new payee', { payeeId, name });
      return payeeId;
    } catch (error) {
      throw new ActualBudgetError('Failed to create payee', { name, error });
    }
  }

  /**
   * Find or create a payee by name
   */
  async findOrCreatePayee(name: string): Promise<string> {
    const existing = await this.findPayeeByName(name);
    if (existing) {
      return existing.id;
    }
    return this.createPayee(name);
  }

  /**
   * Sync changes with server (bi-directional: push local changes, pull remote changes)
   */
  async sync(): Promise<void> {
    this.ensureInitialized();

    try {
      logger.info('Starting Actual Budget sync...');
      await api.sync();
      logger.info('Actual Budget sync completed successfully');
    } catch (error) {
      logger.error('Actual Budget sync failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ActualBudgetError('Failed to sync changes', { error });
    }
  }

  /**
   * List available budgets from the Actual Budget server
   * P4 (Explicitness): Returns array of budget metadata
   */
  async listBudgets(): Promise<{ id: string; name: string }[]> {
    try {
      // Temporarily initialize to fetch budgets list
      await api.init({
        dataDir: this.env.DATA_DIR,
        serverURL: this.env.ACTUAL_SERVER_URL,
        password: this.env.ACTUAL_PASSWORD,
      });

      const budgets = await api.getBudgets();
      logger.info('Retrieved budget list', { count: budgets.length });

      const result = budgets
        .filter((b) => b.id !== undefined && b.name !== undefined)
        .map((b) => ({
          id: b.id!,
          name: b.name!,
        }));

      // Shutdown after listing if not already initialized with a specific budget
      if (!this.initialized) {
        await api.shutdown();
      }

      return result;
    } catch (error) {
      logger.error('Failed to list budgets', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ActualBudgetError('Failed to list budgets', { error });
    }
  }

  /**
   * Get payees that have at least one categorized non-transfer transaction
   * Used for fuzzy matching - only match against payees with known categories
   */
  async getCategorizedPayees(): Promise<CategorizedPayee[]> {
    this.ensureInitialized();

    try {
      const [accounts, payees, categories] = await Promise.all([
        api.getAccounts(),
        api.getPayees(),
        api.getCategories(),
      ]);

      // Track payee -> category mappings with counts
      const payeeCategoryMap = new Map<string, {
        payeeId: string;
        payeeName: string;
        categoryId: string;
        categoryName: string;
        transactionCount: number;
      }>();

      for (const account of accounts) {
        if (account.closed || account.offbudget) continue;

        const accountTransactions = await api.getTransactions(
          account.id,
          '1970-01-01',
          new Date().toISOString().split('T')[0]
        );

        for (const txn of accountTransactions) {
          // Skip transfers and uncategorized
          if ((txn as any).transfer_id || !txn.category || !txn.payee) continue;

          const payee = payees.find((p: any) => p.id === txn.payee);
          const category = categories.find((c: any) => c.id === txn.category);
          if (!payee?.name || !category?.name) continue;

          const key = `${payee.id}|${txn.category}`;
          const existing = payeeCategoryMap.get(key);
          if (existing) {
            existing.transactionCount++;
          } else {
            payeeCategoryMap.set(key, {
              payeeId: payee.id,
              payeeName: payee.name,
              categoryId: txn.category,
              categoryName: category.name,
              transactionCount: 1,
            });
          }
        }
      }

      // Convert to array, picking the most common category for each payee
      const payeeMap = new Map<string, CategorizedPayee>();
      for (const entry of payeeCategoryMap.values()) {
        const existing = payeeMap.get(entry.payeeId);
        if (!existing || entry.transactionCount > existing.transactionCount) {
          payeeMap.set(entry.payeeId, {
            payeeId: entry.payeeId,
            payeeName: entry.payeeName,
            categoryId: entry.categoryId,
            categoryName: entry.categoryName,
            transactionCount: entry.transactionCount,
          });
        }
      }

      const result = Array.from(payeeMap.values());
      logger.info('Retrieved categorized payees', { count: result.length });
      return result;
    } catch (error) {
      throw new ActualBudgetError('Failed to fetch categorized payees', { error });
    }
  }

  /**
   * Shutdown API connection
   */
  async shutdown(): Promise<void> {
    if (this.initialized) {
      await api.shutdown();
      this.initialized = false;
      logger.info('Actual Budget API shut down');
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new ActualBudgetError('Actual Budget API not initialized');
    }
  }
}

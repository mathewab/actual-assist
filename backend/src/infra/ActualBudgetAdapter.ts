import api from '@actual-app/api';
import { ActualBudgetError } from '../domain/errors.js';
import { logger } from './logger.js';
import type { Env } from './env.js';
import type { Transaction, Category } from '../domain/entities/BudgetSnapshot.js';

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
      const accounts = await api.getAccounts();
      const allTransactions: Transaction[] = [];

      for (const account of accounts) {
        if (account.closed || account.offbudget) {
          continue; // Skip closed and off-budget accounts
        }

        const accountTransactions = await api.getTransactions(account.id, '1970-01-01', new Date().toISOString().split('T')[0]);

        for (const txn of accountTransactions) {
          // Get payee name if payee_id exists
          let payeeName: string | null = null;
          if (txn.payee) {
            const payee = await api.getPayees().then(payees =>
              payees.find(p => p.id === txn.payee)
            );
            payeeName = payee?.name || null;
          }

          // Get category name if category exists
          let categoryName: string | null = null;
          if (txn.category) {
            const categories = await api.getCategories();
            const category = categories.find(c => c.id === txn.category);
            categoryName = category?.name || null;
          }

          allTransactions.push({
            id: txn.id,
            accountId: account.id,
            date: txn.date,
            payeeId: txn.payee || null,
            payeeName,
            notes: txn.notes || null,
            categoryId: txn.category || null,
            categoryName,
            amount: txn.amount,
            cleared: txn.cleared || false,
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
   * Sync changes back to server
   */
  async sync(): Promise<void> {
    this.ensureInitialized();

    try {
      await api.sync();
      logger.info('Synced changes to Actual Budget server');
    } catch (error) {
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
   * Shutdown API connection
   */
  async shutdown(): Promise<void> {
    if (this.initialized) {
      await api.shutdown();
      this.initialized = false;
      logger.info('Actual Budget API shut down');
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new ActualBudgetError('Actual Budget API not initialized');
    }
  }
}

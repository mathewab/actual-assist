import api from '@actual-app/api';
import { SerialQueue } from './SerialQueue.js';
import { ActualBudgetError } from '../domain/errors.js';
import { logger } from './logger.js';
import type { Env } from './env.js';
import type { Transaction, Category } from '../domain/entities/BudgetSnapshot.js';
import type { Template } from '@actual-app/core/types/models/templates';

type ActualAccount = {
  id: string;
  name?: string | null;
  closed?: boolean;
  offbudget?: boolean;
};

type ActualPayee = {
  id: string;
  name?: string | null;
  transfer_acct?: string | null;
};

type ActualCategory = {
  id: string;
  name?: string | null;
  hidden?: boolean;
  group_id?: string | null;
};

type ActualCategoryGroup = {
  id: string;
  name?: string | null;
  is_income?: boolean;
};

type ActualCategoryRow = {
  id: string;
  name?: string | null;
  group_id?: string | null;
  goal_def?: string | null;
  template_settings?: unknown;
  hidden?: boolean;
};

type ActualCategoryGroupRow = {
  id: string;
  name?: string | null;
};

type ActualTransaction = {
  id: string;
  date: string;
  payee?: string | null;
  category?: string | null;
  notes?: string | null;
  amount: number;
  cleared?: boolean;
  transfer_id?: string | null;
};

type ActualSchedule = {
  id: string;
  name?: string | null;
  tombstone?: boolean;
};

function isVisibleNamedCategory(cat: ActualCategory): cat is ActualCategory & { name: string } {
  return !cat.hidden && Boolean(cat.id) && typeof cat.name === 'string';
}

function isNamedPayee(payee: ActualPayee): payee is ActualPayee & { name: string } {
  return typeof payee.name === 'string';
}

type TemplateRecord = Record<string, unknown>;

type AqlResult<T> = { data: T[] };

export interface CategoryTemplateSummary {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  templates: TemplateRecord[];
  renderedNote: string;
  note: string | null;
  source: string | null;
  parseError: string | null;
}

function parseTemplateSettingsSource(settings: unknown): string | null {
  if (!settings) {
    return null;
  }

  if (typeof settings === 'string') {
    try {
      const parsed = JSON.parse(settings);
      if (parsed && typeof parsed === 'object' && 'source' in parsed) {
        const source = (parsed as { source?: unknown }).source;
        return typeof source === 'string' ? source : null;
      }
    } catch {
      return null;
    }
  }

  if (typeof settings === 'object' && settings !== null && 'source' in settings) {
    const source = (settings as { source?: unknown }).source;
    return typeof source === 'string' ? source : null;
  }

  return null;
}

function parseGoalDef(goalDef: unknown): {
  templates: TemplateRecord[];
  parseError: string | null;
} {
  if (!goalDef) {
    return { templates: [], parseError: null };
  }

  if (Array.isArray(goalDef)) {
    return { templates: goalDef as TemplateRecord[], parseError: null };
  }

  if (typeof goalDef === 'string') {
    try {
      const parsed = JSON.parse(goalDef);
      if (Array.isArray(parsed)) {
        return { templates: parsed as TemplateRecord[], parseError: null };
      }
      return { templates: [], parseError: 'goal_def is not an array' };
    } catch {
      return { templates: [], parseError: 'Failed to parse goal_def JSON' };
    }
  }

  return { templates: [], parseError: 'Unsupported goal_def format' };
}

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
  private session = new SerialQueue();

  async initialize(): Promise<void> {
    return this.session.run(() => this.initializeWithinSession());
  }

  async getTransactions(): Promise<Transaction[]> {
    return this.session.run(() => this.getTransactionsWithinSession());
  }

  async getCategories(): Promise<Category[]> {
    return this.session.run(() => this.getCategoriesWithinSession());
  }

  async listCategoryTemplates(): Promise<CategoryTemplateSummary[]> {
    return this.session.run(() => this.listCategoryTemplatesWithinSession());
  }

  async renderNoteTemplates(templates: TemplateRecord[]): Promise<string> {
    return this.session.run(() => this.renderNoteTemplatesWithinSession(templates));
  }

  async getCategoryNote(categoryId: string): Promise<string | null> {
    return this.session.run(() => this.getCategoryNoteWithinSession(categoryId));
  }

  async updateCategoryNote(categoryId: string, note: string | null): Promise<void> {
    return this.session.run(() => this.updateCategoryNoteWithinSession(categoryId, note));
  }

  async checkTemplates(): Promise<{ message: string; pre?: string | null }> {
    return this.session.run(() => this.checkTemplatesWithinSession());
  }

  async updateTransactionCategory(transactionId: string, categoryId: string | null): Promise<void> {
    return this.session.run(() =>
      this.updateTransactionCategoryWithinSession(transactionId, categoryId)
    );
  }

  async updateTransactionPayee(transactionId: string, payeeId: string | null): Promise<void> {
    return this.session.run(() => this.updateTransactionPayeeWithinSession(transactionId, payeeId));
  }

  async updateTransaction(
    transactionId: string,
    updates: { categoryId?: string | null; payeeId?: string | null }
  ): Promise<void> {
    return this.session.run(() => this.updateTransactionWithinSession(transactionId, updates));
  }

  async getPayees(): Promise<{ id: string; name: string }[]> {
    return this.session.run(() => this.getPayeesWithinSession());
  }

  async getSchedules(): Promise<{ id: string; name: string }[]> {
    return this.session.run(() => this.getSchedulesWithinSession());
  }

  async findPayeeByName(name: string): Promise<{ id: string; name: string } | null> {
    return this.session.run(() => this.findPayeeByNameWithinSession(name));
  }

  async createPayee(name: string): Promise<string> {
    return this.session.run(() => this.createPayeeWithinSession(name));
  }

  async mergePayees(targetPayeeId: string, mergePayeeIds: string[]): Promise<void> {
    return this.session.run(() => this.mergePayeesWithinSession(targetPayeeId, mergePayeeIds));
  }

  async findOrCreatePayee(name: string): Promise<string> {
    return this.session.run(() => this.findOrCreatePayeeWithinSession(name));
  }

  async sync(): Promise<void> {
    return this.session.run(() => this.syncWithinSession());
  }

  async listBudgets(): Promise<{ id: string; name: string }[]> {
    return this.session.run(() => this.listBudgetsWithinSession());
  }

  async getCategorizedPayees(): Promise<CategorizedPayee[]> {
    return this.session.run(() => this.getCategorizedPayeesWithinSession());
  }

  async shutdown(): Promise<void> {
    return this.session.close(() => this.shutdownWithinSession());
  }

  constructor(env: Env) {
    this.env = env;
  }

  getAccounts(): Promise<ActualAccount[]> {
    return this.session.run(async () => {
      this.ensureInitialized();
      return api.getAccounts() as Promise<ActualAccount[]>;
    });
  }

  getAccountTransactions(
    accountId: string,
    startDate: string,
    endDate: string
  ): Promise<ActualTransaction[]> {
    return this.session.run(async () => {
      this.ensureInitialized();
      return api.getTransactions(accountId, startDate, endDate) as Promise<ActualTransaction[]>;
    });
  }

  /**
   * Initialize connection to Actual Budget server
   * P7 (Explicit error handling): Fail-fast if connection fails
   */
  private async initializeWithinSession(): Promise<void> {
    if (this.initialized) return;
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
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new ActualBudgetError('Failed to initialize Actual Budget API', { error });
    }
  }

  /**
   * Get all transactions from the budget
   * P4 (Explicitness): Returns strongly-typed Transaction array
   */
  private async getTransactionsWithinSession(): Promise<Transaction[]> {
    this.ensureInitialized();

    try {
      const [accounts, payees, categories] = await Promise.all([
        api.getAccounts() as Promise<ActualAccount[]>,
        api.getPayees() as Promise<ActualPayee[]>,
        api.getCategories() as Promise<ActualCategory[]>,
      ]);

      const allTransactions: Transaction[] = [];

      for (const account of accounts) {
        if (account.closed || account.offbudget) {
          continue; // Skip closed and off-budget accounts
        }

        const accountTransactions = (await api.getTransactions(
          account.id,
          '1970-01-01',
          new Date().toISOString().split('T')[0]
        )) as ActualTransaction[];

        for (const txn of accountTransactions) {
          const payee = txn.payee ? payees.find((p) => p.id === txn.payee) : null;
          const category = txn.category ? categories.find((c) => c.id === txn.category) : null;

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
            isTransfer: Boolean(txn.transfer_id),
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
  private async getCategoriesWithinSession(): Promise<Category[]> {
    this.ensureInitialized();

    try {
      const rawCategories = (await api.getCategories()) as ActualCategory[];
      const categoryGroups = (await api.getCategoryGroups()) as ActualCategoryGroup[];

      const categories: Category[] = rawCategories
        .filter(isVisibleNamedCategory) // Filter out groups
        .map((cat) => {
          const group = categoryGroups.find((g) => g.id === cat.group_id);
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
   * List categories with template data and notes
   */
  private async listCategoryTemplatesWithinSession(): Promise<CategoryTemplateSummary[]> {
    this.ensureInitialized();

    if (!api.internal?.send || !api.q || !api.aqlQuery) {
      throw new ActualBudgetError('Actual Budget internal API unavailable');
    }

    try {
      await api.internal.send('budget/store-note-templates');

      const [categoryResult, groupResult] = await Promise.all([
        api.aqlQuery(api.q('categories').select(['*'])),
        api.aqlQuery(api.q('category_groups').select(['*'])),
      ]);

      const categories = (categoryResult as AqlResult<ActualCategoryRow>).data.filter(
        (category) => !category.hidden && category.name
      );
      const categoryGroups = (groupResult as AqlResult<ActualCategoryGroupRow>).data;
      const categoryIds = categories.map((category) => category.id);
      const notesResult = categoryIds.length
        ? ((await api.aqlQuery(
            api
              .q('notes')
              .filter({ id: { $oneof: categoryIds } })
              .select(['*'])
          )) as AqlResult<{ id: string; note?: string | null }>)
        : { data: [] as Array<{ id: string; note?: string | null }> };
      const notesMap = new Map<string, string | null>(
        notesResult.data.map((note) => [note.id, note.note ?? null])
      );
      const groupMap = new Map(categoryGroups.map((group) => [group.id, group.name || 'Unknown']));
      const categoryGroupNameMap = new Map<string, string>();
      try {
        const categorized = await this.getCategoriesWithinSession();
        categorized.forEach((category) => {
          categoryGroupNameMap.set(category.id, category.groupName || 'Unknown');
        });
      } catch {
        // Fallback to group map when category lookup fails
      }

      const templateSummaries: CategoryTemplateSummary[] = [];

      for (const category of categories) {
        const { templates, parseError } = parseGoalDef(category.goal_def);
        const renderedNote =
          templates.length > 0
            ? await api.internal.send('budget/render-note-templates', templates as Template[])
            : '';

        templateSummaries.push({
          id: category.id,
          name: category.name || 'Unnamed',
          groupId: category.group_id || 'unknown',
          groupName:
            categoryGroupNameMap.get(category.id) ||
            groupMap.get(category.group_id || '') ||
            'Unknown',
          templates,
          renderedNote,
          note: notesMap.get(category.id) ?? null,
          source: parseTemplateSettingsSource(category.template_settings),
          parseError,
        });
      }

      return templateSummaries.sort((a, b) => {
        const groupCompare = a.groupName.localeCompare(b.groupName);
        if (groupCompare !== 0) {
          return groupCompare;
        }
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      throw new ActualBudgetError('Failed to load category templates', { error });
    }
  }

  /**
   * Render template objects back into note lines
   */
  private async renderNoteTemplatesWithinSession(templates: TemplateRecord[]): Promise<string> {
    this.ensureInitialized();

    if (!api.internal?.send) {
      throw new ActualBudgetError('Actual Budget internal API unavailable');
    }

    try {
      return await api.internal.send('budget/render-note-templates', templates as Template[]);
    } catch (error) {
      throw new ActualBudgetError('Failed to render note templates', { error });
    }
  }

  /**
   * Fetch a single category note
   */
  private async getCategoryNoteWithinSession(categoryId: string): Promise<string | null> {
    this.ensureInitialized();

    if (!api.q || !api.aqlQuery) {
      throw new ActualBudgetError('Actual Budget internal API unavailable');
    }

    try {
      const result = (await api.aqlQuery(
        api.q('notes').filter({ id: categoryId }).select(['*'])
      )) as AqlResult<{ note?: string | null }>;
      const note = result.data?.[0]?.note;
      return typeof note === 'string' ? note : null;
    } catch (error) {
      throw new ActualBudgetError('Failed to fetch category note', { categoryId, error });
    }
  }

  /**
   * Update category notes
   */
  private async updateCategoryNoteWithinSession(
    categoryId: string,
    note: string | null
  ): Promise<void> {
    this.ensureInitialized();

    if (!api.internal?.send) {
      throw new ActualBudgetError('Actual Budget internal API unavailable');
    }

    try {
      await api.internal.send('notes-save', { id: categoryId, note: note ?? '' });
    } catch (error) {
      throw new ActualBudgetError('Failed to update category notes', {
        categoryId,
        error,
      });
    }
  }

  /**
   * Check templates based on current notes
   */
  private async checkTemplatesWithinSession(): Promise<{ message: string; pre?: string | null }> {
    this.ensureInitialized();

    if (!api.internal?.send) {
      throw new ActualBudgetError('Actual Budget internal API unavailable');
    }

    try {
      const result = (await api.internal.send('budget/check-templates')) as {
        message: string;
        pre?: string;
      };
      return { message: result.message, pre: result.pre ?? null };
    } catch (error) {
      throw new ActualBudgetError('Failed to check templates', { error });
    }
  }

  /**
   * Update transaction category
   * P7 (Explicit error handling): Wraps API call with error context
   */
  private async updateTransactionCategoryWithinSession(
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
  private async updateTransactionPayeeWithinSession(
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
  private async updateTransactionWithinSession(
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
  private async getPayeesWithinSession(): Promise<{ id: string; name: string }[]> {
    this.ensureInitialized();

    try {
      const payees = (await api.getPayees()) as ActualPayee[];
      return payees
        .filter(
          (p): p is ActualPayee & { name: string } =>
            typeof p.id === 'string' && isNamedPayee(p) && !p.transfer_acct
        )
        .map((p) => ({ id: p.id, name: p.name }));
    } catch (error) {
      throw new ActualBudgetError('Failed to fetch payees', { error });
    }
  }

  /**
   * Get active schedule names from the budget
   */
  private async getSchedulesWithinSession(): Promise<{ id: string; name: string }[]> {
    this.ensureInitialized();

    try {
      const schedules = (await api.getSchedules()) as ActualSchedule[];
      return schedules
        .filter(
          (schedule): schedule is ActualSchedule & { id: string; name: string } =>
            typeof schedule.id === 'string' &&
            typeof schedule.name === 'string' &&
            !schedule.tombstone
        )
        .map((schedule) => ({ id: schedule.id, name: schedule.name }));
    } catch (error) {
      throw new ActualBudgetError('Failed to fetch schedules', { error });
    }
  }

  /**
   * Find a payee by name (case-insensitive)
   */
  private async findPayeeByNameWithinSession(
    name: string
  ): Promise<{ id: string; name: string } | null> {
    const payees = await this.getPayeesWithinSession();
    const normalizedName = name.toLowerCase().trim();
    return payees.find((p) => p.name.toLowerCase().trim() === normalizedName) || null;
  }

  /**
   * Create a new payee
   */
  private async createPayeeWithinSession(name: string): Promise<string> {
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
   * Merge multiple payees into a target payee
   */
  private async mergePayeesWithinSession(
    targetPayeeId: string,
    mergePayeeIds: string[]
  ): Promise<void> {
    this.ensureInitialized();

    try {
      await api.mergePayees(targetPayeeId, mergePayeeIds);
      logger.info('Merged payees', {
        targetPayeeId,
        mergePayeeIds,
        mergeCount: mergePayeeIds.length,
      });
    } catch (error) {
      throw new ActualBudgetError('Failed to merge payees', {
        targetPayeeId,
        mergePayeeIds,
        error,
      });
    }
  }

  /**
   * Find or create a payee by name
   */
  private async findOrCreatePayeeWithinSession(name: string): Promise<string> {
    const existing = await this.findPayeeByNameWithinSession(name);
    if (existing) {
      return existing.id;
    }
    return this.createPayeeWithinSession(name);
  }

  /**
   * Sync changes with server (bi-directional: push local changes, pull remote changes)
   */
  private async syncWithinSession(): Promise<void> {
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
  private async listBudgetsWithinSession(): Promise<{ id: string; name: string }[]> {
    try {
      // The loaded budget owns the API lifetime; never reinitialize an active session.
      if (!this.initialized)
        await api.init({
          dataDir: this.env.DATA_DIR,
          serverURL: this.env.ACTUAL_SERVER_URL,
          password: this.env.ACTUAL_PASSWORD,
        });

      const budgets = await api.getBudgets();
      logger.info('Retrieved budget list', { count: budgets.length });

      const result = budgets
        .filter((b: { id?: string; name?: string }) => b.id !== undefined && b.name !== undefined)
        .map((b: { id?: string; name?: string }) => ({
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
  private async getCategorizedPayeesWithinSession(): Promise<CategorizedPayee[]> {
    this.ensureInitialized();

    try {
      const [accounts, payees, categories] = await Promise.all([
        api.getAccounts() as Promise<ActualAccount[]>,
        api.getPayees() as Promise<ActualPayee[]>,
        api.getCategories() as Promise<ActualCategory[]>,
      ]);

      // Track payee -> category mappings with counts
      const payeeCategoryMap = new Map<
        string,
        {
          payeeId: string;
          payeeName: string;
          categoryId: string;
          categoryName: string;
          transactionCount: number;
        }
      >();

      for (const account of accounts) {
        if (account.closed || account.offbudget) continue;

        const accountTransactions = (await api.getTransactions(
          account.id,
          '1970-01-01',
          new Date().toISOString().split('T')[0]
        )) as ActualTransaction[];

        for (const txn of accountTransactions) {
          // Skip transfers and uncategorized
          if (txn.transfer_id || !txn.category || !txn.payee) continue;

          const payee = payees.find((p) => p.id === txn.payee);
          const category = categories.find((c) => c.id === txn.category);
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
  private async shutdownWithinSession(): Promise<void> {
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

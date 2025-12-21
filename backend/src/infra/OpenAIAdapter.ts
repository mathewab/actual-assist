import OpenAI from 'openai';
import { OpenAIError } from '../domain/errors.js';
import { logger } from './logger.js';
import type { Env } from './env.js';
import type { Transaction, Category } from '../domain/entities/BudgetSnapshot.js';

/**
 * OpenAI API adapter for category suggestions
 * P5 (Separation of concerns): Domain layer never imports OpenAI directly
 */
export class OpenAIAdapter {
  private client: OpenAI;
  private model: string;

  constructor(env: Env) {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    this.model = env.OPENAI_MODEL;
  }

  /**
   * Generate category suggestion for a transaction
   * P7 (Explicit error handling): Wraps OpenAI API errors
   */
  async suggestCategory(
    transaction: Transaction,
    availableCategories: Category[],
    recentTransactions: Transaction[]
  ): Promise<{ categoryId: string | null; categoryName: string | null; confidence: number; reasoning: string }> {
    try {
      const prompt = this.buildPrompt(transaction, availableCategories, recentTransactions);

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a financial assistant that suggests budget categories for transactions. Respond in JSON format with: categoryId (string or null), categoryName (string or null), confidence (0-1), and reasoning (string).',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3, // Low temperature for consistency
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new OpenAIError('Empty response from OpenAI');
      }

      const result = JSON.parse(content);
      
      logger.debug('OpenAI suggestion generated', {
        transactionId: transaction.id,
        suggestedCategory: result.categoryName,
        confidence: result.confidence,
      });

      return {
        categoryId: result.categoryId || null,
        categoryName: result.categoryName || null,
        confidence: result.confidence,
        reasoning: result.reasoning,
      };
    } catch (error) {
      if (error instanceof OpenAIError) {
        throw error;
      }
      throw new OpenAIError('Failed to generate category suggestion', { error });
    }
  }

  /**
   * Build prompt for category suggestion
   * P2 (Zero duplication): Centralized prompt construction
   */
  private buildPrompt(
    transaction: Transaction,
    categories: Category[],
    recentTransactions: Transaction[]
  ): string {
    const categoryList = categories
      .map(cat => `- ${cat.name} (ID: ${cat.id}, Group: ${cat.groupName})`)
      .join('\n');

    const recentHistory = recentTransactions
      .filter(t => t.payeeId === transaction.payeeId && t.categoryId)
      .slice(0, 5)
      .map(t => `- ${t.payeeName}: ${t.categoryName}`)
      .join('\n');

    return `
Transaction Details:
- Payee: ${transaction.payeeName || 'Unknown'}
- Amount: $${(transaction.amount / 100).toFixed(2)}
- Date: ${transaction.date}
- Notes: ${transaction.notes || 'None'}

Available Categories:
${categoryList}

${recentHistory ? `Recent transactions from this payee:\n${recentHistory}` : ''}

Suggest the most appropriate category for this transaction. If you're not confident, suggest null for uncategorized.
Provide:
1. categoryId: The category ID from the list, or null if uncertain
2. categoryName: The category name, or null if uncertain
3. confidence: A number between 0 and 1 indicating your confidence
4. reasoning: A brief explanation of why you chose this category

Respond in JSON format.
    `.trim();
  }
}

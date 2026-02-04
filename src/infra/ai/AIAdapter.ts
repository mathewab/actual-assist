/**
 * Common interface for AI completion adapters
 * P5 (Separation of concerns): Domain layer uses this interface, not specific implementations
 */

/** Options for AI completion requests */
export interface CompletionOptions {
  /** System instructions for the model */
  instructions?: string;
  /** User input/prompt */
  input: string;
  /** Enable web search tool for up-to-date information (if supported) */
  webSearch?: boolean;
  /** Structured output schema for JSON responses */
  jsonSchema?: {
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
}

/** Capabilities that an AI backend may or may not support */
export interface AICapabilities {
  /** Whether the backend supports web search for real-time information */
  supportsWebSearch: boolean;
  /** Whether the backend supports structured JSON output via schema */
  supportsStructuredOutput: boolean;
  /** Whether the backend supports streaming responses */
  supportsStreaming: boolean;
}

/**
 * Common interface for all AI adapters
 * Implementations: OpenAIAdapter, GoogleAIAdapter
 */
export interface AIAdapter {
  /** Generate a completion from the AI model */
  completion(options: CompletionOptions): Promise<string>;

  /** Check if the adapter is properly configured (has API key) */
  isConfigured(): boolean;

  /** Get the capabilities of this backend */
  getCapabilities(): AICapabilities;

  /** Get the name of the AI backend (for logging/display) */
  getBackendName(): string;
}

export interface LLMJsonSchema {
  name: string;
  schema: Record<string, unknown>;
  description?: string;
}

export interface LLMTextOptions {
  system?: string;
  input: string;
  webSearch?: boolean;
  model?: string;
  providerOptions?: import('@ai-sdk/provider-utils').ProviderOptions;
}

export interface LLMObjectOptions {
  system?: string;
  input: string;
  webSearch?: boolean;
  schema: LLMJsonSchema;
  model?: string;
  providerOptions?: import('@ai-sdk/provider-utils').ProviderOptions;
}

export interface LLMCapabilities {
  webSearch: boolean;
  jsonSchema: boolean;
}

export interface LLMAdapter {
  generateText(options: LLMTextOptions): Promise<string>;
  generateObject<T>(options: LLMObjectOptions): Promise<T>;
  isConfigured(): boolean;
  capabilities(): LLMCapabilities;
}

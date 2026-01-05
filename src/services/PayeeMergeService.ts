import * as fuzz from 'fuzzball';
import { createHash } from 'node:crypto';
import { payeeMatcher } from '../infra/PayeeMatcher.js';
import type { LLMAdapter } from '../infra/llm/LLMAdapter.js';
import { logger } from '../infra/logger.js';
import type { ActualBudgetAdapter } from '../infra/ActualBudgetAdapter.js';
import type { PayeeMergeClusterRepository } from '../infra/repositories/PayeeMergeClusterRepository.js';
import type {
  PayeeMergeCluster,
  PayeeMergeClusterPayee,
} from '../domain/entities/PayeeMergeCluster.js';
import type { AuditRepository } from '../infra/repositories/AuditRepository.js';
import type { PayeeMergeClusterMetaRepository } from '../infra/repositories/PayeeMergeClusterMetaRepository.js';
import type { PayeeMergeHiddenGroupRepository } from '../infra/repositories/PayeeMergeHiddenGroupRepository.js';
import type { PayeeMergePayeeSnapshotRepository } from '../infra/repositories/PayeeMergePayeeSnapshotRepository.js';

interface PayeeClusterSplitOutput {
  groups: number[][];
}

export class PayeeMergeService {
  constructor(
    private actualBudget: ActualBudgetAdapter,
    private clusterRepo: PayeeMergeClusterRepository,
    private clusterMetaRepo: PayeeMergeClusterMetaRepository,
    private payeeSnapshotRepo: PayeeMergePayeeSnapshotRepository,
    private hiddenGroupRepo: PayeeMergeHiddenGroupRepository,
    private llm: LLMAdapter,
    private auditRepo: AuditRepository
  ) {}

  async getCachedClusters(options: { budgetId: string }): Promise<{
    clusters: Array<PayeeMergeCluster & { hidden: boolean }>;
    cache: {
      payeeHash: string | null;
      currentPayeeHash: string;
      stale: boolean;
      stalePayeeIds: string[];
    };
  }> {
    const clusters = this.clusterRepo.listByBudgetId(options.budgetId);
    const hiddenGroups = this.hiddenGroupRepo.listByBudgetId(options.budgetId);
    const hiddenHashes = new Set(hiddenGroups.map((group) => group.groupHash));
    const cachedMeta = this.clusterMetaRepo.getByBudgetId(options.budgetId);
    const cachedSnapshot = this.payeeSnapshotRepo.listByBudgetId(options.budgetId);
    const currentPayees = await this.actualBudget.getPayees();
    const currentPayeeMap = new Map(currentPayees.map((payee) => [payee.id, payee.name]));
    const currentPayeeIds = new Set(currentPayees.map((payee) => payee.id));
    const currentHash = computePayeeHash(currentPayees);
    const cachedHash = cachedMeta?.payeeHash ?? null;
    const isStale = !cachedHash || cachedHash !== currentHash;
    const stalePayeeIds = isStale
      ? computeStalePayeeIds(cachedSnapshot, currentPayees, clusters)
      : [];
    return {
      clusters: clusters.flatMap((cluster) => {
        const payees = cluster.payees
          .filter((payee) => currentPayeeIds.has(payee.id))
          .map((payee) => ({
            ...payee,
            name: currentPayeeMap.get(payee.id) ?? payee.name,
          }));
        if (payees.length < 2) {
          return [];
        }
        const groupHash = computeGroupHash(payees);
        return [
          {
            ...cluster,
            payees,
            groupHash,
            hidden: hiddenHashes.has(groupHash),
          },
        ];
      }),
      cache: {
        payeeHash: cachedHash,
        currentPayeeHash: currentHash,
        stale: isStale,
        stalePayeeIds,
      },
    };
  }

  async generateMergeClusters(options: {
    budgetId: string;
    minScore?: number;
    useAI?: boolean;
    force?: boolean;
    aiMinClusterSize?: number;
  }): Promise<PayeeMergeCluster[]> {
    const minScore = options.minScore ?? 92;
    const effectiveMinScore = options.useAI ? Math.min(minScore, 80) : minScore;
    const aiMinClusterSize = Math.max(2, options.aiMinClusterSize ?? 5);

    try {
      const payees = await this.actualBudget.getPayees();
      const payeeHash = computePayeeHash(payees);

      if (!options.force) {
        const cachedMeta = this.clusterMetaRepo.getByBudgetId(options.budgetId);
        const cachedClusters = this.clusterRepo.listByBudgetId(options.budgetId);
        if (cachedMeta?.payeeHash === payeeHash && cachedClusters.length > 0) {
          return cachedClusters;
        }
      }

      if (options.force) {
        this.clusterRepo.clearByBudgetId(options.budgetId);
        this.clusterMetaRepo.clearByBudgetId(options.budgetId);
        this.hiddenGroupRepo.clearByBudgetId(options.budgetId);
      }

      const unionFind = new UnionFind(payees.map((payee) => payee.id));
      const normalized = new Map<string, string>();
      const tokenSet = new Map<string, string>();
      const tokenList = new Map<string, string[]>();

      const tokenFrequency = new Map<string, number>();

      for (const payee of payees) {
        const clean = payeeMatcher.normalize(payee.name);
        const rawTokens = toTokens(clean);
        const tokens = selectClusterTokens(rawTokens);
        normalized.set(payee.id, clean);
        tokenSet.set(payee.id, toTokenSet(tokens));
        tokenList.set(payee.id, tokens);
        for (const token of tokens) {
          tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
        }
      }

      const tokenBuckets = new Map<string, string[]>();
      for (const payee of payees) {
        const tokens = tokenSet.get(payee.id) || '';
        addToBucket(tokenBuckets, tokens, payee.id);
      }

      const exactBuckets = new Map<string, string[]>();
      for (const payee of payees) {
        const clean = normalized.get(payee.id) || '';
        addToBucket(exactBuckets, clean, payee.id);
      }

      for (const ids of exactBuckets.values()) {
        unionAll(unionFind, ids);
      }
      for (const ids of tokenBuckets.values()) {
        unionAll(unionFind, ids);
      }

      const rareTokenBuckets = new Map<string, string[]>();
      for (const payee of payees) {
        const tokens = tokenList.get(payee.id) ?? [];
        const rareToken = getRarestToken(tokens, tokenFrequency);
        if (rareToken) {
          addToBucket(rareTokenBuckets, rareToken, payee.id);
        }
      }

      const weights = buildTokenWeights(tokenFrequency);

      for (const ids of rareTokenBuckets.values()) {
        for (let i = 0; i < ids.length; i += 1) {
          for (let j = i + 1; j < ids.length; j += 1) {
            const leftTokens = tokenList.get(ids[i]) ?? [];
            const rightTokens = tokenList.get(ids[j]) ?? [];
            if (leftTokens.length === 0 || rightTokens.length === 0) continue;

            const left = normalized.get(ids[i]) || '';
            const right = normalized.get(ids[j]) || '';
            const rawScore = left && right ? fuzz.token_set_ratio(left, right) : 0;
            const weightedScore = weightedTokenSimilarity(leftTokens, rightTokens, weights);
            if (weightedScore < effectiveMinScore && rawScore < effectiveMinScore) continue;
            unionFind.union(ids[i], ids[j]);
          }
        }
      }

      let clusters = buildClusters(options.budgetId, payees, unionFind, normalized, tokenSet);
      if (options.useAI && clusters.length > 0) {
        clusters = await this.refineClustersWithAIAll(clusters, aiMinClusterSize);
      }
      this.clusterRepo.replaceForBudget(options.budgetId, clusters);
      this.payeeSnapshotRepo.replaceForBudget(options.budgetId, payees);
      this.clusterMetaRepo.upsert({
        budgetId: options.budgetId,
        payeeHash,
        createdAt: new Date().toISOString(),
      });
      this.auditRepo.log({
        eventType: 'payees_merge_suggestions_generated',
        entityType: 'PayeeMergeCluster',
        entityId: options.budgetId,
        metadata: {
          budgetId: options.budgetId,
          minScore,
          count: clusters.length,
        },
      });
      return clusters;
    } catch (error) {
      this.auditRepo.log({
        eventType: 'payees_merge_suggestions_failed',
        entityType: 'PayeeMergeCluster',
        entityId: options.budgetId,
        metadata: {
          budgetId: options.budgetId,
          minScore,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  async mergePayees(targetPayeeId: string, mergePayeeIds: string[]): Promise<void> {
    await this.actualBudget.mergePayees(targetPayeeId, mergePayeeIds);
  }

  async resolveTargetPayee(options: {
    targetPayeeId?: string | null;
    targetPayeeName?: string | null;
  }): Promise<{ targetPayeeId: string; targetPayeeName?: string; created: boolean }> {
    if (options.targetPayeeName) {
      const trimmedName = options.targetPayeeName.trim();
      if (!trimmedName) {
        throw new Error('targetPayeeName is required');
      }
      const existing = await this.actualBudget.findPayeeByName(trimmedName);
      if (existing) {
        return { targetPayeeId: existing.id, targetPayeeName: existing.name, created: false };
      }
      const targetPayeeId = await this.actualBudget.createPayee(trimmedName);
      return { targetPayeeId, targetPayeeName: trimmedName, created: true };
    }

    if (options.targetPayeeId) {
      return { targetPayeeId: options.targetPayeeId, created: false };
    }

    throw new Error('targetPayeeId or targetPayeeName is required');
  }

  async sync(): Promise<void> {
    await this.actualBudget.sync();
  }

  clearCachedSuggestions(budgetId: string): void {
    this.clusterRepo.clearByBudgetId(budgetId);
    this.clusterMetaRepo.clearByBudgetId(budgetId);
    this.payeeSnapshotRepo.clearByBudgetId(budgetId);
  }

  hideCluster(params: { budgetId: string; groupHash: string }): void {
    this.hiddenGroupRepo.hideGroup(params);
  }

  unhideCluster(params: { budgetId: string; groupHash: string }): void {
    this.hiddenGroupRepo.unhideGroup(params);
  }

  private async refineClustersWithAIAll(
    clusters: PayeeMergeCluster[],
    minClusterSize: number
  ): Promise<PayeeMergeCluster[]> {
    const refined: PayeeMergeCluster[] = [];

    for (const cluster of clusters) {
      if (cluster.payees.length < minClusterSize) {
        refined.push(cluster);
        continue;
      }
      const aiResult = await this.splitClusterWithAI(cluster);
      if (!aiResult) {
        refined.push(cluster);
        continue;
      }
      refined.push(...aiResult);
    }

    return refined;
  }

  private async splitClusterWithAI(
    cluster: PayeeMergeCluster
  ): Promise<PayeeMergeCluster[] | null> {
    const instructions = `You are splitting a group of payee names into sub-groups that refer to the same merchant/entity.
Return JSON with a single key "groups" that is an array of arrays of integers.
Each integer is the 0-based index of a payee in the list.
All indexes must appear exactly once across all groups.
Be conservative: only split when you are confident the names refer to different entities.
Do NOT group items just because they share a city/region/descriptor or a suffix like a phone number.
Only group when the merchant/entity name is the same; a location suffix is allowed ONLY for the same brand.

Good groupings (same entity):
- "Starbucks Seattle", "Starbucks #1234", "Starbucks Cafe"
- "Amazon Mktp", "AMZN Mktp", "Amazon Marketplace"
- "Costco Gas", "Costco Wholesale", "Costco #102"

Bad groupings (different entities despite shared words/location):
- "Springfield Public Library" vs "Springfield Bakery"
- "Downtown Parking" vs "Downtown Cafe"
- "Main Street Dental" vs "Main Street Books"

If they are all the same entity, return one group with all indexes.`;

    const lines = cluster.payees.map((payee, index) => `${index}. ${payee.name}`).join('\n');
    const input = `Payee list:\n${lines}`;

    try {
      const parsed = await this.llm.generateObject<PayeeClusterSplitOutput>({
        system: instructions,
        input,
        schema: {
          name: 'payee_cluster_split',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['groups'],
            properties: {
              groups: {
                type: 'array',
                items: {
                  type: 'array',
                  items: { type: 'integer', minimum: 0 },
                },
              },
            },
          },
        },
      });
      if (!parsed?.groups || !Array.isArray(parsed.groups)) {
        throw new Error('LLM returned an invalid cluster split response');
      }

      const total = cluster.payees.length;
      const seen = new Set<number>();
      for (const group of parsed.groups) {
        if (!Array.isArray(group) || group.length === 0) {
          throw new Error('LLM returned an invalid cluster split response');
        }
        for (const index of group) {
          if (typeof index !== 'number' || index < 0 || index >= total) {
            throw new Error('LLM returned an invalid cluster split response');
          }
          if (seen.has(index)) {
            throw new Error('LLM returned an invalid cluster split response');
          }
          seen.add(index);
        }
      }
      if (seen.size !== total) {
        throw new Error('LLM returned an invalid cluster split response');
      }

      const createdAt = new Date().toISOString();
      return parsed.groups
        .map((group) => group.map((index) => cluster.payees[index]))
        .filter((group) => group.length >= 2)
        .map((payees) => buildCluster(cluster.budgetId, payees, createdAt));
    } catch (error) {
      logger.warn('AI cluster split failed', {
        clusterId: cluster.clusterId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.auditRepo.log({
        eventType: 'llm_call_failed',
        entityType: 'payee_merge',
        entityId: cluster.clusterId,
        metadata: {
          budgetId: cluster.budgetId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  // buildClustersWithAI removed; AI now refines heuristic clusters
}

function addToBucket(map: Map<string, string[]>, key: string, id: string) {
  if (!key) return;
  const existing = map.get(key);
  if (existing) {
    existing.push(id);
  } else {
    map.set(key, [id]);
  }
}

function unionAll(unionFind: UnionFind, ids: string[]): void {
  if (ids.length < 2) return;
  const [first, ...rest] = ids;
  for (const id of rest) {
    unionFind.union(first, id);
  }
}

function toTokenSet(tokens: string[]): string {
  const unique = Array.from(new Set(tokens));
  unique.sort();
  return unique.join(' ');
}

function toTokens(value: string): string[] {
  const tokens = value.split(' ').filter(Boolean);
  return Array.from(new Set(tokens));
}

function selectClusterTokens(tokens: string[]): string[] {
  const filtered = tokens.filter((token) => !isNoiseToken(token));
  return filtered.length > 0 ? filtered : tokens;
}

function isNoiseToken(token: string): boolean {
  if (!token) return true;
  const hasLetter = /[a-z]/i.test(token);
  const hasDigit = /\d/.test(token);
  if (hasLetter && hasDigit) return true;
  if (!hasLetter && hasDigit && token.length >= 5) return true;
  return false;
}

function getRarestToken(tokens: string[], frequency: Map<string, number>): string | null {
  if (tokens.length === 0) return null;
  const withCounts = tokens.map((token) => ({
    token,
    count: frequency.get(token) ?? Number.MAX_SAFE_INTEGER,
  }));
  const shared = withCounts.filter((entry) => entry.count > 1);
  const candidates = shared.length > 0 ? shared : withCounts;
  let best = candidates[0];
  for (const entry of candidates) {
    if (entry.count < best.count) {
      best = entry;
    }
  }
  return best.token;
}

function buildTokenWeights(frequency: Map<string, number>): Map<string, number> {
  const weights = new Map<string, number>();
  for (const [token, count] of frequency.entries()) {
    const weight = 1 / Math.log2(count + 1);
    weights.set(token, Number.isFinite(weight) ? weight : 0);
  }
  return weights;
}

function weightedTokenSimilarity(
  leftTokens: string[],
  rightTokens: string[],
  weights: Map<string, number>
): number {
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const allTokens = new Set([...leftSet, ...rightSet]);
  let intersection = 0;
  let union = 0;
  for (const token of allTokens) {
    const weight = weights.get(token) ?? 0;
    union += weight;
    if (leftSet.has(token) && rightSet.has(token)) {
      intersection += weight;
    }
  }
  if (union === 0) return 0;
  return Math.round((intersection / union) * 100);
}

function buildClusters(
  budgetId: string,
  payees: { id: string; name: string }[],
  unionFind: UnionFind,
  normalized: Map<string, string>,
  tokenSet: Map<string, string>
): PayeeMergeCluster[] {
  const clusterMap = new Map<string, PayeeMergeClusterPayee[]>();

  for (const payee of payees) {
    const root = unionFind.find(payee.id);
    const list = clusterMap.get(root);
    const payeeEntry: PayeeMergeClusterPayee = {
      id: payee.id,
      name: payee.name,
      normalizedName: normalized.get(payee.id) || '',
      tokenSet: tokenSet.get(payee.id) || '',
    };
    if (list) {
      list.push(payeeEntry);
    } else {
      clusterMap.set(root, [payeeEntry]);
    }
  }

  const clusters: PayeeMergeCluster[] = [];
  const createdAt = new Date().toISOString();

  for (const payeesInCluster of clusterMap.values()) {
    if (payeesInCluster.length < 2) continue;
    clusters.push(buildCluster(budgetId, payeesInCluster, createdAt));
  }

  return clusters.sort((a, b) => b.payees.length - a.payees.length);
}

function buildCluster(
  budgetId: string,
  payees: PayeeMergeClusterPayee[],
  createdAt: string
): PayeeMergeCluster {
  const sortedIds = payees.map((payee) => payee.id).sort();
  return {
    clusterId: sortedIds.join('|'),
    groupHash: computeGroupHash(payees),
    budgetId,
    payees,
    createdAt,
  };
}

class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  constructor(ids: string[]) {
    for (const id of ids) {
      this.parent.set(id, id);
      this.rank.set(id, 0);
    }
  }

  find(id: string): string {
    const parent = this.parent.get(id);
    if (!parent || parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;

    const rankA = this.rank.get(rootA) ?? 0;
    const rankB = this.rank.get(rootB) ?? 0;
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }
}

function computePayeeHash(payees: { id: string; name: string }[]): string {
  const sorted = [...payees].sort((a, b) => a.id.localeCompare(b.id));
  const payload = sorted.map((payee) => `${payee.id}:${payee.name}`).join('|');
  return createHash('sha256').update(payload).digest('hex');
}

function computeGroupHash(payees: PayeeMergeClusterPayee[]): string {
  const sorted = [...payees].sort((a, b) => a.id.localeCompare(b.id));
  const payload = sorted.map((payee) => `${payee.id}:${payee.name}`).join('|');
  return createHash('sha256').update(payload).digest('hex');
}

function computeStalePayeeIds(
  cachedSnapshot: Array<{ payeeId: string; payeeName: string }>,
  currentPayees: Array<{ id: string; name: string }>,
  clusters: PayeeMergeCluster[]
): string[] {
  if (cachedSnapshot.length === 0) {
    return Array.from(
      new Set(clusters.flatMap((cluster) => cluster.payees.map((payee) => payee.id)))
    );
  }

  const cachedById = new Map(cachedSnapshot.map((payee) => [payee.payeeId, payee.payeeName]));
  const currentById = new Map(currentPayees.map((payee) => [payee.id, payee.name]));
  const staleIds = new Set<string>();

  for (const [payeeId, cachedName] of cachedById.entries()) {
    const currentName = currentById.get(payeeId);
    if (!currentName || currentName !== cachedName) {
      staleIds.add(payeeId);
    }
  }

  return Array.from(staleIds);
}

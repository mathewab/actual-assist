import * as fuzz from 'fuzzball';
import { createHash } from 'node:crypto';
import { payeeMatcher } from '../infra/PayeeMatcher.js';
import { OpenAIAdapter } from '../infra/OpenAIAdapter.js';
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

export class PayeeMergeService {
  constructor(
    private actualBudget: ActualBudgetAdapter,
    private clusterRepo: PayeeMergeClusterRepository,
    private clusterMetaRepo: PayeeMergeClusterMetaRepository,
    private hiddenGroupRepo: PayeeMergeHiddenGroupRepository,
    private openai: OpenAIAdapter,
    private auditRepo: AuditRepository
  ) {}

  async getCachedClusters(options: { budgetId: string }): Promise<{
    clusters: Array<PayeeMergeCluster & { hidden: boolean }>;
    cache: { payeeHash: string | null; currentPayeeHash: string; stale: boolean };
  }> {
    const clusters = this.clusterRepo.listByBudgetId(options.budgetId);
    const hiddenGroups = this.hiddenGroupRepo.listByBudgetId(options.budgetId);
    const hiddenHashes = new Set(hiddenGroups.map((group) => group.groupHash));
    const cachedMeta = this.clusterMetaRepo.getByBudgetId(options.budgetId);
    const currentPayees = await this.actualBudget.getPayees();
    const currentHash = computePayeeHash(currentPayees);
    const cachedHash = cachedMeta?.payeeHash ?? null;
    return {
      clusters: clusters.map((cluster) => {
        const groupHash = cluster.groupHash || computeGroupHash(cluster.payees);
        return {
          ...cluster,
          groupHash,
          hidden: hiddenHashes.has(groupHash),
        };
      }),
      cache: {
        payeeHash: cachedHash,
        currentPayeeHash: currentHash,
        stale: !cachedHash || cachedHash !== currentHash,
      },
    };
  }

  async generateMergeClusters(options: {
    budgetId: string;
    minScore?: number;
    useAI?: boolean;
    force?: boolean;
  }): Promise<PayeeMergeCluster[]> {
    const minScore = options.minScore ?? 92;

    try {
      if (options.force) {
        this.clusterRepo.clearByBudgetId(options.budgetId);
        this.clusterMetaRepo.clearByBudgetId(options.budgetId);
        this.hiddenGroupRepo.clearByBudgetId(options.budgetId);
      }

      const payees = await this.actualBudget.getPayees();
      const payeeHash = computePayeeHash(payees);
      const unionFind = new UnionFind(payees.map((payee) => payee.id));
      const normalized = new Map<string, string>();
      const tokenSet = new Map<string, string>();
      const tokenList = new Map<string, string[]>();

      const tokenFrequency = new Map<string, number>();

      for (const payee of payees) {
        const clean = payeeMatcher.normalize(payee.name);
        const tokens = toTokens(clean);
        normalized.set(payee.id, clean);
        tokenSet.set(payee.id, toTokenSet(clean));
        tokenList.set(payee.id, tokens);
        for (const token of tokens) {
          tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
        }
      }

      const exactBuckets = new Map<string, string[]>();
      const tokenBuckets = new Map<string, string[]>();
      for (const payee of payees) {
        const clean = normalized.get(payee.id) || '';
        const tokens = tokenSet.get(payee.id) || '';
        addToBucket(exactBuckets, clean, payee.id);
        addToBucket(tokenBuckets, tokens, payee.id);
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

      const flaggedIds = new Set<string>();
      const weights = buildTokenWeights(tokenFrequency);

      for (const ids of rareTokenBuckets.values()) {
        for (let i = 0; i < ids.length; i += 1) {
          for (let j = i + 1; j < ids.length; j += 1) {
            const leftTokens = tokenList.get(ids[i]) ?? [];
            const rightTokens = tokenList.get(ids[j]) ?? [];
            if (leftTokens.length === 0 || rightTokens.length === 0) continue;

            const weightedScore = weightedTokenSimilarity(leftTokens, rightTokens, weights);
            if (weightedScore < minScore) continue;

            const left = normalized.get(ids[i]) || '';
            const right = normalized.get(ids[j]) || '';
            const rawScore = left && right ? fuzz.token_set_ratio(left, right) : 0;
            if (rawScore < minScore) {
              flaggedIds.add(ids[i]);
              flaggedIds.add(ids[j]);
            }
            unionFind.union(ids[i], ids[j]);
          }
        }
      }

      let clusters = buildClusters(options.budgetId, payees, unionFind, normalized, tokenSet);
      if (options.useAI && clusters.length > 0 && flaggedIds.size > 0) {
        clusters = await this.refineClustersWithAI(clusters, flaggedIds);
      }
      this.clusterRepo.replaceForBudget(options.budgetId, clusters);
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

  async sync(): Promise<void> {
    await this.actualBudget.sync();
  }

  clearCachedSuggestions(budgetId: string): void {
    this.clusterRepo.clearByBudgetId(budgetId);
    this.clusterMetaRepo.clearByBudgetId(budgetId);
  }

  hideCluster(params: { budgetId: string; groupHash: string }): void {
    this.hiddenGroupRepo.hideGroup(params);
  }

  unhideCluster(params: { budgetId: string; groupHash: string }): void {
    this.hiddenGroupRepo.unhideGroup(params);
  }

  private async refineClustersWithAI(
    clusters: PayeeMergeCluster[],
    flaggedIds: Set<string>
  ): Promise<PayeeMergeCluster[]> {
    const refined: PayeeMergeCluster[] = [];

    for (const cluster of clusters) {
      const hasFlagged = cluster.payees.some((payee) => flaggedIds.has(payee.id));
      if (!hasFlagged || cluster.payees.length < 2) {
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
If they are all the same entity, return one group with all indexes.`;

    const lines = cluster.payees.map((payee, index) => `${index}. ${payee.name}`).join('\n');
    const input = `Payee list:\n${lines}`;

    try {
      const response = await this.openai.completion({ instructions, input });
      const parsed = OpenAIAdapter.parseJsonResponse<{ groups: number[][] }>(response);
      if (!parsed?.groups || !Array.isArray(parsed.groups)) {
        return null;
      }

      const total = cluster.payees.length;
      const seen = new Set<number>();
      for (const group of parsed.groups) {
        if (!Array.isArray(group) || group.length === 0) return null;
        for (const index of group) {
          if (typeof index !== 'number' || index < 0 || index >= total) return null;
          if (seen.has(index)) return null;
          seen.add(index);
        }
      }
      if (seen.size !== total) return null;

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
      return null;
    }
  }
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

function toTokenSet(value: string): string {
  const tokens = value.split(' ').filter(Boolean);
  const unique = Array.from(new Set(tokens));
  unique.sort();
  return unique.join(' ');
}

function toTokens(value: string): string[] {
  const tokens = value.split(' ').filter(Boolean);
  return Array.from(new Set(tokens));
}

function getRarestToken(tokens: string[], frequency: Map<string, number>): string | null {
  if (tokens.length === 0) return null;
  let best = tokens[0];
  let bestCount = frequency.get(best) ?? Number.MAX_SAFE_INTEGER;
  for (const token of tokens) {
    const count = frequency.get(token) ?? Number.MAX_SAFE_INTEGER;
    if (count < bestCount) {
      best = token;
      bestCount = count;
    }
  }
  return best;
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

export interface PayeeMergeClusterPayee {
  id: string;
  name: string;
  normalizedName: string;
  tokenSet: string;
}

export interface PayeeMergeCluster {
  clusterId: string;
  groupHash: string;
  budgetId: string;
  payees: PayeeMergeClusterPayee[];
  createdAt: string;
}

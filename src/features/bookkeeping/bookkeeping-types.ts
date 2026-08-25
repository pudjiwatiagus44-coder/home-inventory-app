/**
 * 一键记账 云同步：请求/响应类型与解析（对齐 mobile-sync 风格）。
 *
 * 原则：只处理 bookkeeping_* 数据；不含 rawOcrText/confidence（脱敏红线在本项目 Android 端保证）。
 */
export type BookkeepingEntity = "transaction" | "category";
export type BookkeepingOp = "UPSERT" | "DELETE";

export type BookkeepingTransactionPayload = {
  transactionId?: string | null;
  amount: string;
  direction: string;
  currency: string;
  merchant: string;
  description: string;
  transactionTime: string;
  source: string;
  status: string;
  payerPayee: string;
  account: string;
  participant: string;
  tag: string;
  property: string;
  categoryName: string;
  updatedAt?: string | null;
};

export type BookkeepingCategoryPayload = {
  categoryId?: string | null;
  name: string;
  type: string;
  keywords: string;
  isBuiltin: boolean;
  isActive: boolean;
  updatedAt?: string | null;
};

export type BookkeepingPayload =
  | BookkeepingTransactionPayload
  | BookkeepingCategoryPayload;

export type BookkeepingOperation = {
  op: BookkeepingOp;
  entityType: BookkeepingEntity;
  localId: string;
  serverId?: string | null;
  payload?: BookkeepingPayload | null;
  categoryPayload?: BookkeepingCategoryPayload | null;
  baseUpdatedAt?: string | null;
  localUpdatedAt?: string | null;
};

export type BookkeepingSyncRequest = {
  accountId?: string | null;
  since?: string | null;
  updates: BookkeepingOperation[];
};

export type BookkeepingChange = {
  entityType: BookkeepingEntity;
  serverId: string;
  deleted: boolean;
  payload?: BookkeepingTransactionPayload | null;
  categoryPayload?: BookkeepingCategoryPayload | null;
  serverUpdatedAt?: string | null;
};

export type BookkeepingConflict = {
  localId: string;
  serverId: string;
  entityType: BookkeepingEntity;
  serverEntity?: BookkeepingTransactionPayload | null;
  serverCategory?: BookkeepingCategoryPayload | null;
  baseServerUpdatedAt?: string | null;
};

export type BookkeepingSyncData = {
  cursor: string | null;
  changes: BookkeepingChange[];
  conflicts: BookkeepingConflict[];
};

export type BookkeepingSyncResponse = {
  ok: true;
  data: BookkeepingSyncData;
};

export function parseBookkeepingSyncRequest(input: unknown): BookkeepingSyncRequest {
  if (!isRecord(input)) {
    throw new Error("request must be an object");
  }

  if (!Array.isArray(input.updates)) {
    throw new Error("updates must be an array");
  }

  return {
    accountId: readOptionalString(input, "accountId"),
    since: readOptionalString(input, "since"),
    updates: input.updates.map(parseOperation),
  };
}

function parseOperation(input: unknown): BookkeepingOperation {
  if (!isRecord(input)) {
    throw new Error("operation must be an object");
  }

  const op = readOp(input.op);
  const entityType = readEntityType(input.entityType);
  const operation: BookkeepingOperation = {
    op,
    entityType,
    localId: readRequiredString(input, "localId"),
    serverId: readOptionalString(input, "serverId"),
    baseUpdatedAt: readOptionalString(input, "baseUpdatedAt"),
    localUpdatedAt: readOptionalString(input, "localUpdatedAt"),
  };

  if (input.payload !== undefined && input.payload !== null) {
    if (entityType === "transaction") {
      operation.payload = readTransactionPayload(input.payload);
    } else {
      operation.payload = readCategoryPayload(input.payload);
    }
  }
  if (input.categoryPayload !== undefined && input.categoryPayload !== null) {
    operation.categoryPayload = readCategoryPayload(input.categoryPayload);
  }

  // DELETE：必须带 serverId
  if (op === "DELETE" && !operation.serverId) {
    throw new Error("serverId is required for DELETE");
  }

  return removeUndefinedValues(operation);
}

function readOp(value: unknown): BookkeepingOp {
  if (value === "UPSERT" || value === "DELETE") {
    return value;
  }
  throw new Error("op must be UPSERT or DELETE");
}

function readEntityType(value: unknown): BookkeepingEntity {
  if (value === "transaction" || value === "category") {
    return value;
  }
  throw new Error("entityType must be transaction or category");
}

function readTransactionPayload(value: unknown): BookkeepingTransactionPayload {
  if (!isRecord(value)) {
    throw new Error("transaction payload must be an object");
  }
  return {
    transactionId: readOptionalString(value, "transactionId"),
    amount: readPayloadRequiredString(value, "amount"),
    direction: readPayloadRequiredString(value, "direction"),
    currency: readPayloadString(value, "currency"),
    merchant: readPayloadString(value, "merchant"),
    description: readPayloadString(value, "description"),
    transactionTime: readPayloadRequiredString(value, "transactionTime"),
    source: readPayloadString(value, "source"),
    status: readPayloadString(value, "status"),
    payerPayee: readPayloadString(value, "payerPayee"),
    account: readPayloadString(value, "account"),
    participant: readPayloadString(value, "participant"),
    tag: readPayloadString(value, "tag"),
    property: readPayloadString(value, "property"),
    categoryName: readPayloadString(value, "categoryName"),
    updatedAt: readOptionalString(value, "updatedAt"),
  };
}

function readCategoryPayload(value: unknown): BookkeepingCategoryPayload {
  if (!isRecord(value)) {
    throw new Error("category payload must be an object");
  }
  return {
    categoryId: readOptionalString(value, "categoryId"),
    name: readPayloadRequiredString(value, "name"),
    type: readPayloadString(value, "type"),
    keywords: readPayloadString(value, "keywords"),
    isBuiltin: readBoolean(value, "isBuiltin"),
    isActive: readBoolean(value, "isActive"),
    updatedAt: readOptionalString(value, "updatedAt"),
  };
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function readPayloadRequiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`payload ${key} must be a non-empty string`);
  }
  return value;
}

function readPayloadString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`payload ${key} must be a string`);
  }
  return value;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!(key in record) || record[key] === null || record[key] === undefined) {
    return undefined;
  }
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string`);
  }
  return value;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function removeUndefinedValues<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

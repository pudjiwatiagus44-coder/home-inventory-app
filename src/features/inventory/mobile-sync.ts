export type MobileSyncEntity = "area" | "location" | "item";
export type MobileSyncAction = "create" | "update" | "delete";

export type MobileAreaPayload = {
  name: string;
  color: string;
};

export type MobileLocationPayload = {
  name: string;
  areaId: string | null;
};

export type MobileItemPayload = {
  name: string;
  note: string;
  expireDate: string | null;
  locationId: string | null;
};

export type MobileSyncPayload =
  | MobileAreaPayload
  | MobileLocationPayload
  | MobileItemPayload;

export type MobileSyncOperation = {
  clientOperationId: string;
  entity: MobileSyncEntity;
  action: MobileSyncAction;
  localId?: string;
  serverId?: string;
  baseServerUpdatedAt?: string;
  payload?: MobileSyncPayload;
};

export type MobileSyncRequest = {
  operations: MobileSyncOperation[];
};

export type MobileSyncOperationResult =
  | {
      clientOperationId: string;
      status: "applied";
      entity: MobileSyncEntity;
      localId?: string;
      serverId: string;
      serverUpdatedAt: string;
    }
  | {
      clientOperationId: string;
      status: "conflict" | "failed";
      entity: MobileSyncEntity;
      serverId?: string;
      message: string;
    };

export type MobileSyncResponse = {
  ok: true;
  results: MobileSyncOperationResult[];
};

export function parseMobileSyncRequest(input: unknown): MobileSyncRequest {
  if (!isRecord(input) || !Array.isArray(input.operations)) {
    throw new Error("operations must be an array");
  }

  return {
    operations: input.operations.map(parseMobileSyncOperation),
  };
}

function parseMobileSyncOperation(input: unknown): MobileSyncOperation {
  if (!isRecord(input)) {
    throw new Error("operation must be an object");
  }

  const operation: MobileSyncOperation = {
    clientOperationId: readRequiredString(input, "clientOperationId"),
    entity: readEntity(input.entity),
    action: readAction(input.action),
    localId: readOptionalString(input, "localId"),
    serverId: readOptionalString(input, "serverId"),
    baseServerUpdatedAt: readOptionalString(input, "baseServerUpdatedAt"),
  };

  if (
    (operation.action === "update" || operation.action === "delete") &&
    !operation.baseServerUpdatedAt
  ) {
    throw new Error("baseServerUpdatedAt is required for update and delete");
  }

  if (
    (operation.action === "update" || operation.action === "delete") &&
    !operation.serverId
  ) {
    throw new Error("serverId is required for update and delete");
  }

  if (
    (operation.action === "create" || operation.action === "update") &&
    input.payload === undefined
  ) {
    throw new Error("payload is required for create and update");
  }

  return removeUndefinedValues({
    ...operation,
    payload:
      input.payload === undefined
        ? undefined
        : readPayload(operation.entity, input.payload),
  });
}

function readEntity(value: unknown): MobileSyncEntity {
  if (value === "area" || value === "location" || value === "item") {
    return value;
  }

  throw new Error("entity must be area, location, or item");
}

function readAction(value: unknown): MobileSyncAction {
  if (value === "create" || value === "update" || value === "delete") {
    return value;
  }

  throw new Error("action must be create, update, or delete");
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string`);
  }

  return value;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!(key in record)) {
    return undefined;
  }

  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string`);
  }

  return value;
}

function readPayload(
  entity: MobileSyncEntity,
  value: unknown,
): MobileSyncPayload {
  if (!isRecord(value)) {
    throw new Error("payload must be an object");
  }

  if (entity === "area") {
    return {
      name: readPayloadRequiredString(value, "area payload", "name"),
      color: readPayloadRequiredString(value, "area payload", "color"),
    };
  }

  if (entity === "location") {
    return {
      name: readPayloadRequiredString(value, "location payload", "name"),
      areaId: readPayloadNullableString(value, "location payload", "areaId"),
    };
  }

  return {
    name: readPayloadRequiredString(value, "item payload", "name"),
    note: readPayloadString(value, "item payload", "note"),
    expireDate: readPayloadNullableString(value, "item payload", "expireDate"),
    locationId: readPayloadNullableString(value, "item payload", "locationId"),
  };
}

function readPayloadRequiredString(
  record: Record<string, unknown>,
  label: string,
  key: string,
): string {
  const value = readPayloadString(record, label, key);
  if (value.trim() === "") {
    throw new Error(`${label} ${key} must be a non-empty string`);
  }

  return value;
}

function readPayloadString(
  record: Record<string, unknown>,
  label: string,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${label} ${key} must be a string`);
  }

  return value;
}

function readPayloadNullableString(
  record: Record<string, unknown>,
  label: string,
  key: string,
): string | null {
  const value = record[key];
  if (value === null || typeof value === "string") {
    return value;
  }

  throw new Error(`${label} ${key} must be a string or null`);
}

function removeUndefinedValues(
  operation: MobileSyncOperation,
): MobileSyncOperation {
  return Object.fromEntries(
    Object.entries(operation).filter(([, value]) => value !== undefined),
  ) as MobileSyncOperation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

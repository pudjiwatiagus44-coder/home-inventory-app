import type { PostgresQueryClient } from "../auth/postgres-auth-repository";

export type PhotoRepository = {
  createPendingPhoto: (input: {
    householdId: string;
    createdBy: string;
    photoKey: string;
  }) => Promise<void>;
  attachPhotoToItem: (input: {
    itemId: string;
    householdId: string;
    photoKey: string;
    userId: string;
  }) => Promise<boolean>;
  getItemPhotoKey: (input: {
    itemId: string;
    householdId: string;
  }) => Promise<string | null>;
  listExpiredPendingPhotos: (olderThanIso: string) => Promise<string[]>;
  deletePendingPhotos: (photoKeys: string[]) => Promise<void>;
};

export class PhotoRepositoryNotConnectedError extends Error {
  constructor() {
    super("PostgreSQL photo repository is not connected yet");
    this.name = "PhotoRepositoryNotConnectedError";
  }
}

export function createPostgresPhotoRepository(
  client?: PostgresQueryClient,
): PhotoRepository {
  if (!client) {
    return createNotConnectedPhotoRepository();
  }

  return {
    createPendingPhoto: async (input) => {
      await client.query(
        `
          insert into pending_photos (household_id, created_by, photo_key)
          values ($1, $2, $3)
        `,
        [input.householdId, input.createdBy, input.photoKey],
      );
    },
    attachPhotoToItem: async (input) => {
      const pending = await client.query<{ id: string }>(
        `
          select id
          from pending_photos
          where photo_key = $1
            and created_by = $2
            and status = 'pending'
            and created_at > now() - interval '24 hours'
        `,
        [input.photoKey, input.userId],
      );

      if (pending.rows.length === 0) {
        return false;
      }

      const attached = await client.query<{ id: string }>(
        `
          update items
          set photo_key = $3, updated_at = now()
          where id = $1
            and household_id = $2
            and (photo_key is null or photo_key = $3)
          returning id
        `,
        [input.itemId, input.householdId, input.photoKey],
      );

      if (attached.rows.length === 0) {
        return false;
      }

      await client.query(
        `
          update pending_photos
          set status = 'attached'
          where photo_key = $1
        `,
        [input.photoKey],
      );

      return true;
    },
    getItemPhotoKey: async (input) => {
      const result = await client.query<{ photo_key: string | null }>(
        `
          select photo_key
          from items
          where id = $1
            and household_id = $2
        `,
        [input.itemId, input.householdId],
      );

      return result.rows[0]?.photo_key ?? null;
    },
    listExpiredPendingPhotos: async (olderThanIso) => {
      const result = await client.query<{ photo_key: string }>(
        `
          select photo_key
          from pending_photos
          where status = 'pending'
            and created_at < $1::timestamptz
        `,
        [olderThanIso],
      );

      return result.rows.map((row) => row.photo_key);
    },
    deletePendingPhotos: async (photoKeys) => {
      if (photoKeys.length === 0) {
        return;
      }

      await client.query(
        `
          delete from pending_photos
          where photo_key = any($1::text[])
        `,
        [photoKeys],
      );
    },
  };
}

function createNotConnectedPhotoRepository(): PhotoRepository {
  const fail = async () => {
    throw new PhotoRepositoryNotConnectedError();
  };

  return {
    createPendingPhoto: fail,
    attachPhotoToItem: async () => {
      throw new PhotoRepositoryNotConnectedError();
    },
    getItemPhotoKey: async () => {
      throw new PhotoRepositoryNotConnectedError();
    },
    listExpiredPendingPhotos: async () => {
      throw new PhotoRepositoryNotConnectedError();
    },
    deletePendingPhotos: fail,
  };
}

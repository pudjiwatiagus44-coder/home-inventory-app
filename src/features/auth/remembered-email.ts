const REMEMBERED_EMAIL_KEY = "home_inventory_remembered_email";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
  }

  return window.localStorage;
}

export function getSavedEmail(storage: StorageLike = defaultStorage()) {
  return storage.getItem(REMEMBERED_EMAIL_KEY);
}

export function saveEmail(email: string, storage: StorageLike = defaultStorage()) {
  storage.setItem(REMEMBERED_EMAIL_KEY, email);
}

export function clearSavedEmail(storage: StorageLike = defaultStorage()) {
  storage.removeItem(REMEMBERED_EMAIL_KEY);
}

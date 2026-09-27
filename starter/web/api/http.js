export class ApiError extends Error {
  constructor(error, status = 0) {
    super(error.message);
    Object.assign(this, error, { status });
  }
}
export function createHttpApi() {
  let token = null,
    orgId = null,
    refreshPromise = null,
    generation = 0;
  async function raw(method, path, body, bearer = token) {
    let response;
    try {
      response = await fetch(`/v1${path}`, {
        method,
        credentials: "same-origin",
        headers: {
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError({
        code: "NETWORK",
        message: "Cannot reach RemoteOps. Check your connection and try again.",
      });
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        {
          code: "RESPONSE",
          message: "The server returned an unreadable response. Please retry.",
        },
        response.status,
      );
    }
    if (!response.ok)
      throw new ApiError(
        data.error || { message: "Request failed", code: "RESPONSE" },
        response.status,
      );
    return data;
  }
  function remember(data) {
    token = data.token;
    orgId = data.orgId || data.org?.id;
    return data;
  }
  async function refresh() {
    if (!refreshPromise) {
      const current = generation;
      const perform = () =>
        raw("POST", "/auth/refresh", orgId ? { orgId } : {}, null);
      refreshPromise = (
        navigator.locks
          ? navigator.locks.request("remoteops-refresh", perform)
          : perform()
      )
        .then((data) => {
          if (current !== generation)
            throw new ApiError({
              code: "CANCELLED",
              message: "Organization changed. Please retry.",
            });
          return remember(data);
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }
  return {
    async login(body) {
      generation++;
      return remember(await raw("POST", "/auth/login", body, null));
    },
    async restore(preferredOrgId) {
      if (preferredOrgId) orgId = preferredOrgId;
      return refresh();
    },
    async switchOrg(id) {
      if (refreshPromise) await refreshPromise;
      generation++;
      return remember(await raw("POST", "/auth/token", { orgId: id }));
    },
    async logout() {
      try {
        await raw("POST", "/auth/logout", {});
      } finally {
        generation++;
        token = null;
        orgId = null;
      }
    },
    async request(method, path, body) {
      const current = generation;
      try {
        return await raw(method, path, body);
      } catch (error) {
        if (
          current === generation &&
          (error.code === "TOKEN_STALE" || (error.status === 401 && token))
        ) {
          await refresh();
          return raw(method, path, body);
        }
        throw error;
      }
    },
  };
}

import http from "node:http";
// Additional behavior tests. Uses only candidate schema/fixtures and our implementation.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { openDatabase } from "../server/db.js";
import { signToken } from "../server/auth.js";
const file = "hardening.db",
  port = 8126,
  base = `http://127.0.0.1:${port}/v1`;
execFileSync(process.execPath, ["scripts/load-db.js"], {
  env: { ...process.env, DATABASE_FILE: file },
  stdio: "ignore",
});
const db = openDatabase(file),
  server = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      DATABASE_FILE: file,
      PORT: String(port),
      NODE_ENV: "production",
      JWT_SECRET: "hardening-secret",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
let count = 0;
const check = (label, actual, expected) => {
  assert.deepEqual(actual, expected, label);
  count++;
  console.log(`ok ${label}`);
};
async function call(method, path, token, body, cookie) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    body: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const login = async (email = "dana@example.test", orgId) =>
  call("POST", "/auth/login", null, {
    email,
    password: "demo1234",
    ...(orgId ? { orgId } : {}),
  });
try {
  for (let n = 0; n < 100; n++) {
    try {
      await fetch(base + "/auth/me");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  const owner = (await login()).body.token;
  const a = "/orgs/org_acme",
    g = "/orgs/org_globex";
  const malformed = await call("GET", a + "/devices", "not.a.token");
  check("malformed bearer is 401", malformed.status, 401);
  const claims = {
    iss: "remoteops",
    aud: "remoteops-api",
    sub: "usr_dana",
    org: "org_acme",
    role: "owner",
    pv: 999,
    jti: "future",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  };
  check(
    "future permission version is stale",
    (await call("GET", a + "/devices", signToken(claims, "hardening-secret")))
      .body.error.code,
    "TOKEN_STALE",
  );
  check(
    "cross-organization route is hidden",
    (await call("GET", g + "/devices", owner)).status,
    404,
  );
  check(
    "cross-organization device is hidden",
    (await call("GET", a + "/devices/dev_globex_desk_01", owner)).status,
    404,
  );
  const session = await call("POST", a + "/sessions", owner, {
    deviceId: "dev_qa_android_01",
    mode: "control",
  });
  check("control starts", session.status, 201);
  const pair = await Promise.all([
    call("POST", a + "/sessions", owner, {
      deviceId: "dev_kiosk_lobby_01",
      mode: "control",
    }),
    call("POST", a + "/sessions", owner, {
      deviceId: "dev_kiosk_lobby_01",
      mode: "terminal",
    }),
  ]);
  check(
    "concurrent exclusive starts have one winner",
    pair.map((r) => r.status).sort(),
    [201, 409],
  );
  const views = await Promise.all([
    call("POST", a + "/sessions", owner, {
      deviceId: "dev_qa_android_01",
      mode: "view",
    }),
    call("POST", a + "/sessions", owner, {
      deviceId: "dev_qa_android_01",
      mode: "view",
    }),
  ]);
  check(
    "view is nonexclusive",
    views.map((r) => r.status),
    [201, 201],
  );
  db.prepare("UPDATE sessions SET expires_at=? WHERE id=?").run(
    new Date(Date.now() - 1000).toISOString(),
    session.body.id,
  );
  check(
    "expired session ends on read",
    (await call("GET", `/sessions/${session.body.id}`, owner)).body.end_reason,
    "session_expired",
  );
  check(
    "expired exclusive slot is reusable",
    (
      await call("POST", a + "/sessions", owner, {
        deviceId: "dev_qa_android_01",
        mode: "control",
      })
    ).status,
    201,
  );
  const invite = await call("POST", a + "/invites", owner, {
    email: "  Concurrent@Example.test ",
    role: "viewer",
  });
  check(
    "invitation normalizes email",
    invite.body.email,
    "concurrent@example.test",
  );
  check(
    "duplicate live invitation conflicts",
    (
      await call("POST", a + "/invites", owner, {
        email: "concurrent@example.test",
        role: "viewer",
      })
    ).status,
    409,
  );
  const acceptance = await Promise.all([
    call("POST", `/invites/${invite.body.inviteToken}/accept`, null, {
      name: "Concurrent",
      password: "strong-password",
    }),
    call("POST", `/invites/${invite.body.inviteToken}/accept`, null, {
      name: "Concurrent",
      password: "strong-password",
    }),
  ]);
  check(
    "concurrent invitation redemption is single-use",
    acceptance.map((r) => r.status).sort(),
    [200, 409],
  );
  const accepted = acceptance.find((r) => r.status === 200).body,
    userId = accepted.user.id;
  check(
    "invite hash is not raw token",
    db.prepare("SELECT token_hash FROM invites WHERE id=?").get(invite.body.id)
      .token_hash === invite.body.inviteToken,
    false,
  );
  const grant = await call("POST", a + "/grants", owner, {
    userId,
    effect: "allow",
    deviceId: "dev_lab_mac_01",
    permissions: ["device:control", "session:start"],
  });
  check("scoped grant created", grant.status, 201);
  check(
    "old access invalidated by grant",
    (await call("GET", a + "/devices", accepted.token)).body.error.code,
    "TOKEN_STALE",
  );
  const user = (
    await call("POST", "/auth/login", null, {
      email: "concurrent@example.test",
      password: "strong-password",
    })
  ).body.token;
  check(
    "new authority limited to exact device",
    (
      await call("POST", a + "/sessions", user, {
        deviceId: "dev_build_server_01",
        mode: "control",
      })
    ).status,
    403,
  );
  const active = await call("POST", a + "/sessions", user, {
    deviceId: "dev_lab_mac_01",
    mode: "control",
  });
  check("granted authority starts session", active.status, 201);
  check(
    "revoke succeeds",
    (await call("DELETE", a + `/grants/${grant.body.id}`, owner)).status,
    200,
  );
  check(
    "session survives revocation",
    (await call("GET", `/sessions/${active.body.id}`, owner)).body.state,
    "active",
  );
  const revokeTwice = await call(
    "DELETE",
    a + `/grants/${grant.body.id}`,
    owner,
  );
  check("second revoke invisible", revokeTwice.status, 404);
  await call("POST", a + `/members/${userId}/suspend`, owner, {});
  check(
    "suspension ends session",
    (await call("GET", `/sessions/${active.body.id}`, owner)).body.end_reason,
    "user_suspended",
  );
  check(
    "suspended identity refused on ungated route",
    (await call("GET", "/orgs", user)).status,
    403,
  );
  await call("DELETE", a + `/members/${userId}/suspend`, owner);
  await call("DELETE", a + `/members/${userId}`, owner);
  check(
    "removed identity gets 401",
    (await call("GET", "/orgs", user)).status,
    401,
  );
  check(
    "removal preserves global user",
    !!db.prepare("SELECT id FROM users WHERE id=?").get(userId),
    true,
  );
  const rehire = await call("POST", a + "/invites", owner, {
    email: "concurrent@example.test",
    role: "viewer",
  });
  check(
    "existing account password cannot be replaced",
    (
      await call("POST", `/invites/${rehire.body.inviteToken}/accept`, null, {
        name: "Takeover",
        password: "different-password",
      })
    ).status,
    401,
  );
  check(
    "existing user can rejoin with own password",
    (
      await call("POST", `/invites/${rehire.body.inviteToken}/accept`, null, {
        name: "Concurrent",
        password: "strong-password",
      })
    ).status,
    200,
  );
  const effective = await call(
    "GET",
    a + `/users/${userId}/effective?deviceId=dev_lab_mac_01`,
    owner,
  );
  check(
    "rehire does not revive old grant",
    effective.body.permissions["device:control"].effect,
    "deny",
  );
  const expired = await call("POST", a + "/invites", owner, {
    email: "expired@example.test",
    role: "viewer",
  });
  db.prepare("UPDATE invites SET expires_at=? WHERE id=?").run(
    new Date(0).toISOString(),
    expired.body.id,
  );
  check(
    "expired invitation is gone",
    (await call("GET", `/invites/${expired.body.inviteToken}`)).status,
    410,
  );
  check(
    "expired invitation can be replaced",
    (
      await call("POST", a + "/invites", owner, {
        email: "expired@example.test",
        role: "viewer",
      })
    ).status,
    201,
  );
  const fresh = await call("POST", "/orgs", owner, {
    name: "Hardening solo",
    theme: "custom-amber",
  });
  const scoped = (
    await call("POST", "/auth/token", owner, { orgId: fresh.body.id })
  ).body.token;
  check(
    "last owner cannot suspend self",
    (
      await call(
        "POST",
        `/orgs/${fresh.body.id}/members/usr_dana/suspend`,
        scoped,
        {},
      )
    ).body.error.code,
    "LAST_OWNER",
  );
  check(
    "self-transfer is refused",
    (
      await call("POST", a + "/devices/dev_lab_win_01/transfer", owner, {
        orgId: "org_acme",
      })
    ).status,
    400,
  );
  check(
    "transfer to unauthorized destination refused",
    (
      await call("POST", a + "/devices/dev_lab_win_01/transfer", owner, {
        orgId: "org_globex",
      })
    ).status,
    403,
  );
  check(
    "authorized transfer succeeds",
    (
      await call("POST", a + "/devices/dev_lab_win_01/transfer", owner, {
        orgId: fresh.body.id,
      })
    ).status,
    200,
  );
  check(
    "transferred device disappears from source",
    (await call("GET", a + "/devices/dev_lab_win_01", owner)).status,
    404,
  );
  const ownerLogin = await login();
  const refresh = await call(
    "POST",
    "/auth/refresh",
    null,
    {},
    ownerLogin.cookie,
  );
  check("refresh rotates", refresh.status, 200);
  check(
    "old refresh replay rejected",
    (await call("POST", "/auth/refresh", null, {}, ownerLogin.cookie)).status,
    401,
  );
  check(
    "replay revokes new member of family",
    (await call("POST", "/auth/refresh", null, {}, refresh.cookie)).status,
    401,
  );
  const logoutLogin = await login();
  check(
    "logout succeeds",
    (await call("POST", "/auth/logout", null, {}, logoutLogin.cookie)).status,
    200,
  );
  check(
    "logged-out refresh refused",
    (await call("POST", "/auth/refresh", null, {}, logoutLogin.cookie)).status,
    401,
  );
  // Send a body in two pieces to exercise revocation between middleware and mutation.
  const adminToken = (await login("admin@acme.test")).body.token;
  let finishBody;
  const pending = new Promise((resolve, reject) => {
    const req = http.request(
      `${base}${a}/devices/dev_build_server_01`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: JSON.parse(body) }),
        );
      },
    );
    req.on("error", reject);
    req.write('{"name":');
    finishBody = () => req.end('"should-not-be-renamed"}');
  });
  await new Promise((r) => setTimeout(r, 50));
  await call("PATCH", `${a}/members/usr_acme_admin`, owner, { role: "viewer" });
  finishBody();
  check(
    "revocation during body read blocks mutation",
    (await pending).body.error.code,
    "TOKEN_STALE",
  );
  check(
    "revoked mutation made no change",
    db.prepare("SELECT name FROM devices WHERE id='dev_build_server_01'").get()
      .name,
    "build-server-01",
  );
  const event = db.prepare("SELECT id FROM audit_events LIMIT 1").get();
  assert.throws(() =>
    db
      .prepare("UPDATE audit_events SET result='deny' WHERE id=?")
      .run(event.id),
  );
  count++;
  assert.throws(() =>
    db.prepare("DELETE FROM audit_events WHERE id=?").run(event.id),
  );
  count++;
  check(
    "denial audit survives rollback",
    db.prepare("SELECT count(*) n FROM audit_events WHERE result='deny'").get()
      .n > 0,
    true,
  );
  console.log(`ALL PASS — ${count} hardening assertions`);
} finally {
  db.close();
  server.kill();
  await new Promise((r) => server.once("exit", r));
  for (const suffix of ["", "-wal", "-shm"])
    rmSync(file + suffix, { force: true });
}

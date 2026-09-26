import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { openDatabase } from "../server/db.js";
import { resolveDevices } from "../server/permissions.js";
const db = openDatabase(":memory:");
db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
db.exec(readFileSync(new URL("../db/reference.sql", import.meta.url), "utf8"));
db.prepare(
  "INSERT INTO users(id,email,name,password_hash) VALUES('u','measure@example.test','Measure','unused')",
).run();
db.prepare(
  "INSERT INTO organizations(id,name,theme) VALUES('o','Measure','cobalt')",
).run();
db.prepare(
  "INSERT INTO memberships(id,org_id,user_id,role,status) VALUES('m','o','u','owner','active')",
).run();
let queries = 0;
const counted = {
  prepare(sql) {
    queries++;
    return db.prepare(sql);
  },
};
for (const count of [10, 100, 500]) {
  db.transaction(() => {
    db.prepare("DELETE FROM devices").run();
    const insert = db.prepare(
      "INSERT INTO devices(id,org_id,name,kind) VALUES(?,'o',?,'linux')",
    );
    for (let i = 0; i < count; i++) insert.run(`d${i}`, `Device ${i}`);
  })();
  const ids = db
    .prepare("SELECT id FROM devices")
    .all()
    .map((d) => d.id);
  queries = 0;
  const begin = performance.now();
  for (let i = 0; i < 20; i++)
    resolveDevices(counted, { userId: "u", orgId: "o", deviceIds: ids });
  console.log(
    JSON.stringify({
      devices: count,
      queriesPerResolution: queries / 20,
      meanMilliseconds: Number(((performance.now() - begin) / 20).toFixed(2)),
    }),
  );
}
db.close();

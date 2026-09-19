import { execFileSync } from "node:child_process";

const base = "http://127.0.0.1:3000";
const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const emails = {
  owner: `smoke-owner-${suffix}@test.local`,
  member: `smoke-member-${suffix}@test.local`,
};
const password = "SmokePass123!";

const failures = [];
function check(label, cond, detail) {
  if (cond) {
    console.log(`PASS ${label}`);
  } else {
    failures.push(label);
    console.error(`FAIL ${label} :: ${JSON.stringify(detail ?? null)}`);
  }
}

function makeClient() {
  let cookie = "";
  return async function req(path, { method = "GET", body } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      if (c.trimStart().startsWith("home_inventory_session=")) {
        cookie = c.split(";")[0];
      }
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      // no json body
    }
    return { status: res.status, json };
  };
}

function psql(sql) {
  return execFileSync("sudo", ["-u", "postgres", "psql", "-d", "home_inventory_test", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
  });
}

async function register(client, email) {
  const r = await client("/api/auth/register", {
    method: "POST",
    body: { email, password },
  });
  check(`register ${email}`, r.status === 200 && r.json?.ok && !!r.json?.userId, r.json);
  return r.json?.userId;
}

async function main() {
  const owner = makeClient();
  const ownerId = await register(owner, emails.owner);

  let r = await owner("/api/inventory/dashboard");
  const houseA = r.json?.data?.household;
  check("owner dashboard role=owner", r.status === 200 && houseA?.role === "owner", houseA);
  const householdA = houseA?.id;

  const member = makeClient();
  const memberId = await register(member, emails.member);
  r = await member("/api/inventory/dashboard");
  const houseB = r.json?.data?.household;
  const householdB = houseB?.id;

  r = await owner("/api/family/invitations", {
    method: "POST",
    body: { householdId: householdA },
  });
  const token = r.json?.data?.token;
  check("owner creates invitation", r.status === 200 && !!token, r.json);

  r = await member(`/api/join/${encodeURIComponent(token)}`);
  check("member reads join info", r.status === 200 && r.json?.ok, r.json);

  r = await member(`/api/join/${encodeURIComponent(token)}/apply`, { method: "POST" });
  check("member applies", r.status === 200, r.json);

  r = await owner(`/api/family/join-requests?householdId=${encodeURIComponent(householdA)}`);
  const pending = (r.json?.data ?? []).find((x) => x.user_id === memberId);
  check("owner sees pending request", r.status === 200 && !!pending, r.json?.data);
  const requestId = pending?.id;

  r = await owner(`/api/family/join-requests/${encodeURIComponent(requestId)}/approve`, { method: "POST" });
  check("owner approves", r.status === 200, r.json);

  r = await owner(`/api/family/members?householdId=${encodeURIComponent(householdA)}`);
  let memberRow = (r.json?.data ?? []).find((x) => x.user_id === memberId);
  check("member row role=member", r.status === 200 && memberRow?.role === "member", memberRow);

  r = await member(`/api/inventory/dashboard?householdId=${encodeURIComponent(householdA)}`);
  check("member can read joined household", r.status === 200 && r.json?.data?.household?.role === "member", r.json?.data?.household);

  r = await owner(`/api/family/members/${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    body: { householdId: householdA, role: "readonly" },
  });
  check("owner PATCH readonly", r.status === 200, r.json);

  r = await owner(`/api/family/members?householdId=${encodeURIComponent(householdA)}`);
  memberRow = (r.json?.data ?? []).find((x) => x.user_id === memberId);
  check("member row role=readonly", memberRow?.role === "readonly", memberRow);

  r = await member(`/api/inventory/dashboard?householdId=${encodeURIComponent(householdA)}`);
  check("readonly can still read", r.status === 200 && r.json?.data?.household?.role === "readonly", r.json?.data?.household);

  r = await owner(`/api/family/members/${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    body: { householdId: householdA, role: "member" },
  });
  check("owner PATCH back to member", r.status === 200, r.json);

  r = await member(`/api/family/members/${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    body: { householdId: householdA, role: "readonly" },
  });
  check("member cannot self-demote (403)", r.status === 403, r.json);

  r = await owner(`/api/family/members/${encodeURIComponent(ownerId)}`, {
    method: "PATCH",
    body: { householdId: householdA, role: "readonly" },
  });
  check("owner cannot self-demote (403)", r.status === 403, r.json);

  r = await owner(`/api/family/members/${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    body: { role: "readonly" },
  });
  check("PATCH missing householdId -> 400", r.status === 400, r.json);

  r = await owner(`/api/family/members/${encodeURIComponent(memberId)}`, {
    method: "DELETE",
    body: {},
  });
  check("DELETE missing householdId -> 400", r.status === 400, r.json);

  console.log("DB demote member in own household to readonly");
  psql(
    `update household_members set role='readonly' where household_id='${householdB}' and user_id='${memberId}'`,
  );
  const member2 = makeClient();
  r = await member2("/api/auth/login", {
    method: "POST",
    body: { email: emails.member, password },
  });
  check("member login", r.status === 200, r.json);

  r = await member2("/api/inventory/areas", {
    method: "POST",
    body: { name: "只读不应写入" },
  });
  check("readonly write area -> 403", r.status === 403, r.json);

  r = await member2("/api/inventory/dashboard");
  check(
    "member own household role now readonly",
    r.status === 200 && r.json?.data?.household?.role === "readonly",
    r.json?.data?.household,
  );
  psql(
    `update household_members set role='owner' where household_id='${householdB}' and user_id='${memberId}'`,
  );
  console.log("DB role restored");

  r = await owner(`/api/family/members/${encodeURIComponent(memberId)}`, {
    method: "DELETE",
    body: { householdId: householdA },
  });
  check("owner removes member", r.status === 200, r.json);

  r = await member(`/api/inventory/dashboard?householdId=${encodeURIComponent(householdA)}`);
  check("removed member loses access (404)", r.status === 404, r.json);

  r = await owner(`/api/family/members?householdId=${encodeURIComponent(householdA)}`);
  check(
    "members list no longer contains member",
    !(r.json?.data ?? []).some((x) => x.user_id === memberId),
    r.json?.data,
  );

  console.log("DB cleanup test users");
  psql(
    "delete from household_join_requests where user_id in (select id from users where email like 'smoke-%@test.local') or household_id in (select id from households where owner_user_id in (select id from users where email like 'smoke-%@test.local'));",
  );
  psql(
    "delete from household_invitations where household_id in (select id from households where owner_user_id in (select id from users where email like 'smoke-%@test.local'));",
  );
  psql("delete from users where email like 'smoke-%@test.local';");
  const remaining = psql("select count(*) from users where email like 'smoke-%@test.local';");
  check("test users cleaned", remaining.trim().split("\n").pop().trim() === "0", remaining);

  if (failures.length) {
    console.error(`SMOKE FAILED: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("SMOKE ALL PASS");
}

main().catch((error) => {
  console.error("SMOKE ERROR", error);
  process.exit(1);
});

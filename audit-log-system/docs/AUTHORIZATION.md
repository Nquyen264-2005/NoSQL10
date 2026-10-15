# ARCHITECTURE & SPECIFICATION: AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC)

## 1. Overview
The Audit Log Monitoring System implements an enterprise-grade Authentication and Role-Based Access Control (RBAC) architecture built on top of **Apache Cassandra 4.1** NoSQL distributed wide-column storage and stateless **JSON Web Tokens (JWT)**.

---

## 2. Role-Permission Matrix

The system specifies three explicit roles with hierarchical operational scopes:

| Endpoint Path | HTTP Method | ADMIN | OPERATOR | VIEWER | Functional Description |
|:---|:---:|:---:|:---:|:---:|:---|
| `/api/health` | GET | `ALLOW` | `ALLOW` | `ALLOW` | Public load-balancer cluster heartbeat |
| `/api/auth/register` | POST | `ALLOW` | `ALLOW` | `ALLOW` | Public self-registration (Strictly creates `VIEWER`) |
| `/api/auth/login` | POST | `ALLOW` | `ALLOW` | `ALLOW` | Public authentication (bcrypt check + JWT issuance) |
| `/api/auth/logout` | POST | `ALLOW` | `ALLOW` | `ALLOW` | Authenticated session teardown & audit logging |
| `/api/auth/me` | GET | `ALLOW` | `ALLOW` | `ALLOW` | Read authenticated user session profile |
| `/api/auth/change-password` | PUT | `ALLOW` | `ALLOW` | `ALLOW` | Authenticated user change own password |
| `/api/logs` | GET | `ALLOW` | `ALLOW` | `ALLOW` | Read & filter audit logs (Multi-day scatter-gather) |
| `/api/logs/detail` | GET | `ALLOW` | `ALLOW` | `ALLOW` | Query single log details |
| `/api/logs/stats/summary` | GET | `ALLOW` | `ALLOW` | `ALLOW` | Read system activity summary & log count metrics |
| `/api/logs/:id` | GET | `ALLOW` | `ALLOW` | `ALLOW` | Query single log by UUID via `audit_logs_by_id` |
| `/api/logs` (Ingestion) | POST | `ALLOW` | `ALLOW` | `DENY (403)` | Ingest new audit event (Dual-write engine) |
| `/api/logs/ttl-demo` | POST | `ALLOW` | `DENY (403)` | `DENY (403)` | Create 30-second TTL demonstration log |
| `/api/logs/ttl-status/:id` | GET | `ALLOW` | `DENY (403)` | `DENY (403)` | Inspect Cassandra native TTL remaining countdown |
| `/api/services` | GET | `ALLOW` | `ALLOW` | `DENY (403)` | Read active microservice catalog |
| `/api/services/:id` | GET | `ALLOW` | `ALLOW` | `DENY (403)` | Read single service metadata |
| `/api/services` | POST | `ALLOW` | `DENY (403)` | `DENY (403)` | Register new microservice |
| `/api/services/:id` | PUT | `ALLOW` | `DENY (403)` | `DENY (403)` | Update service configuration |
| `/api/services/:id` | DELETE | `ALLOW` | `DENY (403)` | `DENY (403)` | Delete service from catalog |
| `/api/users` | GET | `ALLOW` | `DENY (403)` | `DENY (403)` | List all user accounts (SafeUser without hash) |
| `/api/users` | POST | `ALLOW` | `DENY (403)` | `DENY (403)` | Admin create new user with arbitrary role |
| `/api/users/:id` | PUT | `ALLOW` | `DENY (403)` | `DENY (403)` | Admin update user basic profile (Name, Email) |
| `/api/users/:id` | DELETE | `ALLOW` | `DENY (403)` | `DENY (403)` | Admin permanently delete user account |
| `/api/users/:id/role` | PATCH | `ALLOW` | `DENY (403)` | `DENY (403)` | Admin reassign user role |
| `/api/users/:id/status` | PATCH | `ALLOW` | `DENY (403)` | `DENY (403)` | Admin toggle status (`ACTIVE` / `INACTIVE`) |
| `/api/system/status` | GET | `ALLOW` | `DENY (403)` | `DENY (403)` | View Cassandra cluster node health & host info |
| `/api/demo/*` | POST/PUT/DEL | `ALLOW` | `ALLOW` | `DENY (403)` | Trigger live simulated microservice operations |

---

## 3. Cassandra User Data Modeling & Query-First Design

### CQL Schema Definition (`database/06_users_rbac.cql`):
```cql
CREATE TABLE IF NOT EXISTS audit_log_system.users (
    user_id uuid,
    username text,
    password_hash text,
    full_name text,
    email text,
    role text,
    status text,
    created_at timestamp,
    updated_at timestamp,
    PRIMARY KEY (username)
) WITH comment = 'Application user accounts with bcrypt hashed passwords and RBAC roles';

CREATE INDEX IF NOT EXISTS idx_users_id ON audit_log_system.users (user_id);
```

### Why Query-First for User Authentication?
1. **Zero `ALLOW FILTERING`**: Because authentication queries look up by `username` during every login (`SELECT * FROM audit_log_system.users WHERE username = ?`), `username` is assigned as the single **Partition Key**.
2. **Direct Hash Ring Lookup**: Cassandra hashes `username` via Murmur3Partitioner to locate the exact node and SSTable row directly ($O(1)$ token lookup).
3. **Case-Insensitive Normalization**: All usernames are sanitized via `.trim().toLowerCase()` prior to storage and lookup, guaranteeing that `admin`, `Admin`, and `ADMIN` map to the identical partition.

---

## 4. HTTP 401 Unauthorized vs HTTP 403 Forbidden

The backend strictly separates authentication failure from permission rejection:

### HTTP 401 Unauthorized
Emitted when the requester cannot be reliably authenticated:
- Missing `Authorization` header or missing `Bearer ` token scheme.
- Malformed, forged, or unparseable JWT signature (`JsonWebTokenError`).
- Token has expired past its 24-hour lifetime (`TokenExpiredError`).
- User account exists but is marked as `status = 'INACTIVE'`.
- Login failed due to wrong password or nonexistent user (`Invalid username or password`).

### HTTP 403 Forbidden
Emitted when the requester is authenticated and active, but lacks permission for the endpoint:
- Token is verified and belongs to an `ACTIVE` user.
- The user's role (e.g. `VIEWER` or `OPERATOR`) is not included in the route's `authorize(...)` role list.
- Frontend displays the dedicated `AccessDeniedPage` showing current role vs required roles.

---

## 5. Security & Protection Policies

### 5.1 Password Security
- Passwords must be at least **8 characters** long (validated in Backend, Controllers, and Frontend forms).
- Stored using `bcryptjs` with salt rounds cost factor **10**.
- The `password_hash` is **NEVER** returned across any REST API endpoint (`SafeUser` type omits `password_hash`).
- Plaintext passwords and hashes are strictly forbidden from `console.log`, error messages, and Cassandra Audit Logs.

### 5.2 Username Uniqueness & Case-Insensitive Protection
- Usernames are normalized: `cleanUsername = username.trim().toLowerCase()`.
- Registering `ADMIN` when `admin` exists is rejected with **HTTP 409 Conflict**.
- Validation is enforced on both backend and database levels.

### 5.3 Public Registration Safeguards
- Any payload submitted to `POST /api/auth/register` (even if tampering with `role: 'ADMIN'`) is overridden by the backend: `role = 'VIEWER'`.
- Creating `ADMIN` or `OPERATOR` roles requires an authenticated `ADMIN` session via `POST /api/users`.

### 5.4 Administrator Self-Protection & Last Admin Invariant
1. **Self-Deletion Blocked**: An administrator cannot delete their own account (`HTTP 400 Bad Request`).
2. **Self-Deactivation Blocked**: An administrator cannot set their own status to `INACTIVE` (`HTTP 400 Bad Request`).
3. **Self-Demotion Blocked**: An administrator cannot demote their own role away from `ADMIN` (`HTTP 400 Bad Request`).
4. **Last Active Admin Safeguard**: `userService.countActiveAdmins()` ensures that if only one active `ADMIN` remains, any attempt to delete, deactivate, or demote that administrator throws an error, preventing total cluster lock-out.

### 5.5 Audit Trail for User Governance
All administrative and authentication events generate immutable Audit Logs in Cassandra:
- `REGISTER_USER`
- `LOGIN_SUCCESS`
- `LOGIN_FAILED` (Omits entered password)
- `LOGOUT`
- `CHANGE_PASSWORD` (Omits old and new passwords)
- `CHANGE_USER_ROLE` (Records `old_role` and `new_role`)
- `DISABLE_USER` / `ENABLE_USER` (Records target username and status)
- `DELETE_USER` (Records deleted username and prior role)

---

## 6. Stateless JWT Architecture & Logout Semantics

### Logout Behavior
Because this system utilizes stateless JSON Web Tokens without an in-memory/Redis distributed blacklist:
1. `POST /api/auth/logout` records a `LOGOUT` audit event in Cassandra (`audit_logs` table).
2. The client application deletes the JWT token from browser storage (`localStorage.removeItem('audit_jwt_token')`).
3. Future requests from that client will not carry the token and will be rejected with HTTP 401.
4. *Architectural Note*: In a pure stateless JWT design, the token remains cryptographically valid until its expiration time unless a token revocation list/blacklist is introduced.

---

## 7. Token Storage Security Note

> [!NOTE]
> **Token Storage in Academic / Demonstration Scope vs Production:**
> - In this demonstration project, `localStorage` is used to store the JWT token for seamless cross-tab browser interaction and straightforward UI debugging.
> - **Production Recommendation:** For production environments subject to sensitive security audits, tokens should ideally be transferred via **HttpOnly + Secure + SameSite=Strict Cookies**. This architecture protects authentication tokens from Cross-Site Scripting (XSS) attacks while preventing Cross-Site Request Forgery (CSRF).

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
const cassandra_js_1 = require("../config/cassandra.js");
class UserService {
    // In-memory store synchronized with Cassandra
    users = new Map();
    initialized = false;
    constructor() {
        this.seedDefaultUsers();
    }
    /**
     * Pre-seed standard demo accounts with bcrypt hash (cost 10)
     */
    seedDefaultUsers() {
        const defaultUsers = [
            {
                username: 'admin',
                pass: 'admin123',
                full_name: 'System Administrator',
                email: 'admin@auditlog.internal',
                role: 'ADMIN',
                status: 'ACTIVE',
            },
            {
                username: 'operator',
                pass: 'operator123',
                full_name: 'Log Operations Specialist',
                email: 'operator@auditlog.internal',
                role: 'OPERATOR',
                status: 'ACTIVE',
            },
            {
                username: 'viewer',
                pass: 'viewer123',
                full_name: 'Security Auditor Viewer',
                email: 'viewer@auditlog.internal',
                role: 'VIEWER',
                status: 'ACTIVE',
            },
        ];
        for (const u of defaultUsers) {
            const hash = bcryptjs_1.default.hashSync(u.pass, 10);
            const user = {
                user_id: (0, uuid_1.v4)(),
                username: u.username.toLowerCase(),
                password_hash: hash,
                full_name: u.full_name,
                email: u.email,
                role: u.role,
                status: u.status,
                created_at: new Date('2026-10-01T00:00:00.000Z'),
                updated_at: new Date('2026-10-01T00:00:00.000Z'),
            };
            this.users.set(user.username, user);
        }
    }
    /**
     * Sync table and demo accounts to Cassandra if online
     */
    async initDb() {
        if (this.initialized)
            return;
        try {
            const client = (0, cassandra_js_1.getCassandraClient)();
            // Ensure users table exists in Cassandra
            await client.execute(`
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
      `);
            await client.execute(`
        CREATE INDEX IF NOT EXISTS idx_users_id ON audit_log_system.users (user_id);
      `);
            // Read existing users from Cassandra
            const res = await client.execute('SELECT * FROM audit_log_system.users');
            if (res.rows.length > 0) {
                for (const row of res.rows) {
                    const user = {
                        user_id: row.user_id ? row.user_id.toString() : (0, uuid_1.v4)(),
                        username: row.username,
                        password_hash: row.password_hash,
                        full_name: row.full_name || row.username,
                        email: row.email || `${row.username}@auditlog.internal`,
                        role: row.role || 'VIEWER',
                        status: row.status || 'ACTIVE',
                        created_at: row.created_at || new Date(),
                        updated_at: row.updated_at || new Date(),
                    };
                    this.users.set(user.username, user);
                }
            }
            else {
                // Persist default demo users to Cassandra
                for (const user of this.users.values()) {
                    await this.persistToCassandra(user);
                }
            }
            this.initialized = true;
        }
        catch {
            // If Cassandra is offline, memory fallback is already initialized
        }
    }
    async persistToCassandra(user) {
        try {
            const client = (0, cassandra_js_1.getCassandraClient)();
            const query = `
        INSERT INTO audit_log_system.users (
          user_id, username, password_hash, full_name, email, role, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
            await client.execute(query, [
                user.user_id,
                user.username,
                user.password_hash,
                user.full_name,
                user.email,
                user.role,
                user.status,
                user.created_at,
                user.updated_at,
            ], { prepare: true });
        }
        catch {
            // Ignored if Cassandra offline
        }
    }
    async deleteFromCassandra(username) {
        try {
            const client = (0, cassandra_js_1.getCassandraClient)();
            await client.execute('DELETE FROM audit_log_system.users WHERE username = ?', [username], { prepare: true });
        }
        catch {
            // Ignored if Cassandra offline
        }
    }
    /**
     * Find user by username
     */
    async findByUsername(username) {
        await this.initDb();
        const cleanUsername = username.trim().toLowerCase();
        const cached = this.users.get(cleanUsername);
        if (cached)
            return cached;
        try {
            const client = (0, cassandra_js_1.getCassandraClient)();
            const res = await client.execute('SELECT * FROM audit_log_system.users WHERE username = ?', [cleanUsername], {
                prepare: true,
            });
            const row = res.first();
            if (!row)
                return null;
            const user = {
                user_id: row.user_id.toString(),
                username: row.username,
                password_hash: row.password_hash,
                full_name: row.full_name,
                email: row.email,
                role: row.role,
                status: row.status,
                created_at: row.created_at,
                updated_at: row.updated_at,
            };
            this.users.set(user.username, user);
            return user;
        }
        catch {
            return null;
        }
    }
    /**
     * Find user by ID
     */
    async findById(userId) {
        await this.initDb();
        for (const u of this.users.values()) {
            if (u.user_id === userId)
                return u;
        }
        return null;
    }
    /**
     * Get all users (Safe version without password hash)
     */
    async getAllUsers() {
        await this.initDb();
        return Array.from(this.users.values()).map(this.toSafeUser);
    }
    /**
     * Register or Create a new user
     */
    async createUser(data) {
        await this.initDb();
        const cleanUsername = data.username.trim().toLowerCase();
        if (this.users.has(cleanUsername)) {
            throw new Error(`Username '${cleanUsername}' already exists`);
        }
        if (!data.password || data.password.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }
        const salt = bcryptjs_1.default.genSaltSync(10);
        const password_hash = bcryptjs_1.default.hashSync(data.password, salt);
        const newUser = {
            user_id: (0, uuid_1.v4)(),
            username: cleanUsername,
            password_hash,
            full_name: data.full_name?.trim() || cleanUsername,
            email: data.email?.trim().toLowerCase() || `${cleanUsername}@auditlog.internal`,
            role: data.role || 'VIEWER',
            status: data.status || 'ACTIVE',
            created_at: new Date(),
            updated_at: new Date(),
        };
        this.users.set(cleanUsername, newUser);
        await this.persistToCassandra(newUser);
        return this.toSafeUser(newUser);
    }
    /**
     * Count how many active ADMIN accounts exist
     */
    async countActiveAdmins() {
        await this.initDb();
        let count = 0;
        for (const u of this.users.values()) {
            if (u.role === 'ADMIN' && u.status === 'ACTIVE') {
                count++;
            }
        }
        return count;
    }
    /**
     * Update user details (Full Name, Email)
     */
    async updateUser(userId, data) {
        const user = await this.findById(userId);
        if (!user)
            throw new Error('User not found');
        if (data.full_name !== undefined)
            user.full_name = data.full_name.trim();
        if (data.email !== undefined)
            user.email = data.email.trim().toLowerCase();
        user.updated_at = new Date();
        this.users.set(user.username, user);
        await this.persistToCassandra(user);
        return this.toSafeUser(user);
    }
    /**
     * Change user role (ADMIN only)
     */
    async changeRole(userId, newRole) {
        const user = await this.findById(userId);
        if (!user)
            throw new Error('User not found');
        // Protect the last active administrator from being demoted
        if (user.role === 'ADMIN' && newRole !== 'ADMIN') {
            const activeAdmins = await this.countActiveAdmins();
            if (activeAdmins <= 1 && user.status === 'ACTIVE') {
                throw new Error('Cannot demote the last active administrator in the system');
            }
        }
        user.role = newRole;
        user.updated_at = new Date();
        this.users.set(user.username, user);
        await this.persistToCassandra(user);
        return this.toSafeUser(user);
    }
    /**
     * Change user status (ACTIVE / INACTIVE)
     */
    async changeStatus(userId, newStatus) {
        const user = await this.findById(userId);
        if (!user)
            throw new Error('User not found');
        // Protect the last active administrator from being deactivated
        if (user.role === 'ADMIN' && user.status === 'ACTIVE' && newStatus === 'INACTIVE') {
            const activeAdmins = await this.countActiveAdmins();
            if (activeAdmins <= 1) {
                throw new Error('Cannot disable the last active administrator in the system');
            }
        }
        user.status = newStatus;
        user.updated_at = new Date();
        this.users.set(user.username, user);
        await this.persistToCassandra(user);
        return this.toSafeUser(user);
    }
    /**
     * Change password
     */
    async changePassword(userId, oldPass, newPass) {
        const user = await this.findById(userId);
        if (!user)
            throw new Error('User not found');
        const isMatch = bcryptjs_1.default.compareSync(oldPass, user.password_hash);
        if (!isMatch) {
            throw new Error('Current password is incorrect');
        }
        if (oldPass === newPass) {
            throw new Error('New password must be different from current password');
        }
        if (!newPass || newPass.length < 8) {
            throw new Error('New password must be at least 8 characters long');
        }
        user.password_hash = bcryptjs_1.default.hashSync(newPass, 10);
        user.updated_at = new Date();
        this.users.set(user.username, user);
        await this.persistToCassandra(user);
        return true;
    }
    /**
     * Delete a user
     */
    async deleteUser(userId) {
        const user = await this.findById(userId);
        if (!user)
            throw new Error('User not found');
        // Protect the last active administrator from deletion
        if (user.role === 'ADMIN' && user.status === 'ACTIVE') {
            const activeAdmins = await this.countActiveAdmins();
            if (activeAdmins <= 1) {
                throw new Error('Cannot delete the last active administrator in the system');
            }
        }
        this.users.delete(user.username);
        await this.deleteFromCassandra(user.username);
        return { username: user.username };
    }
    /**
     * Remove sensitive password_hash from response
     */
    toSafeUser(user) {
        const { password_hash, ...safe } = user;
        return safe;
    }
}
exports.userService = new UserService();

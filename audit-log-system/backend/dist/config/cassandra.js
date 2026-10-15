"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cassandra = void 0;
exports.getCassandraClient = getCassandraClient;
exports.connectCassandra = connectCassandra;
exports.isCassandraHealthy = isCassandraHealthy;
exports.closeCassandra = closeCassandra;
const cassandra_driver_1 = __importDefault(require("cassandra-driver"));
exports.cassandra = cassandra_driver_1.default;
const env_js_1 = require("./env.js");
let client = null;
let isConnected = false;
/**
 * Initialize and get the Cassandra Client singleton
 */
function getCassandraClient() {
    if (!client) {
        client = new cassandra_driver_1.default.Client({
            contactPoints: env_js_1.env.CASSANDRA_CONTACT_POINTS,
            protocolOptions: {
                port: env_js_1.env.CASSANDRA_PORT,
            },
            localDataCenter: env_js_1.env.CASSANDRA_LOCAL_DATA_CENTER,
            keyspace: env_js_1.env.CASSANDRA_KEYSPACE,
            socketOptions: {
                connectTimeout: 5000,
                readTimeout: 12000,
            },
            pooling: {
                coreConnectionsPerHost: {
                    [cassandra_driver_1.default.types.distance.local]: 2,
                    [cassandra_driver_1.default.types.distance.remote]: 1,
                },
            },
            policies: {
                reconnection: new cassandra_driver_1.default.policies.reconnection.ExponentialReconnectionPolicy(500, 10000),
                loadBalancing: new cassandra_driver_1.default.policies.loadBalancing.TokenAwarePolicy(new cassandra_driver_1.default.policies.loadBalancing.DCAwareRoundRobinPolicy(env_js_1.env.CASSANDRA_LOCAL_DATA_CENTER)),
            },
            queryOptions: {
                consistency: cassandra_driver_1.default.types.consistencies.one,
                prepare: true,
            },
        });
        client.on('log', (level, className, message) => {
            if (level === 'warning' || level === 'error') {
                console.warn(`[Cassandra ${level.toUpperCase()}] ${className}: ${message}`);
            }
        });
        client.on('error', (err) => {
            console.error(`[Cassandra Client Event Error]: ${err.message}`);
            isConnected = false;
        });
    }
    return client;
}
/**
 * Bootstrap keyspace and tables if missing
 */
async function ensureKeyspaceAndTables() {
    const bootstrapClient = new cassandra_driver_1.default.Client({
        contactPoints: env_js_1.env.CASSANDRA_CONTACT_POINTS,
        protocolOptions: { port: env_js_1.env.CASSANDRA_PORT },
        localDataCenter: env_js_1.env.CASSANDRA_LOCAL_DATA_CENTER,
        socketOptions: { connectTimeout: 5000, readTimeout: 12000 },
    });
    try {
        await bootstrapClient.connect();
        // 1. Create Keyspace
        await bootstrapClient.execute(`
      CREATE KEYSPACE IF NOT EXISTS ${env_js_1.env.CASSANDRA_KEYSPACE}
      WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
      AND durable_writes = true;
    `);
        // 2. Create audit_logs table
        await bootstrapClient.execute(`
      CREATE TABLE IF NOT EXISTS ${env_js_1.env.CASSANDRA_KEYSPACE}.audit_logs (
        service_name text,
        log_date date,
        log_time timestamp,
        log_id uuid,
        level text,
        action text,
        user_id text,
        ip_address text,
        message text,
        details text,
        PRIMARY KEY ((service_name, log_date), log_time, log_id)
      ) WITH CLUSTERING ORDER BY (log_time DESC, log_id ASC);
    `);
        // 3. Create audit_logs_by_service_level table
        await bootstrapClient.execute(`
      CREATE TABLE IF NOT EXISTS ${env_js_1.env.CASSANDRA_KEYSPACE}.audit_logs_by_service_level (
        service_name text,
        level text,
        log_date date,
        log_time timestamp,
        log_id uuid,
        action text,
        user_id text,
        ip_address text,
        message text,
        details text,
        PRIMARY KEY ((service_name, level, log_date), log_time, log_id)
      ) WITH CLUSTERING ORDER BY (log_time DESC, log_id ASC);
    `);
        // 4. Create services catalogue table
        await bootstrapClient.execute(`
      CREATE TABLE IF NOT EXISTS ${env_js_1.env.CASSANDRA_KEYSPACE}.services (
        service_id uuid,
        service_name text,
        description text,
        status boolean,
        created_at timestamp,
        updated_at timestamp,
        PRIMARY KEY (service_id)
      );
    `);
        await bootstrapClient.execute(`
      CREATE INDEX IF NOT EXISTS idx_services_name ON ${env_js_1.env.CASSANDRA_KEYSPACE}.services (service_name);
    `);
        // 5. Create audit_logs_by_id table (Query-First for GET /api/logs/:id)
        await bootstrapClient.execute(`
      CREATE TABLE IF NOT EXISTS ${env_js_1.env.CASSANDRA_KEYSPACE}.audit_logs_by_id (
        log_id uuid,
        service_name text,
        log_date date,
        log_time timestamp,
        level text,
        action text,
        user_id text,
        ip_address text,
        message text,
        details text,
        PRIMARY KEY (log_id)
      );
    `);
    }
    finally {
        await bootstrapClient.shutdown().catch(() => { });
    }
}
/**
 * Connect to Cassandra cluster with health check and auto-bootstrap
 */
async function connectCassandra() {
    try {
        const c = getCassandraClient();
        await c.connect();
        isConnected = true;
        console.log(`[Cassandra] Connected successfully to keyspace '${env_js_1.env.CASSANDRA_KEYSPACE}' at ${env_js_1.env.CASSANDRA_CONTACT_POINTS.join(', ')}`);
        return true;
    }
    catch (error) {
        if (error.message?.includes('does not exist') || error.name === 'InvalidQueryException') {
            try {
                console.log(`[Cassandra] Keyspace or schema missing. Bootstrapping schema...`);
                await ensureKeyspaceAndTables();
                const c = getCassandraClient();
                await c.connect();
                isConnected = true;
                console.log(`[Cassandra] Schema bootstrapped and connected successfully to '${env_js_1.env.CASSANDRA_KEYSPACE}'`);
                return true;
            }
            catch (bootErr) {
                console.error(`[Cassandra Bootstrap Failed]: ${bootErr.message}`);
            }
        }
        isConnected = false;
        console.error(`[Cassandra Connection Error]: ${error.message}`);
        return false;
    }
}
/**
 * Check if Cassandra connection is live
 */
async function isCassandraHealthy() {
    try {
        const c = getCassandraClient();
        const result = await c.execute('SELECT cluster_name, release_version, data_center, rack FROM system.local');
        const row = result.first();
        return {
            healthy: true,
            details: {
                cluster_name: row?.cluster_name,
                release_version: row?.release_version,
                data_center: row?.data_center,
                rack: row?.rack,
            },
        };
    }
    catch (err) {
        return {
            healthy: false,
            error: err.message || 'Database unavailable',
        };
    }
}
/**
 * Graceful disconnect
 */
async function closeCassandra() {
    if (client) {
        try {
            await client.shutdown();
            isConnected = false;
            client = null;
            console.log('[Cassandra] Disconnected cleanly.');
        }
        catch (err) {
            console.error('[Cassandra] Error during shutdown:', err.message);
        }
    }
}

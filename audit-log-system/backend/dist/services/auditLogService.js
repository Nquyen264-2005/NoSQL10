"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogService = exports.AuditLogService = void 0;
const cassandra_js_1 = require("../config/cassandra.js");
const serviceCatalogService_js_1 = require("./serviceCatalogService.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const sensitiveDataFilter_js_1 = require("../utils/sensitiveDataFilter.js");
const auditLogValidator_js_1 = require("../validators/auditLogValidator.js");
const duplicateEventCache = new Map();
function cleanDuplicateCache() {
    const now = Date.now();
    for (const [key, value] of duplicateEventCache.entries()) {
        if (now - value.timestamp > 10000) {
            duplicateEventCache.delete(key);
        }
    }
}
class AuditLogService {
    /**
     * Helper to format a Date into UTC YYYY-MM-DD for deterministic partition keys
     */
    formatDateToYMD(d) {
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    /**
     * Helper to convert Date or YYYY-MM-DD string to cassandra.types.LocalDate
     */
    toCassandraLocalDate(dateStrOrObj) {
        if (typeof dateStrOrObj === 'string') {
            const parts = dateStrOrObj.split('-').map(Number);
            return new cassandra_js_1.cassandra.types.LocalDate(parts[0], parts[1], parts[2]);
        }
        const year = dateStrOrObj.getUTCFullYear();
        const month = dateStrOrObj.getUTCMonth() + 1;
        const day = dateStrOrObj.getUTCDate();
        return new cassandra_js_1.cassandra.types.LocalDate(year, month, day);
    }
    /**
     * Safe encoding of Cassandra pageState to base64 string
     */
    encodePageState(pageState) {
        if (!pageState)
            return null;
        if (Buffer.isBuffer(pageState)) {
            return pageState.toString('base64');
        }
        if (typeof pageState === 'string') {
            if (/^[0-9a-fA-F]+$/.test(pageState)) {
                try {
                    return Buffer.from(pageState, 'hex').toString('base64');
                }
                catch {
                    return pageState;
                }
            }
            return pageState;
        }
        return null;
    }
    /**
     * Decode client cursor string (handles base64 compound cursor, hex pageState, or base64 pageState)
     */
    decodeCursor(cursor) {
        if (!cursor)
            return { isCompound: false };
        try {
            const utf8 = Buffer.from(cursor, 'base64').toString('utf8');
            if (utf8.startsWith('{') && utf8.endsWith('}')) {
                const parsed = JSON.parse(utf8);
                if (parsed.t && parsed.id) {
                    return { isCompound: true, compound: parsed };
                }
            }
        }
        catch { }
        if (/^[0-9a-fA-F]+$/.test(cursor)) {
            return { isCompound: false, pageState: Buffer.from(cursor, 'hex') };
        }
        try {
            return { isCompound: false, pageState: Buffer.from(cursor, 'base64') };
        }
        catch {
            return { isCompound: false, pageState: cursor };
        }
    }
    /**
     * Dual/Triple Write: Inserts an audit log into audit_logs, audit_logs_by_service_level, and audit_logs_by_id
     * Guarantees identical log_id, timestamp, and TTL across all query-first tables.
     */
    async createLog(input) {
        const trimmedServiceName = input.service_name.trim();
        // 1. Check if Service is registered and active
        const serviceStatus = await serviceCatalogService_js_1.serviceCatalogService.isServiceActive(trimmedServiceName);
        if (!serviceStatus.exists) {
            // Auto-register service as active if it's one of the standard services, or reject
            const standardServices = ['Auth', 'User', 'Order', 'Payment'];
            if (standardServices.includes(trimmedServiceName)) {
                await serviceCatalogService_js_1.serviceCatalogService.createService({
                    service_name: trimmedServiceName,
                    description: `${trimmedServiceName} Microservice`,
                    status: true,
                });
            }
            else {
                throw new errorHandler_js_1.AppError(`Service '${trimmedServiceName}' is not registered in the system`, 400);
            }
        }
        else if (!serviceStatus.active) {
            throw new errorHandler_js_1.AppError(`Service '${trimmedServiceName}' is currently INACTIVE. Cannot accept new audit logs.`, 400);
        }
        // 2. Duplicate Event Handling (Idempotency check)
        cleanDuplicateCache();
        const dedupeFingerprint = `${trimmedServiceName}:${input.level}:${input.action}:${input.user_id || ''}:${input.message}:${input.log_id || ''}`;
        if (duplicateEventCache.has(dedupeFingerprint)) {
            const cached = duplicateEventCache.get(dedupeFingerprint);
            if (Date.now() - cached.timestamp < 10000) {
                console.log(`[AuditLog] Duplicate event detected within window. Returning cached record idempotent.`);
                return cached.record;
            }
        }
        // 3. Sensitive Data Masking before storage
        const maskedMessage = (0, sensitiveDataFilter_js_1.maskSensitiveText)(input.message.trim());
        const sanitizedDetails = (0, sensitiveDataFilter_js_1.sanitizeLogDetails)(input.details);
        // 4. Timestamp & UUID setup
        const logTime = input.log_time
            ? (typeof input.log_time === 'string' ? new Date(input.log_time) : input.log_time)
            : new Date();
        const logDateStr = this.formatDateToYMD(logTime);
        const cassandraLocalDate = this.toCassandraLocalDate(logDateStr);
        let logId;
        if (input.log_id && (0, auditLogValidator_js_1.isValidUuid)(input.log_id)) {
            logId = cassandra_js_1.cassandra.types.Uuid.fromString(input.log_id);
        }
        else {
            logId = cassandra_js_1.cassandra.types.Uuid.random();
        }
        const client = (0, cassandra_js_1.getCassandraClient)();
        // 5. Prepare CQL Statements for Query-First Tables
        let query1 = `
      INSERT INTO audit_log_system.audit_logs (
        service_name, log_date, log_time, log_id, level, action, user_id, ip_address, message, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        let query2 = `
      INSERT INTO audit_log_system.audit_logs_by_service_level (
        service_name, level, log_date, log_time, log_id, action, user_id, ip_address, message, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        let query3 = `
      INSERT INTO audit_log_system.audit_logs_by_id (
        log_id, service_name, log_date, log_time, level, action, user_id, ip_address, message, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        // Apply Cassandra Native TTL if provided
        if (input.ttl && input.ttl > 0) {
            query1 += ` USING TTL ${input.ttl}`;
            query2 += ` USING TTL ${input.ttl}`;
            query3 += ` USING TTL ${input.ttl}`;
        }
        const params1 = [
            trimmedServiceName,
            cassandraLocalDate,
            logTime,
            logId,
            input.level,
            input.action.trim(),
            input.user_id ? input.user_id.trim() : null,
            input.ip_address || null,
            maskedMessage,
            sanitizedDetails || '',
        ];
        const params2 = [
            trimmedServiceName,
            input.level,
            cassandraLocalDate,
            logTime,
            logId,
            input.action.trim(),
            input.user_id ? input.user_id.trim() : null,
            input.ip_address || null,
            maskedMessage,
            sanitizedDetails || '',
        ];
        const params3 = [
            logId,
            trimmedServiceName,
            cassandraLocalDate,
            logTime,
            input.level,
            input.action.trim(),
            input.user_id ? input.user_id.trim() : null,
            input.ip_address || null,
            maskedMessage,
            sanitizedDetails || '',
        ];
        // 6. Execute Multi-Table Write with identical log_id
        const writePromises = [
            client.execute(query1, params1, { prepare: true }),
            client.execute(query2, params2, { prepare: true }),
        ];
        // Try writing to audit_logs_by_id (ignore if table is not yet created on older node)
        writePromises.push(client.execute(query3, params3, { prepare: true }).catch((err) => {
            console.warn('[AuditLogService] Non-critical: Could not write to audit_logs_by_id:', err.message);
        }));
        await Promise.all(writePromises);
        const record = {
            service_name: trimmedServiceName,
            log_date: logDateStr,
            log_time: logTime,
            log_id: logId.toString(),
            level: input.level,
            action: input.action.trim(),
            user_id: input.user_id ? input.user_id.trim() : null,
            ip_address: input.ip_address || null,
            message: maskedMessage,
            details: sanitizedDetails || null,
            remaining_ttl: input.ttl || undefined,
        };
        // Store in duplicate cache
        duplicateEventCache.set(dedupeFingerprint, {
            timestamp: Date.now(),
            record,
        });
        return record;
    }
    /**
     * Query logs based on query-first routing with Cassandra native cursor pagination
     * Supports multi-day partition scatter-gather querying without ALLOW FILTERING
     */
    async queryLogs(filter) {
        const limit = filter.limit || 100;
        // SCENARIO: Multi-day range query across discrete daily partitions
        // In Cassandra, partition keys cannot be range-queried with >= or <=.
        // Instead, the application generates discrete partition dates and executes parallel queries.
        if (filter.start_date && filter.end_date && filter.start_date < filter.end_date) {
            const dates = [];
            const current = new Date(filter.start_date + 'T00:00:00Z');
            const end = new Date(filter.end_date + 'T00:00:00Z');
            // Cap at 14 days to prevent excessive coordinator fan-out
            while (current <= end && dates.length < 14) {
                dates.push(this.formatDateToYMD(current));
                current.setUTCDate(current.getUTCDate() + 1);
            }
            const partitionPromises = dates.map((d) => this.querySingleDay({
                ...filter,
                date: d,
                start_date: undefined,
                end_date: undefined,
                limit: Math.ceil(limit / dates.length) + 10,
                page_state: null,
            }));
            const results = await Promise.all(partitionPromises);
            const combined = results.flatMap((r) => r.logs);
            combined.sort((a, b) => new Date(b.log_time).getTime() - new Date(a.log_time).getTime());
            const sliced = combined.slice(0, limit);
            return {
                logs: sliced,
                page_state: null,
                count: sliced.length,
            };
        }
        return this.querySingleDay(filter);
    }
    /**
     * Execute query for a single partition date
     */
    async querySingleDay(filter) {
        const client = (0, cassandra_js_1.getCassandraClient)();
        const targetDate = filter.date || filter.start_date || this.formatDateToYMD(new Date());
        const cassandraLocalDate = this.toCassandraLocalDate(targetDate);
        const limit = filter.limit || 100;
        // Time boundaries (UTC consistent)
        let fromTimestamp = null;
        let toTimestamp = null;
        if (filter.from) {
            if (filter.from.includes('T')) {
                fromTimestamp = new Date(filter.from);
            }
            else {
                const fromParts = filter.from.split(':');
                const hh = fromParts[0].padStart(2, '0');
                const mm = (fromParts[1] || '00').padStart(2, '0');
                const ss = (fromParts[2] || '00').padStart(2, '0');
                fromTimestamp = new Date(`${targetDate}T${hh}:${mm}:${ss}.000Z`);
            }
        }
        if (filter.to) {
            if (filter.to.includes('T')) {
                toTimestamp = new Date(filter.to);
            }
            else {
                const toParts = filter.to.split(':');
                const hh = toParts[0].padStart(2, '0');
                const mm = (toParts[1] || '59').padStart(2, '0');
                const ss = (toParts[2] || '59').padStart(2, '0');
                toTimestamp = new Date(`${targetDate}T${hh}:${mm}:${ss}.999Z`);
            }
        }
        // Decode cursor parameter (compound JSON or native Cassandra pageState)
        const decodedCursor = this.decodeCursor(filter.page_state);
        // Prepare execution options with native Cassandra cursor pagination
        const execOptions = {
            prepare: true,
            fetchSize: limit,
        };
        if (!decodedCursor.isCompound && decodedCursor.pageState) {
            execOptions.pageState = decodedCursor.pageState;
        }
        // SCENARIO 1: Query by Service + Level (Uses audit_logs_by_service_level)
        // Partition key: ((service_name, level, log_date), log_time, log_id) -> 0 ALLOW FILTERING
        if (filter.service && filter.level) {
            let query = `
        SELECT service_name, level, log_date, log_time, log_id, action, user_id, ip_address, message, details, TTL(message) AS remaining_ttl
        FROM audit_log_system.audit_logs_by_service_level
        WHERE service_name = ? AND level = ? AND log_date = ?
      `;
            const params = [filter.service.trim(), filter.level, cassandraLocalDate];
            if (fromTimestamp && toTimestamp) {
                query += ` AND log_time >= ? AND log_time <= ?`;
                params.push(fromTimestamp, toTimestamp);
            }
            else if (fromTimestamp) {
                query += ` AND log_time >= ?`;
                params.push(fromTimestamp);
            }
            else if (toTimestamp) {
                query += ` AND log_time <= ?`;
                params.push(toTimestamp);
            }
            if (decodedCursor.isCompound && decodedCursor.compound) {
                query += ` AND (log_time, log_id) < (?, ?)`;
                params.push(new Date(decodedCursor.compound.t), cassandra_js_1.cassandra.types.Uuid.fromString(decodedCursor.compound.id));
                query += ` LIMIT ${limit + 1}`;
                const result = await client.execute(query, params, { prepare: true });
                const rows = this.mapRows(result.rows);
                const hasMore = rows.length > limit;
                const sliced = rows.slice(0, limit);
                let nextPage = null;
                if (hasMore && sliced.length > 0) {
                    const last = sliced[sliced.length - 1];
                    nextPage = Buffer.from(JSON.stringify({ t: new Date(last.log_time).toISOString(), id: last.log_id })).toString('base64');
                }
                return {
                    logs: sliced,
                    page_state: nextPage,
                    count: sliced.length,
                };
            }
            const result = await client.execute(query, params, execOptions);
            const nextPage = this.encodePageState(result.pageState);
            const rows = this.mapRows(result.rows);
            return {
                logs: rows,
                page_state: nextPage,
                count: rows.length,
            };
        }
        // SCENARIO 2: Query by Service only (Uses audit_logs)
        // Partition key: ((service_name, log_date), log_time, log_id) -> 0 ALLOW FILTERING
        if (filter.service) {
            let query = `
        SELECT service_name, log_date, log_time, log_id, level, action, user_id, ip_address, message, details, TTL(message) AS remaining_ttl
        FROM audit_log_system.audit_logs
        WHERE service_name = ? AND log_date = ?
      `;
            const params = [filter.service.trim(), cassandraLocalDate];
            if (fromTimestamp && toTimestamp) {
                query += ` AND log_time >= ? AND log_time <= ?`;
                params.push(fromTimestamp, toTimestamp);
            }
            else if (fromTimestamp) {
                query += ` AND log_time >= ?`;
                params.push(fromTimestamp);
            }
            else if (toTimestamp) {
                query += ` AND log_time <= ?`;
                params.push(toTimestamp);
            }
            if (decodedCursor.isCompound && decodedCursor.compound) {
                query += ` AND (log_time, log_id) < (?, ?)`;
                params.push(new Date(decodedCursor.compound.t), cassandra_js_1.cassandra.types.Uuid.fromString(decodedCursor.compound.id));
                query += ` LIMIT ${limit + 1}`;
                const result = await client.execute(query, params, { prepare: true });
                const rows = this.mapRows(result.rows);
                const hasMore = rows.length > limit;
                const sliced = rows.slice(0, limit);
                let nextPage = null;
                if (hasMore && sliced.length > 0) {
                    const last = sliced[sliced.length - 1];
                    nextPage = Buffer.from(JSON.stringify({ t: new Date(last.log_time).toISOString(), id: last.log_id })).toString('base64');
                }
                return {
                    logs: sliced,
                    page_state: nextPage,
                    count: sliced.length,
                };
            }
            const result = await client.execute(query, params, execOptions);
            const nextPage = this.encodePageState(result.pageState);
            const rows = this.mapRows(result.rows);
            return {
                logs: rows,
                page_state: nextPage,
                count: rows.length,
            };
        }
        // SCENARIO 3: Neither service nor level specified (or only level specified)
        // Parallel query across known active services to avoid full cluster scan
        const services = await serviceCatalogService_js_1.serviceCatalogService.getAllServices();
        let serviceNames = services.filter((s) => s.status).map((s) => s.service_name);
        if (serviceNames.length === 0) {
            serviceNames = ['Auth', 'User', 'Order', 'Payment'];
        }
        // Fetch limit + 1 per service to accurately determine if next page exists
        const perServiceLimit = limit + 1;
        const promises = serviceNames.map(async (srv) => {
            if (filter.level) {
                let query = `
          SELECT service_name, level, log_date, log_time, log_id, action, user_id, ip_address, message, details, TTL(message) AS remaining_ttl
          FROM audit_log_system.audit_logs_by_service_level
          WHERE service_name = ? AND level = ? AND log_date = ?
        `;
                const params = [srv, filter.level, cassandraLocalDate];
                if (fromTimestamp && toTimestamp) {
                    query += ` AND log_time >= ? AND log_time <= ?`;
                    params.push(fromTimestamp, toTimestamp);
                }
                if (decodedCursor.isCompound && decodedCursor.compound) {
                    query += ` AND (log_time, log_id) < (?, ?)`;
                    params.push(new Date(decodedCursor.compound.t), cassandra_js_1.cassandra.types.Uuid.fromString(decodedCursor.compound.id));
                }
                query += ` LIMIT ${perServiceLimit}`;
                const res = await client.execute(query, params, { prepare: true });
                return this.mapRows(res.rows);
            }
            else {
                let query = `
          SELECT service_name, log_date, log_time, log_id, level, action, user_id, ip_address, message, details, TTL(message) AS remaining_ttl
          FROM audit_log_system.audit_logs
          WHERE service_name = ? AND log_date = ?
        `;
                const params = [srv, cassandraLocalDate];
                if (fromTimestamp && toTimestamp) {
                    query += ` AND log_time >= ? AND log_time <= ?`;
                    params.push(fromTimestamp, toTimestamp);
                }
                if (decodedCursor.isCompound && decodedCursor.compound) {
                    query += ` AND (log_time, log_id) < (?, ?)`;
                    params.push(new Date(decodedCursor.compound.t), cassandra_js_1.cassandra.types.Uuid.fromString(decodedCursor.compound.id));
                }
                query += ` LIMIT ${perServiceLimit}`;
                const res = await client.execute(query, params, { prepare: true });
                return this.mapRows(res.rows);
            }
        });
        const results = await Promise.all(promises);
        const combined = results.flat();
        combined.sort((a, b) => new Date(b.log_time).getTime() - new Date(a.log_time).getTime());
        const hasMore = combined.length > limit;
        const sliced = combined.slice(0, limit);
        let nextPage = null;
        if (hasMore && sliced.length > 0) {
            const last = sliced[sliced.length - 1];
            nextPage = Buffer.from(JSON.stringify({ t: new Date(last.log_time).toISOString(), id: last.log_id })).toString('base64');
        }
        return {
            logs: sliced,
            page_state: nextPage,
            count: sliced.length,
        };
    }
    /**
     * Retrieve single log detail by direct log_id (O(1) point lookup) or composite key
     */
    async getLogById(logIdStr, serviceName, dateStr, timeIso) {
        if (!(0, auditLogValidator_js_1.isValidUuid)(logIdStr)) {
            throw new errorHandler_js_1.AppError(`Invalid UUID format for log_id: '${logIdStr}'`, 400);
        }
        const client = (0, cassandra_js_1.getCassandraClient)();
        const logId = cassandra_js_1.cassandra.types.Uuid.fromString(logIdStr);
        // 1. Try direct point lookup on audit_logs_by_id table
        try {
            const pointQuery = `
        SELECT log_id, service_name, log_date, log_time, level, action, user_id, ip_address, message, details, TTL(message) AS remaining_ttl
        FROM audit_log_system.audit_logs_by_id
        WHERE log_id = ?
      `;
            const res = await client.execute(pointQuery, [logId], { prepare: true });
            const row = res.first();
            if (row) {
                return {
                    service_name: row.service_name,
                    log_date: row.log_date ? row.log_date.toString() : '',
                    log_time: row.log_time,
                    log_id: row.log_id.toString(),
                    level: row.level,
                    action: row.action,
                    user_id: row.user_id || null,
                    ip_address: row.ip_address || null,
                    message: row.message,
                    details: row.details || null,
                    remaining_ttl: row.remaining_ttl !== null && row.remaining_ttl !== undefined ? Number(row.remaining_ttl) : undefined,
                };
            }
        }
        catch {
            // audit_logs_by_id may not exist on older clusters; proceed to fallback
        }
        // 2. If composite key provided, query main audit_logs table
        if (serviceName && dateStr && timeIso) {
            const cassandraLocalDate = this.toCassandraLocalDate(dateStr);
            const logTime = new Date(timeIso);
            const query = `
        SELECT service_name, log_date, log_time, log_id, level, action, user_id, ip_address, message, details, TTL(message) AS remaining_ttl
        FROM audit_log_system.audit_logs
        WHERE service_name = ? AND log_date = ? AND log_time = ? AND log_id = ?
      `;
            const result = await client.execute(query, [serviceName.trim(), cassandraLocalDate, logTime, logId], { prepare: true });
            const row = result.first();
            if (!row)
                return null;
            return {
                service_name: row.service_name,
                log_date: row.log_date ? row.log_date.toString() : dateStr,
                log_time: row.log_time,
                log_id: row.log_id.toString(),
                level: row.level,
                action: row.action,
                user_id: row.user_id || null,
                ip_address: row.ip_address || null,
                message: row.message,
                details: row.details || null,
                remaining_ttl: row.remaining_ttl !== null && row.remaining_ttl !== undefined ? Number(row.remaining_ttl) : undefined,
            };
        }
        return null;
    }
    /**
     * Real-time Cassandra TTL inspection.
     * Returns exact remaining TTL from Cassandra's TTL(message) function,
     * or marks the record as EXPIRED / PURGED if 0 rows are returned.
     */
    async getTtlStatus(logIdStr) {
        if (!(0, auditLogValidator_js_1.isValidUuid)(logIdStr)) {
            throw new errorHandler_js_1.AppError(`Invalid UUID format for log_id: '${logIdStr}'`, 400);
        }
        const client = (0, cassandra_js_1.getCassandraClient)();
        const logId = cassandra_js_1.cassandra.types.Uuid.fromString(logIdStr);
        try {
            const pointQuery = `
        SELECT log_id, service_name, log_date, log_time, level, action, user_id, ip_address, message, details, TTL(message) AS remaining_ttl
        FROM audit_log_system.audit_logs_by_id
        WHERE log_id = ?
      `;
            const res = await client.execute(pointQuery, [logId], { prepare: true });
            const row = res.first();
            if (row) {
                const remainingTtl = row.remaining_ttl !== null && row.remaining_ttl !== undefined ? Number(row.remaining_ttl) : 0;
                return {
                    found: true,
                    expired: false,
                    remaining_ttl: remainingTtl,
                    log: {
                        service_name: row.service_name,
                        log_date: row.log_date ? row.log_date.toString() : '',
                        log_time: row.log_time,
                        log_id: row.log_id.toString(),
                        level: row.level,
                        action: row.action,
                        user_id: row.user_id || null,
                        ip_address: row.ip_address || null,
                        message: row.message,
                        details: row.details || null,
                        remaining_ttl: remainingTtl,
                    },
                };
            }
        }
        catch (err) {
            console.warn(`[AuditLogService] Error querying audit_logs_by_id for TTL status: ${err.message}`);
        }
        // Row does not exist in Cassandra -> It expired or was purged by TTL
        return {
            found: false,
            expired: true,
            remaining_ttl: 0,
            log: null,
        };
    }
    /**
     * Retrieve Dashboard summary statistics
     */
    async getDashboardSummary(dateStr) {
        const client = (0, cassandra_js_1.getCassandraClient)();
        const targetDate = dateStr || this.formatDateToYMD(new Date());
        const cassandraLocalDate = this.toCassandraLocalDate(targetDate);
        const services = await serviceCatalogService_js_1.serviceCatalogService.getAllServices();
        let serviceNames = services.filter((s) => s.status).map((s) => s.service_name);
        if (serviceNames.length === 0) {
            serviceNames = ['Auth', 'User', 'Order', 'Payment'];
        }
        const levels = ['INFO', 'WARN', 'ERROR'];
        const byService = {};
        const byLevel = { INFO: 0, WARN: 0, ERROR: 0 };
        let totalLogs = 0;
        const recentErrors = [];
        // Query each (service, level) partition in audit_logs_by_service_level without ALLOW FILTERING
        const partitionQueries = serviceNames.flatMap((srv) => levels.map(async (lvl) => {
            const query = `
          SELECT service_name, level, log_date, log_time, log_id, action, user_id, ip_address, message, details, TTL(message) AS remaining_ttl
          FROM audit_log_system.audit_logs_by_service_level
          WHERE service_name = ? AND level = ? AND log_date = ?
        `;
            const res = await client.execute(query, [srv, lvl, cassandraLocalDate], { prepare: true });
            const count = res.rowLength;
            // Tally statistics
            byService[srv] = (byService[srv] || 0) + count;
            byLevel[lvl] = (byLevel[lvl] || 0) + count;
            totalLogs += count;
            if (lvl === 'ERROR') {
                recentErrors.push(...this.mapRows(res.rows.slice(0, 10)));
            }
        }));
        await Promise.all(partitionQueries);
        // Sort recent errors newest first
        recentErrors.sort((a, b) => new Date(b.log_time).getTime() - new Date(a.log_time).getTime());
        return {
            totalLogs,
            infoCount: byLevel['INFO'] || 0,
            warnCount: byLevel['WARN'] || 0,
            errorCount: byLevel['ERROR'] || 0,
            byService,
            byLevel,
            recentErrors: recentErrors.slice(0, 10),
        };
    }
    /**
     * Helper to map Cassandra rows to typed records
     */
    mapRows(rows) {
        return rows.map((row) => ({
            service_name: row.service_name,
            log_date: row.log_date ? row.log_date.toString() : '',
            log_time: row.log_time,
            log_id: row.log_id ? row.log_id.toString() : '',
            level: row.level,
            action: row.action,
            user_id: row.user_id || null,
            ip_address: row.ip_address || null,
            message: row.message,
            details: row.details || null,
            remaining_ttl: row.remaining_ttl !== null && row.remaining_ttl !== undefined ? Number(row.remaining_ttl) : undefined,
        }));
    }
}
exports.AuditLogService = AuditLogService;
exports.auditLogService = new AuditLogService();

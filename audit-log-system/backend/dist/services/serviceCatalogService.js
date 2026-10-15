"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceCatalogService = exports.ServiceCatalogService = void 0;
const cassandra_js_1 = require("../config/cassandra.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const auditLogValidator_js_1 = require("../validators/auditLogValidator.js");
class ServiceCatalogService {
    /**
     * Retrieve all registered services
     */
    async getAllServices() {
        const client = (0, cassandra_js_1.getCassandraClient)();
        const query = 'SELECT service_id, service_name, description, status, created_at, updated_at FROM audit_log_system.services';
        const result = await client.execute(query);
        return result.rows.map((row) => ({
            service_id: row.service_id.toString(),
            service_name: row.service_name,
            description: row.description || '',
            status: Boolean(row.status),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }));
    }
    /**
     * Get single service by UUID
     */
    async getServiceById(serviceId) {
        if (!(0, auditLogValidator_js_1.isValidUuid)(serviceId)) {
            throw new errorHandler_js_1.AppError(`Invalid UUID format for service_id: '${serviceId}'`, 400);
        }
        const client = (0, cassandra_js_1.getCassandraClient)();
        const query = 'SELECT service_id, service_name, description, status, created_at, updated_at FROM audit_log_system.services WHERE service_id = ?';
        const result = await client.execute(query, [cassandra_js_1.cassandra.types.Uuid.fromString(serviceId)], { prepare: true });
        const row = result.first();
        if (!row)
            return null;
        return {
            service_id: row.service_id.toString(),
            service_name: row.service_name,
            description: row.description || '',
            status: Boolean(row.status),
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
    /**
     * Get single service by name using secondary index
     */
    async getServiceByName(serviceName) {
        const client = (0, cassandra_js_1.getCassandraClient)();
        const query = 'SELECT service_id, service_name, description, status, created_at, updated_at FROM audit_log_system.services WHERE service_name = ?';
        const result = await client.execute(query, [serviceName.trim()], { prepare: true });
        const row = result.first();
        if (!row)
            return null;
        return {
            service_id: row.service_id.toString(),
            service_name: row.service_name,
            description: row.description || '',
            status: Boolean(row.status),
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
    /**
     * Register a new service
     */
    async createService(data) {
        const trimmedName = data.service_name.trim();
        const existing = await this.getServiceByName(trimmedName);
        if (existing) {
            throw new errorHandler_js_1.AppError(`Service with name '${trimmedName}' already exists`, 409);
        }
        const client = (0, cassandra_js_1.getCassandraClient)();
        const service_id = cassandra_js_1.cassandra.types.Uuid.random();
        const now = new Date();
        const status = data.status !== undefined ? data.status : true;
        const description = (data.description || '').trim();
        const query = `
      INSERT INTO audit_log_system.services (
        service_id, service_name, description, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;
        await client.execute(query, [service_id, trimmedName, description, status, now, now], { prepare: true });
        return {
            service_id: service_id.toString(),
            service_name: trimmedName,
            description,
            status,
            created_at: now,
            updated_at: now,
        };
    }
    /**
     * Update an existing service
     */
    async updateService(serviceId, data) {
        if (!(0, auditLogValidator_js_1.isValidUuid)(serviceId)) {
            throw new errorHandler_js_1.AppError(`Invalid UUID format for service_id: '${serviceId}'`, 400);
        }
        const existing = await this.getServiceById(serviceId);
        if (!existing) {
            throw new errorHandler_js_1.AppError(`Service with ID '${serviceId}' not found`, 404);
        }
        if (data.service_name) {
            const trimmedName = data.service_name.trim();
            if (trimmedName !== existing.service_name) {
                const nameConflict = await this.getServiceByName(trimmedName);
                if (nameConflict && nameConflict.service_id !== serviceId) {
                    throw new errorHandler_js_1.AppError(`Service with name '${trimmedName}' already exists`, 409);
                }
            }
        }
        const client = (0, cassandra_js_1.getCassandraClient)();
        const updatedServiceName = data.service_name ? data.service_name.trim() : existing.service_name;
        const updatedDescription = data.description !== undefined ? data.description.trim() : existing.description;
        const updatedStatus = data.status !== undefined ? data.status : existing.status;
        const now = new Date();
        const query = `
      UPDATE audit_log_system.services
      SET service_name = ?, description = ?, status = ?, updated_at = ?
      WHERE service_id = ?
    `;
        await client.execute(query, [updatedServiceName, updatedDescription, updatedStatus, now, cassandra_js_1.cassandra.types.Uuid.fromString(serviceId)], { prepare: true });
        return {
            service_id: serviceId,
            service_name: updatedServiceName,
            description: updatedDescription,
            status: updatedStatus,
            created_at: existing.created_at,
            updated_at: now,
        };
    }
    /**
     * Delete a service by ID
     */
    async deleteService(serviceId) {
        if (!(0, auditLogValidator_js_1.isValidUuid)(serviceId)) {
            throw new errorHandler_js_1.AppError(`Invalid UUID format for service_id: '${serviceId}'`, 400);
        }
        const existing = await this.getServiceById(serviceId);
        if (!existing) {
            throw new errorHandler_js_1.AppError(`Service with ID '${serviceId}' not found`, 404);
        }
        const client = (0, cassandra_js_1.getCassandraClient)();
        const query = 'DELETE FROM audit_log_system.services WHERE service_id = ?';
        await client.execute(query, [cassandra_js_1.cassandra.types.Uuid.fromString(serviceId)], { prepare: true });
    }
    /**
     * Check if a service is active
     */
    async isServiceActive(serviceName) {
        const service = await this.getServiceByName(serviceName.trim());
        if (!service) {
            return { exists: false, active: false };
        }
        return { exists: true, active: service.status };
    }
}
exports.ServiceCatalogService = ServiceCatalogService;
exports.serviceCatalogService = new ServiceCatalogService();

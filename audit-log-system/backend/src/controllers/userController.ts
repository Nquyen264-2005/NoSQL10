import { Response, NextFunction } from 'express';
import { userService, UserRole, UserStatus } from '../services/userService.js';
import { auditLogService } from '../services/auditLogService.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class UserController {
  /**
   * GET /api/users - List all users (ADMIN only)
   */
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await userService.getAllUsers();
      res.status(200).json({
        success: true,
        data: users,
        count: users.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/users - Admin creates new user
   */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password, full_name, email, role, status } = req.body;

      if (!username || !password) {
        res.status(400).json({
          success: false,
          message: 'Username and password are required',
        });
        return;
      }

      const validRoles: UserRole[] = ['ADMIN', 'OPERATOR', 'VIEWER'];
      if (role && !validRoles.includes(role)) {
        res.status(400).json({
          success: false,
          message: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
        });
        return;
      }

      const newUser = await userService.createUser({
        username,
        password,
        full_name,
        email,
        role: role || 'VIEWER',
        status: status || 'ACTIVE',
      });

      // Audit Log for user creation by admin
      try {
        await auditLogService.createLog({
          service_name: 'Auth',
          level: 'INFO',
          action: 'REGISTER_USER',
          message: `Admin '${req.user?.username}' created user account '${newUser.username}' with role '${newUser.role}'`,
          user_id: req.user?.username || 'admin',
          ip_address: req.ip || '127.0.0.1',
          details: {
            created_user_id: newUser.user_id,
            role: newUser.role,
            status: newUser.status,
          },
        });
      } catch {}

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: newUser,
      });
    } catch (error: any) {
      const isConflict = error.message?.includes('already exists');
      res.status(isConflict ? 409 : 400).json({
        success: false,
        message: error.message || 'Failed to create user',
      });
    }
  }

  /**
   * PUT /api/users/:id - Update user basic profile
   */
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const { full_name, email } = req.body;

      const updated = await userService.updateUser(id, { full_name, email });
      res.status(200).json({
        success: true,
        message: 'User profile updated',
        data: updated,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update user',
      });
    }
  }

  /**
   * PATCH /api/users/:id/role - Change user role
   */
  async changeRole(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const { role } = req.body;

      const validRoles: UserRole[] = ['ADMIN', 'OPERATOR', 'VIEWER'];
      if (!role || !validRoles.includes(role)) {
        res.status(400).json({
          success: false,
          message: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
        });
        return;
      }

      const targetUser = await userService.findById(id);
      if (!targetUser) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      // Prevent admin from revoking their own admin role
      if (req.user?.user_id === id && role !== 'ADMIN') {
        res.status(400).json({
          success: false,
          message: 'Cannot revoke your own ADMIN role',
        });
        return;
      }

      const previousRole = targetUser.role;
      const updated = await userService.changeRole(id, role as UserRole);

      // Audit Log for role change
      try {
        await auditLogService.createLog({
          service_name: 'Auth',
          level: 'WARN',
          action: 'CHANGE_USER_ROLE',
          message: `Admin '${req.user?.username}' changed role for '${updated.username}' from '${previousRole}' to '${updated.role}'`,
          user_id: req.user?.username || 'admin',
          ip_address: req.ip || '127.0.0.1',
          details: {
            target_user: updated.username,
            old_role: previousRole,
            new_role: updated.role,
          },
        });
      } catch {}

      res.status(200).json({
        success: true,
        message: `Role changed to ${role}`,
        data: updated,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to change role',
      });
    }
  }

  /**
   * PATCH /api/users/:id/status - Change user status (ACTIVE / INACTIVE)
   */
  async changeStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const { status } = req.body;

      if (status !== 'ACTIVE' && status !== 'INACTIVE') {
        res.status(400).json({
          success: false,
          message: "Invalid status. Must be 'ACTIVE' or 'INACTIVE'",
        });
        return;
      }

      // Prevent self-disable
      if (req.user?.user_id === id && status === 'INACTIVE') {
        res.status(400).json({
          success: false,
          message: 'Cannot disable your own administrator account',
        });
        return;
      }

      const updated = await userService.changeStatus(id, status as UserStatus);

      // Audit Log for status change
      const action = status === 'INACTIVE' ? 'DISABLE_USER' : 'ENABLE_USER';
      const level = status === 'INACTIVE' ? 'WARN' : 'INFO';

      try {
        await auditLogService.createLog({
          service_name: 'Auth',
          level,
          action,
          message: `Admin '${req.user?.username}' set account status for '${updated.username}' to '${status}'`,
          user_id: req.user?.username || 'admin',
          ip_address: req.ip || '127.0.0.1',
          details: {
            target_user: updated.username,
            new_status: status,
          },
        });
      } catch {}

      res.status(200).json({
        success: true,
        message: `User status set to ${status}`,
        data: updated,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to change status',
      });
    }
  }

  /**
   * DELETE /api/users/:id - Delete a user
   */
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);

      if (req.user?.user_id === id) {
        res.status(400).json({
          success: false,
          message: 'Cannot delete your own administrator account',
        });
        return;
      }

      const target = await userService.findById(id);
      if (!target) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      await userService.deleteUser(id);

      // Audit Log for user deletion
      try {
        await auditLogService.createLog({
          service_name: 'Auth',
          level: 'WARN',
          action: 'DELETE_USER',
          message: `Admin '${req.user?.username}' deleted user account '${target.username}'`,
          user_id: req.user?.username || 'admin',
          ip_address: req.ip || '127.0.0.1',
          details: {
            deleted_username: target.username,
            deleted_role: target.role,
          },
        });
      } catch {}

      res.status(200).json({
        success: true,
        message: `User '${target.username}' deleted successfully`,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete user',
      });
    }
  }
}

export const userController = new UserController();

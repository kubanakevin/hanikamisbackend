// middleware/auth.js
/**
 * Authentication Middleware
 * Provides role-based access control for the application
 */

/**
 * Require authentication - ensures user is logged in
 */
function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ 
            success: false, 
            error: "Please sign in to continue",
            code: "UNAUTHORIZED"
        });
    }
    next();
}

/**
 * Require specific role(s) - ensures user has required role
 * @param {...string} allowedRoles - List of allowed roles
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ 
                success: false, 
                error: "Please sign in to continue",
                code: "UNAUTHORIZED"
            });
        }
        
        if (!allowedRoles.includes(req.session.user.role)) {
            return res.status(403).json({ 
                success: false, 
                error: "You don't have access to this resource",
                code: "FORBIDDEN",
                required_roles: allowedRoles,
                user_role: req.session.user.role
            });
        }
        next();
    };
}

/**
 * Scope to department - adds department filter to request
 * Super managers get null (all departments), others get their department ID
 */
function scopeToDepartment(req, res, next) {
    const user = req.session.user;
    if (!user) {
        return res.status(401).json({ 
            success: false, 
            error: "Please sign in to continue",
            code: "UNAUTHORIZED"
        });
    }
    
    // Super managers see all, others see only their department
    req.departmentFilter = user.role === "super_manager" ? null : user.departmentId;
    req.userRole = user.role;
    req.userId = user.id;
    
    next();
}

/**
 * Check if user is super manager
 */
function isSuperManager(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ 
            success: false, 
            error: "Please sign in to continue",
            code: "UNAUTHORIZED"
        });
    }
    
    if (req.session.user.role !== "super_manager") {
        return res.status(403).json({ 
            success: false, 
            error: "Super manager access required",
            code: "FORBIDDEN"
        });
    }
    next();
}

/**
 * Check if user is department manager or super manager
 */
function isDepartmentManager(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ 
            success: false, 
            error: "Please sign in to continue",
            code: "UNAUTHORIZED"
        });
    }
    
    const role = req.session.user.role;
    if (role !== "super_manager" && role !== "department_manager") {
        return res.status(403).json({ 
            success: false, 
            error: "Manager access required",
            code: "FORBIDDEN"
        });
    }
    next();
}

/**
 * Get current user info
 */
function getCurrentUser(req) {
    return req.session?.user || null;
}

/**
 * Check if user has specific permission (extensible)
 * @param {string} permission - Permission name
 */
function hasPermission(permission) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ 
                success: false, 
                error: "Please sign in to continue",
                code: "UNAUTHORIZED"
            });
        }
        
        // Super managers have all permissions
        if (req.session.user.role === "super_manager") {
            return next();
        }
        
        // Check user's permissions (assuming permissions are stored)
        const userPermissions = req.session.user.permissions || [];
        if (!userPermissions.includes(permission)) {
            return res.status(403).json({ 
                success: false, 
                error: "You don't have permission to perform this action",
                code: "FORBIDDEN"
            });
        }
        
        next();
    };
}

module.exports = {
    requireAuth,
    requireRole,
    scopeToDepartment,
    isSuperManager,
    isDepartmentManager,
    getCurrentUser,
    hasPermission,
};
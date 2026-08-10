const roleRepository = require('../repositories/role-repository');

class RoleService {
  async getRoles() {
    return roleRepository.findAll();
  }
}

module.exports = new RoleService();

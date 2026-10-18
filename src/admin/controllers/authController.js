const bcrypt = require('bcryptjs');
const { sequelize } = require('../../models');

exports.loginPage = (req, res) => {
  if (req.session && req.session.user) return res.redirect('/admin/dashboard');
  res.render('auth/login', { error: req.flash ? req.flash('error')[0] : null, csrfToken: req.csrfToken ? req.csrfToken() : '' });
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      req.flash('error', 'Email and password are required');
      return res.redirect('/auth/login');
    }
    const [users] = await sequelize.query(
      'SELECT u.*, r.name as role_name FROM users u LEFT JOIN model_has_roles mr ON u.id = mr.model_id LEFT JOIN roles r ON mr.role_id = r.id WHERE u.email = ? LIMIT 1',
      { replacements: [email] }
    );
    const user = users[0];
    if (!user) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/auth/login');
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/auth/login');
    }
    if (user.role_name !== 'Admin' && user.role_name !== 'Store Owner') {
      req.flash('error', 'Access denied');
      return res.redirect('/auth/login');
    }
    // Regenerate session to prevent fixation
    req.session.regenerate((err) => {
      if (err) {
        req.flash('error', 'Server error');
        return res.redirect('/auth/login');
      }
      req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role_name };
      req.session.save((err2) => {
        if (err2) {
          req.flash('error', 'Server error');
          return res.redirect('/auth/login');
        }
        res.redirect('/admin/dashboard');
      });
    });
  } catch (err) {
    console.error('Login error');
    req.flash('error', 'Server error');
    res.redirect('/auth/login');
  }
};

exports.logout = (req, res) => {
  req.session.destroy();
  res.redirect('/auth/login');
};

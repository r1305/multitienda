const bcrypt = require('bcryptjs');
const axios = require('axios');
const { User, Address, Order, AcceptDelivery, Rating, Wallet, Transaction, sequelize } = require('../models');
const { generateToken } = require('../middleware/auth');

async function getDefaultAddress(user) {
  if (user.default_address_id && user.default_address_id !== 0) {
    return Address.findByPk(user.default_address_id, {
      attributes: ['address', 'house', 'latitude', 'longitude', 'tag'],
    });
  }
  return null;
}

async function getUserWalletBalance(userId) {
  const wallet = await Wallet.findOne({ where: { holder_type: 'App\\User', holder_id: userId } });
  return wallet ? parseFloat(wallet.balance) : 0;
}

async function buildUserResponse(user, token, defaultAddress, runningOrder = null) {
  // Get user role
  const [roles] = await sequelize.query('SELECT r.name FROM model_has_roles mr JOIN roles r ON mr.role_id = r.id WHERE mr.model_id = ? LIMIT 1', { replacements: [user.id] });
  const role = roles.length ? roles[0].name : 'Customer';
  return {
    success: true,
    data: {
      id: user.id,
      auth_token: token,
      name: user.name,
      email: user.email,
      phone: user.phone,
      default_address_id: user.default_address_id,
      default_address: defaultAddress,
      wallet_balance: user.walletBalance || 0,
      avatar: user.avatar,
      tax_number: user.tax_number,
      role,
    },
    running_order: runningOrder,
  };
}

async function validateAccessToken(email, provider, accessToken) {
  try {
    if (provider === 'facebook') {
      const { data } = await axios.get(`https://graph.facebook.com/app/?access_token=${accessToken}`);
      return data.id && data.id === process.env.FACEBOOK_APP_ID;
    }
    if (provider === 'google') {
      const { data } = await axios.get(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`);
      return data.email === email;
    }
  } catch {
    return false;
  }
  return false;
}

exports.login = async (req, res) => {
  try {
    const { email, password, accessToken, provider, phone, address, name } = req.body;

    // Social login
    if (accessToken) {
      const valid = await validateAccessToken(email, provider, accessToken);
      if (!valid) return res.json(false);

      let user = await User.findOne({ where: { email } });

      if (user) {
        if (user.phone) {
          const token = generateToken(user);
          user.auth_token = token;
          if (address?.lat) {
            const addr = await Address.create({ user_id: user.id, latitude: address.lat, longitude: address.lng, address: address.address, house: address.house, tag: address.tag });
            user.default_address_id = addr.id;
          }
          await user.save();
          const defaultAddress = await getDefaultAddress(user);
          return res.json(await buildUserResponse(user, token, defaultAddress));
        }
        if (phone) {
          const phoneExists = await User.findOne({ where: { phone } });
          if (phoneExists) return res.json({ email_phone_already_used: true });
          user.phone = phone;
          await user.save();
          const token = generateToken(user);
          user.auth_token = token;
          await user.save();
          const defaultAddress = await getDefaultAddress(user);
          return res.json(await buildUserResponse(user, token, defaultAddress));
        }
        return res.json({ enter_phone_after_social_login: true });
      }

      // New social user
      if (!phone) return res.json({ enter_phone_after_social_login: true });
      const phoneExists = await User.findOne({ where: { phone } });
      if (phoneExists) return res.json({ email_phone_already_used: true });

      user = await User.create({ name, email, phone, password: await bcrypt.hash(Math.random().toString(36), 10), user_ip: req.ip });
      const token = generateToken(user);
      user.auth_token = token;
      if (address?.lat) {
        const addr = await Address.create({ user_id: user.id, latitude: address.lat, longitude: address.lng, address: address.address, house: address.house, tag: address.tag });
        user.default_address_id = addr.id;
      }
      await user.save();
      const defaultAddress = await getDefaultAddress(user);
      return res.json(await buildUserResponse(user, token, defaultAddress));
    }

    // Password login
    if (!password) return res.status(400).json({ success: false, data: 'Password required' });

    const user = await User.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(201).json({ success: false, data: 'DONOTMATCH' });
    }

    const token = generateToken(user);
    user.auth_token = token;
    if (address?.lat) {
      const addr = await Address.create({ user_id: user.id, latitude: address.lat, longitude: address.lng, address: address.address, house: address.house, tag: address.tag });
      user.default_address_id = addr.id;
    }
    await user.save();
    const defaultAddress = await getDefaultAddress(user);
    return res.status(201).json(await buildUserResponse(user, token, defaultAddress));
  } catch (err) {
    res.status(500).json({ success: false, data: err.message });
  }
};

exports.loginWithOtp = async (req, res) => {
  try {
    const { SmsOtp } = require('../models');
    const { phone, otp, email, name, address } = req.body;

    const otpRecord = await SmsOtp.findOne({ where: { phone } });
    if (!otpRecord || String(otp) !== String(otpRecord.otp)) {
      return res.status(201).json({ success: false, data: 'DONOTMATCH' });
    }

    let user = await User.findOne({ where: { phone } });

    if (user) {
      if (address?.lat) {
        const addr = await Address.create({ user_id: user.id, latitude: address.lat, longitude: address.lng, address: address.address, house: address.house, tag: address.tag });
        user.default_address_id = addr.id;
      }
      const token = generateToken(user);
      user.auth_token = token;
      await user.save();
      const defaultAddress = await getDefaultAddress(user);
      return res.json(await buildUserResponse(user, token, defaultAddress));
    }

    // New user via OTP
    const randomPassword = Math.random().toString(36).slice(-8);
    user = await User.create({ name, email, phone, password: await bcrypt.hash(randomPassword, 10), user_ip: req.ip });
    const token = generateToken(user);
    user.auth_token = token;
    if (address?.lat) {
      const addr = await Address.create({ user_id: user.id, latitude: address.lat, longitude: address.lng, address: address.address, house: address.house, tag: address.tag });
      user.default_address_id = addr.id;
    }
    await user.save();
    const defaultAddress = await getDefaultAddress(user);
    return res.json(await buildUserResponse(user, token, defaultAddress));
  } catch (err) {
    res.status(500).json({ success: false, data: err.message });
  }
};

exports.register = async (req, res) => {
  try {
    const { email, phone, password, name, address } = req.body;

    const emailExists = await User.findOne({ where: { email } });
    const phoneExists = await User.findOne({ where: { phone } });
    if (emailExists || phoneExists) return res.json({ email_phone_already_used: true });

    const user = await User.create({ name, email, phone, password: await bcrypt.hash(password, 10), user_ip: req.ip });
    const token = generateToken(user);
    user.auth_token = token;

    if (address?.lat) {
      const addr = await Address.create({ user_id: user.id, latitude: address.lat, longitude: address.lng, address: address.address, house: address.house, tag: address.tag });
      user.default_address_id = addr.id;
    }
    await user.save();
    const defaultAddress = await getDefaultAddress(user);
    return res.status(201).json(await buildUserResponse(user, token, defaultAddress));
  } catch (err) {
    res.status(201).json({ success: false, data: err.message });
  }
};

exports.updateUserInfo = async (req, res) => {
  try {
    const user = req.user;
    const defaultAddress = await getDefaultAddress(user);

    let runningOrder = null;
    if (req.body.unique_order_id) {
      runningOrder = await Order.findOne({
        where: { user_id: user.id, unique_order_id: req.body.unique_order_id },
        include: [{ association: 'restaurant' }, { association: 'orderitems' }],
      });
    } else {
      runningOrder = await Order.findOne({
        where: { user_id: user.id, orderstatus_id: [1, 2, 3, 4, 7, 8] },
        include: [{ association: 'restaurant' }, { association: 'orderitems' }],
        order: [['id', 'DESC']],
      });
    }

    let deliveryDetails = null;
    if (runningOrder && [3, 4].includes(runningOrder.orderstatus_id)) {
      const acceptDelivery = await AcceptDelivery.findOne({ where: { order_id: runningOrder.id } });
      if (acceptDelivery) {
        const deliveryUser = await User.findByPk(acceptDelivery.user_id, { include: [{ association: 'delivery_guy_detail' }] });
        if (deliveryUser?.delivery_guy_detail) {
          deliveryDetails = deliveryUser.delivery_guy_detail.toJSON();
          deliveryDetails.phone = deliveryUser.phone;
          const ratings = await Rating.findAll({ where: { delivery_id: deliveryUser.id }, attributes: ['rating_delivery'] });
          const avg = ratings.length ? ratings.reduce((s, r) => s + parseFloat(r.rating_delivery || 0), 0) / ratings.length : 0;
          deliveryDetails.rating = avg.toFixed(1);
        }
      }
    }

    // Get wallet balance
    let walletBalance = 0;
    try { const w = await Wallet.findOne({ where: { holder_id: user.id } }); if (w) walletBalance = parseFloat(w.balance); } catch(e) {}

    res.json({
      success: true,
      data: { id: user.id, auth_token: user.auth_token, name: user.name, email: user.email, phone: user.phone, default_address_id: user.default_address_id, default_address: defaultAddress, wallet_balance: walletBalance, avatar: user.avatar, tax_number: user.tax_number },
      running_order: runningOrder,
      delivery_details: deliveryDetails,
    });
  } catch (err) {
    console.error('updateUserInfo error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.checkRunningOrder = async (req, res) => {
  try {
    const count = await Order.count({ where: { user_id: req.user.id, orderstatus_id: [1, 2, 3, 4, 7] } });
    res.json(count > 0);
  } catch (err) {
    res.status(500).json(false);
  }
};

exports.getWalletTransactions = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ where: { holder_type: 'App\\User', holder_id: req.user.id } });
    const balance = wallet ? parseFloat(wallet.balance) : 0;
    const transactions = wallet ? await Transaction.findAll({ where: { wallet_id: wallet.id }, order: [['id', 'DESC']] }) : [];
    res.json({ success: true, balance, transactions });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.changeAvatar = async (req, res) => {
  try {
    await req.user.update({ avatar: req.body.avatar });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.checkBan = async (req, res) => {
  res.json({ success: !!req.user.is_active });
};

exports.toggleFavorite = async (req, res) => {
  // Simplified: favorites table management
  try {
    const { sequelize } = require('../models');
    const userId = req.user.id;
    const restaurantId = req.body.id;
    const [existing] = await sequelize.query(
      'SELECT id FROM favorites WHERE user_id = ? AND favoriteable_id = ? AND favoriteable_type = ?',
      { replacements: [userId, restaurantId, 'App\\Restaurant'], type: sequelize.QueryTypes.SELECT }
    );
    if (existing) {
      await sequelize.query('DELETE FROM favorites WHERE id = ?', { replacements: [existing.id] });
    } else {
      await sequelize.query('INSERT INTO favorites (user_id, favoriteable_id, favoriteable_type, created_at, updated_at) VALUES (?,?,?,NOW(),NOW())', { replacements: [userId, restaurantId, 'App\\Restaurant'] });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.updateTaxNumber = async (req, res) => {
  try {
    await req.user.update({ tax_number: req.body.tax_number });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

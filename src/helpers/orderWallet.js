const { Wallet, Transaction } = require('../models');
const rules = require('./orderRules');

async function lockWallet(userId, t) {
  return Wallet.findOne({ where: { holder_type: 'App\\User', holder_id: userId }, transaction: t, lock: t.LOCK.UPDATE });
}

async function walletWithdraw(t, userId, amount, description) {
  const value = rules.toMoney(amount);
  if (value <= 0) return;
  const wallet = await lockWallet(userId, t);
  if (!wallet || rules.toMoney(wallet.balance) < value) {
    throw new rules.OrderValidationError('Saldo insuficiente en la billetera');
  }
  await wallet.decrement('balance', { by: value, transaction: t });
  await Transaction.create({ payable_type: 'App\\User', payable_id: userId, wallet_id: wallet.id, type: 'withdraw', amount: value, confirmed: true, meta: JSON.stringify({ description }) }, { transaction: t });
}

async function walletDeposit(t, userId, amount, description) {
  const value = rules.toMoney(amount);
  if (value <= 0) return;
  let wallet = await lockWallet(userId, t);
  if (!wallet) wallet = await Wallet.create({ holder_type: 'App\\User', holder_id: userId, balance: 0 }, { transaction: t });
  await wallet.increment('balance', { by: value, transaction: t });
  await Transaction.create({ payable_type: 'App\\User', payable_id: userId, wallet_id: wallet.id, type: 'deposit', amount: value, confirmed: true, meta: JSON.stringify({ description }) }, { transaction: t });
}

module.exports = { lockWallet, walletWithdraw, walletDeposit };

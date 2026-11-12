package com.quicklysolutions.multitienda.cliente

import com.quicklysolutions.multitienda.cliente.data.AvailabilityRow
import com.quicklysolutions.multitienda.cliente.data.Coupon
import com.quicklysolutions.multitienda.cliente.data.Order
import com.quicklysolutions.multitienda.cliente.data.RestaurantInfo
import com.quicklysolutions.multitienda.cliente.domain.AddResult
import com.quicklysolutions.multitienda.cliente.domain.CartAddon
import com.quicklysolutions.multitienda.cliente.domain.CartLine
import com.quicklysolutions.multitienda.cliente.domain.CartRules
import com.quicklysolutions.multitienda.cliente.domain.CouponEval
import com.quicklysolutions.multitienda.cliente.domain.MAX_QUANTITY
import com.quicklysolutions.multitienda.cliente.domain.OrderStatus
import com.quicklysolutions.multitienda.cliente.domain.Pricing
import com.quicklysolutions.multitienda.cliente.domain.WalletSplit
import com.quicklysolutions.multitienda.cliente.domain.fixed2
import com.quicklysolutions.multitienda.cliente.domain.matchAvailability
import com.quicklysolutions.multitienda.cliente.domain.repriceLines
import com.quicklysolutions.multitienda.cliente.domain.resolveImageUrl
import com.quicklysolutions.multitienda.cliente.domain.siteBaseFromApi
import com.quicklysolutions.multitienda.cliente.domain.toMoney
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PricingTest {
    private fun line(id: Int = 1, store: Int = 10, price: Double = 5.0, qty: Int = 1, addons: List<CartAddon> = emptyList()) =
        CartLine(itemId = id, restaurantId = store, name = "Item $id", basePrice = price, addons = addons, quantity = qty)

    @Test
    fun unitPriceUsesAddonsSumWhenPresent() {
        assertEquals(5.0, line(price = 5.0).unitPrice)
        val l = line(price = 5.0, addons = listOf(CartAddon(1, "Grande", 8.5), CartAddon(2, "Queso", 1.25)), qty = 2)
        assertEquals(9.75, l.unitPrice)
        assertEquals(19.5, l.lineTotal)
    }

    @Test
    fun subtotalRoundsToCents() {
        assertEquals(0.3, CartRules.subtotal(listOf(line(1, price = 0.1), line(2, price = 0.2))))
    }

    @Test
    fun sameItemWithDifferentAddonsAreDifferentLines() {
        val a = line(addons = listOf(CartAddon(1, "A", 1.0)))
        val b = line(addons = listOf(CartAddon(2, "B", 1.0)))
        val one = (CartRules.add(emptyList(), a) as AddResult.Added).lines
        val two = (CartRules.add(one, b) as AddResult.Added).lines
        assertEquals(2, two.size)
        val again = (CartRules.add(two, a) as AddResult.Added).lines
        assertEquals(2, again.size)
        assertEquals(2, again.first { it.key == a.key }.quantity)
    }

    @Test
    fun cartIsSingleStoreAndQuantityLimited() {
        val lines = (CartRules.add(emptyList(), line(1, store = 10)) as AddResult.Added).lines
        assertIs<AddResult.OtherStore>(CartRules.add(lines, line(2, store = 11)))
        assertIs<AddResult.Limit>(CartRules.add(listOf(line(1, qty = MAX_QUANTITY)), line(1)))
    }

    @Test
    fun decrementRemovesLineAtOne() {
        val l = line(qty = 2)
        val once = CartRules.decrement(listOf(l), l.key)
        assertEquals(1, once.single().quantity)
        assertTrue(CartRules.decrement(once, l.key).isEmpty())
    }

    private fun coupon(
        type: String = "PERCENTAGE", discount: Double = 10.0, max: Double = 0.0, min: Double = 0.0,
        store: Int? = null, count: Int = 0, maxCount: Int = 0,
    ) = Coupon(id = 1, code = "X", discount = discount, discountType = type, maxDiscount = max, minSubTotal = min, restaurantId = store, count = count, maxCount = maxCount)

    @Test
    fun couponRulesMirrorServer() {
        assertEquals(CouponEval.Ok(5.0), Pricing.evaluateCoupon(coupon(), 50.0, 10))
        assertEquals(CouponEval.Ok(3.0), Pricing.evaluateCoupon(coupon(max = 3.0), 50.0, 10))
        assertEquals(CouponEval.Ok(20.0), Pricing.evaluateCoupon(coupon("FIXED", 30.0), 20.0, 10))
        assertEquals(CouponEval.Fail("Pedido mínimo: 30.00"), Pricing.evaluateCoupon(coupon(min = 30.0), 20.0, 10))
        assertEquals(CouponEval.Fail("Cupón no válido para esta tienda"), Pricing.evaluateCoupon(coupon(store = 99), 20.0, 10))
        assertEquals(CouponEval.Fail("Cupón agotado"), Pricing.evaluateCoupon(coupon(count = 5, maxCount = 5), 20.0, 10))
        assertEquals(CouponEval.Fail("Cupón inválido"), Pricing.evaluateCoupon(coupon(discount = 150.0), 20.0, 10))
    }

    @Test
    fun totalAddsChargesAndNeverGoesNegative() {
        assertEquals(38.5, Pricing.total(40.0, 5.0, 2.0, 0.5, 1.0))
        assertEquals(0.0, Pricing.total(10.0, 10.0, 0.0, 0.0, 0.0))
    }

    @Test
    fun tipParsing() {
        assertEquals(0.0, Pricing.parseTip(""))
        assertEquals(2.5, Pricing.parseTip("2,5"))
        assertNull(Pricing.parseTip("-1"))
        assertNull(Pricing.parseTip("abc"))
        assertNull(Pricing.parseTip("10001"))
    }

    @Test
    fun walletSplit() {
        assertEquals(WalletSplit(20.0, 0.0), Pricing.splitWallet("WALLET", 20.0, 25.0, false))
        assertNull(Pricing.splitWallet("WALLET", 20.0, 10.0, false))
        assertEquals(WalletSplit(10.0, 10.0), Pricing.splitWallet("COD", 20.0, 10.0, true))
        assertEquals(WalletSplit(0.0, 20.0), Pricing.splitWallet("COD", 20.0, 10.0, false))
    }

    @Test
    fun allowedMethodsAlwaysIncludeWalletAndDefaultToCash() {
        assertEquals(listOf("COD", "WALLET"), Pricing.allowedMethods(emptyList()))
        assertEquals(listOf("YAPE", "WALLET"), Pricing.allowedMethods(listOf(" yape ")))
    }

    @Test
    fun deliveryChargeFixedDynamicFreeAndPickup() {
        val base = RestaurantInfo(id = 1, latitude = -12.0, longitude = -77.0, deliveryCharges = 4.0)
        assertEquals(4.0, Pricing.deliveryCharge(base, -12.0, -77.0, 20.0, 1))
        assertEquals(0.0, Pricing.deliveryCharge(base, -12.0, -77.0, 20.0, 2))
        assertEquals(0.0, Pricing.deliveryCharge(base, null, null, 20.0, 1))
        assertEquals(0.0, Pricing.deliveryCharge(base.copy(freeDeliverySubtotal = 20.0), -12.0, -77.0, 20.0, 1))
        val dyn = base.copy(deliveryChargeType = "DYNAMIC", baseDeliveryCharge = 3.0, baseDeliveryDistance = 1.0, extraDeliveryCharge = 1.0, extraDeliveryDistance = 1.0)
        assertEquals(3.0, Pricing.deliveryCharge(dyn, -12.0, -77.0, 5.0, 1))
        // ~2.2 km al norte: 3 + (2.22 - 1) / 1 * 1
        assertEquals(4.22, Pricing.deliveryCharge(dyn, -11.98, -77.0, 5.0, 1), 0.02)
    }

    private fun assertEquals(expected: Double, actual: Double, tolerance: Double) = assertTrue(kotlin.math.abs(expected - actual) <= tolerance, "esperado $expected, real $actual")

    @Test
    fun orderStatusRules() {
        assertTrue(OrderStatus.canCancel(1))
        assertTrue(OrderStatus.canCancel(10))
        assertFalse(OrderStatus.canCancel(2))
        assertFalse(OrderStatus.canCancel(5))
        assertTrue(OrderStatus.isRunning(12))
        assertFalse(OrderStatus.isRunning(5))
        assertFalse(OrderStatus.isRunning(6))
        assertTrue(OrderStatus.isTrackable(4))
        assertFalse(OrderStatus.isTrackable(2))
        assertTrue(OrderStatus.canRate(Order(statusId = 5)))
        assertFalse(OrderStatus.canRate(Order(statusId = 6)))
        assertEquals("En camino", OrderStatus.label(3))
    }

    @Test
    fun availabilityMatchingAndRepricing() {
        val lines = listOf(line(1, price = 5.0), line(2, price = 7.0), line(3, price = 9.0))
        // Producto 2 ya no existe (sin fila); producto 3 cambio de precio; producto 1 inactivo.
        val rows = listOf(AvailabilityRow(1, 5.0, false), AvailabilityRow(3, 9.5, true))
        val status = matchAvailability(lines, rows)
        assertFalse(status.getValue(lines[0].key).available)
        assertFalse(status.getValue(lines[1].key).available)
        assertTrue(status.getValue(lines[2].key).available)
        assertEquals(9.5, repriceLines(lines, status)[2].basePrice)
        assertEquals(7.0, repriceLines(lines, status)[1].basePrice)
    }

    @Test
    fun moneyFormatting() {
        assertEquals("12.50", fixed2(12.5))
        assertEquals("0.05", fixed2(0.05))
        assertEquals(1.01, toMoney(1.005 + 0.0049))
    }

    @Test
    fun imageUrls() {
        val site = siteBaseFromApi("https://x.com/multitienda/api")
        assertEquals("https://x.com/multitienda", site)
        assertEquals("https://x.com/multitienda/uploads/a.png", resolveImageUrl("/uploads/a.png", site))
        assertEquals("https://x.com/multitienda/uploads/a.png", resolveImageUrl("storage/a.png", site))
        assertEquals("https://cdn.com/a.png", resolveImageUrl("https://cdn.com/a.png", site))
        assertEquals("https://cdn.com/a.png", resolveImageUrl("//cdn.com/a.png", site))
        assertNull(resolveImageUrl("null", site))
        assertNull(resolveImageUrl(null, site))
        assertEquals("https://x.com", siteBaseFromApi("https://x.com/public/api"))
    }
}
